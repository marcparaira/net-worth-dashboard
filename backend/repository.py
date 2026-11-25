"""Database access. Every query is scoped to one user.

Reads rebuild the same validated models the YAML loaders produced (``Record`` and
``RebalancingConfig``), so the analytics work unchanged on database data.
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import LOCAL_USER_SUBJECT
from .db_models import (
    Category,
    Holding,
    Liability,
    RebalancingBucket,
    RebalancingBucketMember,
    RebalancingReserve,
    RebalancingReserveCategory,
    Snapshot,
    SnapshotValue,
    User,
)
from .models import Assets, Liabilities, Mortgage, Record
from .models import Holding as HoldingModel
from .models import Liability as LiabilityModel
from .rebalancing import Bucket, RebalancingConfig, Reserve


def find_user(session: Session, subject: str = LOCAL_USER_SUBJECT) -> User | None:
    return session.scalar(select(User).where(User.subject == subject))


def get_or_create_user(session: Session, subject: str = LOCAL_USER_SUBJECT) -> User:
    user = find_user(session, subject)
    if user is None:
        user = User(subject=subject)
        session.add(user)
        session.flush()
    return user


def disposable_exclusions(session: Session, user_id: uuid.UUID) -> frozenset[str]:
    """Names of the user's categories left out of the disposable net value."""
    return frozenset(
        session.scalars(
            select(Category.name).where(Category.user_id == user_id, Category.excluded_from_disposable.is_(True))
        )
    )


def amount(value: Decimal) -> float:
    """Exact stored amount as the float the analytics models use."""
    return float(value)


def load_records(session: Session, user_id: uuid.UUID) -> list[Record]:
    """All of a user's snapshots, as records ordered by date."""
    categories = {c.id: c.name for c in session.scalars(select(Category).where(Category.user_id == user_id))}
    holdings = {h.id: h for h in session.scalars(select(Holding).where(Holding.user_id == user_id))}
    liabilities = {lb.id: lb for lb in session.scalars(select(Liability).where(Liability.user_id == user_id))}
    snapshots = session.scalars(select(Snapshot).where(Snapshot.user_id == user_id).order_by(Snapshot.date)).all()

    holding_values: dict[uuid.UUID, dict[uuid.UUID, Decimal]] = defaultdict(dict)
    liability_values: dict[uuid.UUID, dict[uuid.UUID, Decimal]] = defaultdict(dict)
    for value in session.scalars(select(SnapshotValue).where(SnapshotValue.user_id == user_id)):
        if value.holding_id is not None:
            holding_values[value.snapshot_id][value.holding_id] = value.amount
        elif value.liability_id is not None:
            liability_values[value.snapshot_id][value.liability_id] = value.amount

    mortgage_of = {lb.holding_id: lb for lb in liabilities.values() if lb.holding_id is not None}
    return [
        _record(
            snapshot.date,
            holding_values[snapshot.id],
            liability_values[snapshot.id],
            holdings,
            liabilities,
            categories,
            mortgage_of,
        )
        for snapshot in snapshots
    ]


def _record(
    day: date,
    holding_values: dict[uuid.UUID, Decimal],
    liability_values: dict[uuid.UUID, Decimal],
    holdings: dict[uuid.UUID, Holding],
    liabilities: dict[uuid.UUID, Liability],
    categories: dict[uuid.UUID, str],
    mortgage_of: dict[uuid.UUID, Liability],
) -> Record:
    liquid: list[HoldingModel] = []
    non_liquid: list[HoldingModel] = []
    for holding_id, value in sorted(holding_values.items(), key=lambda item: holdings[item[0]].name):
        holding = holdings[holding_id]
        mortgage = mortgage_of.get(holding_id)
        mortgage_value = liability_values.get(mortgage.id) if mortgage else None
        item = HoldingModel(
            id=str(holding.id),
            name=holding.name,
            value=amount(value),
            category=categories[holding.category_id],
            mortgage=(
                Mortgage(id=str(mortgage.id), name=mortgage.name, value=amount(mortgage_value))
                if mortgage is not None and mortgage_value is not None
                else None
            ),
        )
        (liquid if holding.liquidity == "liquid" else non_liquid).append(item)

    standalone = [
        LiabilityModel(id=str(liability_id), name=liabilities[liability_id].name, value=amount(value))
        for liability_id, value in sorted(liability_values.items(), key=lambda item: liabilities[item[0]].name)
        if liabilities[liability_id].holding_id is None
    ]
    return Record(
        date=day,
        assets=Assets(liquid=liquid, non_liquid=non_liquid),
        liabilities=Liabilities(non_liquid=standalone),
    )


def load_rebalancing_config(session: Session, user_id: uuid.UUID) -> RebalancingConfig | None:
    """The user's rebalancing settings, or None if they have none."""
    categories = {c.id: c for c in session.scalars(select(Category).where(Category.user_id == user_id))}
    reserves = session.scalars(
        select(RebalancingReserve).where(RebalancingReserve.user_id == user_id).order_by(RebalancingReserve.position)
    ).all()
    buckets = session.scalars(
        select(RebalancingBucket).where(RebalancingBucket.user_id == user_id).order_by(RebalancingBucket.position)
    ).all()
    if not buckets:
        return None

    reserve_categories: dict[uuid.UUID, list[str]] = defaultdict(list)
    for link in session.scalars(
        select(RebalancingReserveCategory)
        .where(RebalancingReserveCategory.user_id == user_id)
        .order_by(RebalancingReserveCategory.position)
    ):
        reserve_categories[link.reserve_id].append(categories[link.category_id].name)

    member_categories: dict[uuid.UUID, list[str]] = defaultdict(list)
    member_holdings: dict[uuid.UUID, list[str]] = defaultdict(list)
    for member in session.scalars(
        select(RebalancingBucketMember)
        .where(RebalancingBucketMember.user_id == user_id)
        .order_by(RebalancingBucketMember.position)
    ):
        if member.category_id is not None:
            member_categories[member.bucket_id].append(categories[member.category_id].name)
        elif member.holding_id is not None:
            member_holdings[member.bucket_id].append(str(member.holding_id))

    children: dict[uuid.UUID | None, list[RebalancingBucket]] = defaultdict(list)
    for bucket in buckets:
        children[bucket.parent_id].append(bucket)

    def build(bucket: RebalancingBucket) -> Bucket:
        return Bucket(
            name=bucket.name,
            weight=bucket.weight,
            categories=member_categories[bucket.id],
            holding_ids=member_holdings[bucket.id],
            children=[build(child) for child in children[bucket.id]],
        )

    fill_steps = [(r.fill_position, r.name) for r in reserves if r.fill_position is not None]
    fill_steps += [(b.fill_position, b.name) for b in buckets if b.fill_position is not None]
    return RebalancingConfig(
        excluded_categories=sorted(c.name for c in categories.values() if c.excluded_from_rebalancing),
        reserves=[Reserve(name=r.name, amount=amount(r.amount), categories=reserve_categories[r.id]) for r in reserves],
        buckets=[build(bucket) for bucket in children[None]],
        fill_order=[name for _, name in sorted(fill_steps)],
    )
