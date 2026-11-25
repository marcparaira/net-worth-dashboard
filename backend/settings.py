"""Settings: categories and rebalancing targets, read and changed through the API.

Rebalancing settings name holdings by their database id. Functions raise ``EntryError``
subclasses; the caller commits.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable

from pydantic import Field
from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from . import repository
from .db_models import (
    Category,
    Holding,
    RebalancingBucket,
    RebalancingBucketMember,
    RebalancingReserve,
    RebalancingReserveCategory,
)
from .entries import CategoryName, ConflictError, EntryError, NotFoundError
from .models import StrictModel
from .money import to_cents
from .rebalancing import Bucket, RebalancingConfig, build_rebalancing
from .schemas import RebalancingPayload

# --- Categories ------------------------------------------------------------------------------


class CategoryIn(StrictModel):
    name: CategoryName
    excluded_from_disposable: bool = False
    excluded_from_rebalancing: bool = False


class CategoryOut(StrictModel):
    id: uuid.UUID
    name: str
    excluded_from_disposable: bool
    excluded_from_rebalancing: bool
    holding_count: int
    # Referenced by a reserve or bucket in the rebalancing settings.
    in_rebalancing: bool


class MergeIn(StrictModel):
    into: uuid.UUID = Field(description="The category that takes over this one's holdings and references")


def _category(session: Session, owner: uuid.UUID, category_id: uuid.UUID) -> Category:
    category = session.scalar(select(Category).where(Category.id == category_id, Category.user_id == owner))
    if category is None:
        raise NotFoundError("category not found")
    return category


def list_categories(session: Session, owner: uuid.UUID) -> list[CategoryOut]:
    categories = session.scalars(select(Category).where(Category.user_id == owner).order_by(Category.name)).all()
    counts: dict[uuid.UUID, int] = {
        category_id: count
        for category_id, count in session.execute(
            select(Holding.category_id, func.count()).where(Holding.user_id == owner).group_by(Holding.category_id)
        ).all()
    }
    referenced = set(
        session.scalars(
            select(RebalancingReserveCategory.category_id).where(RebalancingReserveCategory.user_id == owner)
        )
    ) | set(
        session.scalars(
            select(RebalancingBucketMember.category_id).where(
                RebalancingBucketMember.user_id == owner, RebalancingBucketMember.category_id.is_not(None)
            )
        )
    )
    return [
        CategoryOut(
            id=c.id,
            name=c.name,
            excluded_from_disposable=c.excluded_from_disposable,
            excluded_from_rebalancing=c.excluded_from_rebalancing,
            holding_count=counts.get(c.id, 0),
            in_rebalancing=c.id in referenced,
        )
        for c in categories
    ]


def _category_out(session: Session, owner: uuid.UUID, category_id: uuid.UUID) -> CategoryOut:
    return next(c for c in list_categories(session, owner) if c.id == category_id)


def _name_taken(session: Session, owner: uuid.UUID, name: str, other_than: uuid.UUID | None) -> None:
    clash = session.scalar(
        select(Category.id).where(Category.user_id == owner, Category.name == name, Category.id != other_than)
    )
    if clash is not None:
        raise ConflictError(f"there is already a category called {name!r}; merge into it instead")


def create_category(session: Session, owner: uuid.UUID, data: CategoryIn) -> CategoryOut:
    _name_taken(session, owner, data.name, None)
    category = Category(id=uuid.uuid4(), user_id=owner, **data.model_dump())
    session.add(category)
    session.flush()
    return _category_out(session, owner, category.id)


def update_category(session: Session, owner: uuid.UUID, category_id: uuid.UUID, data: CategoryIn) -> CategoryOut:
    """Rename, or change which totals the category is left out of. Applies to every snapshot."""
    category = _category(session, owner, category_id)
    _name_taken(session, owner, data.name, category.id)
    category.name = data.name
    category.excluded_from_disposable = data.excluded_from_disposable
    category.excluded_from_rebalancing = data.excluded_from_rebalancing
    session.flush()
    return _category_out(session, owner, category.id)


def merge_category(session: Session, owner: uuid.UUID, category_id: uuid.UUID, data: MergeIn) -> CategoryOut:
    """Move every holding and rebalancing reference to ``into``, then delete this category."""
    source = _category(session, owner, category_id)
    target = _category(session, owner, data.into)
    if source.id == target.id:
        raise EntryError("a category cannot be merged into itself")
    _ = session.execute(update(Holding).where(Holding.category_id == source.id).values(category_id=target.id))

    # Reserves and buckets that already reference the target keep that reference only.
    reserves_with_target = select(RebalancingReserveCategory.reserve_id).where(
        RebalancingReserveCategory.category_id == target.id
    )
    _ = session.execute(
        delete(RebalancingReserveCategory).where(
            RebalancingReserveCategory.category_id == source.id,
            RebalancingReserveCategory.reserve_id.in_(reserves_with_target),
        )
    )
    _ = session.execute(
        update(RebalancingReserveCategory)
        .where(RebalancingReserveCategory.category_id == source.id)
        .values(category_id=target.id)
    )
    buckets_with_target = select(RebalancingBucketMember.bucket_id).where(
        RebalancingBucketMember.category_id == target.id
    )
    _ = session.execute(
        delete(RebalancingBucketMember).where(
            RebalancingBucketMember.category_id == source.id,
            RebalancingBucketMember.bucket_id.in_(buckets_with_target),
        )
    )
    _ = session.execute(
        update(RebalancingBucketMember)
        .where(RebalancingBucketMember.category_id == source.id)
        .values(category_id=target.id)
    )
    session.delete(source)
    session.flush()
    return _category_out(session, owner, target.id)


def delete_category(session: Session, owner: uuid.UUID, category_id: uuid.UUID) -> None:
    category = _category(session, owner, category_id)
    used = next(c for c in list_categories(session, owner) if c.id == category.id)
    if used.holding_count:
        raise ConflictError("holdings use this category; merge it into another instead")
    if used.in_rebalancing:
        raise ConflictError("the rebalancing settings use this category; remove it there first")
    session.delete(category)
    session.flush()


# --- Rebalancing settings --------------------------------------------------------------------


def _holdings(session: Session, owner: uuid.UUID) -> dict[str, Holding]:
    """The owner's holdings by id, as the settings name them."""
    return {str(h.id): h for h in session.scalars(select(Holding).where(Holding.user_id == owner))}


def _check_holdings(session: Session, owner: uuid.UUID, config: RebalancingConfig) -> None:
    owned = _holdings(session, owner)

    def check(bucket: Bucket) -> None:
        if any(h not in owned for h in bucket.holding_ids):
            raise EntryError(f"bucket {bucket.name!r} names a holding that does not exist")
        for child in bucket.children:
            check(child)

    for bucket in config.buckets:
        check(bucket)


def get_settings(session: Session, owner: uuid.UUID) -> RebalancingConfig | None:
    """The rebalancing settings; buckets name holdings by id."""
    return repository.load_rebalancing_config(session, owner)


def write_rebalancing(
    session: Session,
    owner: uuid.UUID,
    config: RebalancingConfig,
    category: Callable[[str], Category],
    holdings: dict[str, Holding],
) -> None:
    """Store settings; ``holdings`` maps the identifiers the buckets use to holdings, and
    ``category`` finds or creates a category by name."""
    fill_position = {name: index for index, name in enumerate(config.fill_order)}

    for name in config.excluded_categories:
        category(name).excluded_from_rebalancing = True

    for position, reserve in enumerate(config.reserves):
        try:
            amount = to_cents(reserve.amount)
        except ValueError as exc:
            raise EntryError(f"reserve {reserve.name!r}: {exc}") from exc
        row = RebalancingReserve(
            user_id=owner,
            name=reserve.name,
            amount=amount,
            position=position,
            fill_position=fill_position.get(reserve.name),
        )
        session.add(row)
        for index, name in enumerate(reserve.categories):
            session.add(RebalancingReserveCategory(user_id=owner, reserve=row, category=category(name), position=index))

    def add_bucket(bucket: Bucket, position: int, parent: RebalancingBucket | None) -> None:
        row = RebalancingBucket(
            user_id=owner,
            parent=parent,
            name=bucket.name,
            weight=bucket.weight,
            position=position,
            fill_position=None if bucket.children else fill_position.get(bucket.name),
        )
        session.add(row)
        for index, name in enumerate(bucket.categories):
            session.add(RebalancingBucketMember(user_id=owner, bucket=row, category=category(name), position=index))
        for index, key in enumerate(bucket.holding_ids, start=len(bucket.categories)):
            if key not in holdings:
                raise EntryError(f"bucket {bucket.name!r} names holding {key!r}, which does not exist")
            session.add(RebalancingBucketMember(user_id=owner, bucket=row, holding=holdings[key], position=index))
        for index, child in enumerate(bucket.children):
            add_bucket(child, index, row)

    for index, bucket in enumerate(config.buckets):
        add_bucket(bucket, index, None)


def delete_rebalancing(session: Session, owner: uuid.UUID) -> None:
    """Remove all rebalancing settings, including the categories' rebalancing exclusions."""
    for model in (RebalancingBucketMember, RebalancingReserveCategory, RebalancingBucket, RebalancingReserve):
        _ = session.execute(delete(model).where(model.user_id == owner))
    _ = session.execute(update(Category).where(Category.user_id == owner).values(excluded_from_rebalancing=False))


def _check_amounts(config: RebalancingConfig) -> None:
    for reserve in config.reserves:
        try:
            _ = to_cents(reserve.amount)
        except ValueError as exc:
            raise EntryError(f"reserve {reserve.name!r}: {exc}") from exc


def replace_settings(session: Session, owner: uuid.UUID, config: RebalancingConfig) -> RebalancingConfig:
    """Replace all rebalancing settings in the caller's transaction. Everything is validated
    before the current settings are touched."""
    _check_holdings(session, owner, config)
    _check_amounts(config)
    delete_rebalancing(session, owner)
    session.flush()
    existing = {c.name: c for c in session.scalars(select(Category).where(Category.user_id == owner))}

    def category(name: str) -> Category:
        if name not in existing:
            existing[name] = Category(user_id=owner, name=name)
            session.add(existing[name])
        return existing[name]

    write_rebalancing(session, owner, config, category, _holdings(session, owner))
    session.flush()
    settings = get_settings(session, owner)
    assert settings is not None
    return settings


def preview(session: Session, owner: uuid.UUID, config: RebalancingConfig) -> RebalancingPayload:
    """The rebalancing these settings would give, without saving them."""
    _check_amounts(config)
    records = repository.load_records(session, owner)
    if not records:
        raise NotFoundError("there are no snapshots to preview the settings with")
    _check_holdings(session, owner, config)
    return build_rebalancing(records, config)
