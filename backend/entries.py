"""Data entry: holdings, liabilities, and snapshots, created and changed through the API.

Functions take a session and the owner's id, and every query is scoped to that owner. They
raise ``EntryError`` subclasses, which the routes turn into HTTP responses; the caller commits.
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import date
from decimal import Decimal
from typing import Annotated, Literal, Self, cast

from pydantic import Field, PlainSerializer, StringConstraints, model_validator
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from .config import EXCLUDED_CATEGORY
from .db_models import (
    Category,
    Holding,
    Liability,
    RebalancingBucketMember,
    Snapshot,
    SnapshotValue,
)
from .models import StrictModel as Strict

# Amounts: exact, at most two decimals, never negative (debts are liabilities, not negative
# assets). Sent to the browser as JSON numbers.
Amount = Annotated[
    Decimal,
    Field(ge=0, max_digits=14, decimal_places=2),
    PlainSerializer(float, return_type=float, when_used="json"),
]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
CategoryName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
Liquidity = Literal["liquid", "non_liquid"]


class EntryError(Exception):
    """A request the data cannot accept; ``status`` is the HTTP status to answer with."""

    status: int = 422

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message: str = message


class NotFoundError(EntryError):
    status: int = 404


class ConflictError(EntryError):
    status: int = 409


# --- Request and response models -------------------------------------------------------------


class HoldingIn(Strict):
    name: Name
    category: CategoryName
    liquidity: Liquidity
    closed_on: date | None = None


class HoldingOut(Strict):
    id: uuid.UUID
    name: str
    category: str
    liquidity: Liquidity
    closed_on: date | None
    mortgage_id: uuid.UUID | None
    latest_amount: Amount | None
    latest_date: date | None
    value_count: int
    in_rebalancing: bool


class LiabilityIn(Strict):
    name: Name
    # The property this liability finances (a mortgage), if any.
    holding_id: uuid.UUID | None = None
    closed_on: date | None = None


class LiabilityOut(Strict):
    id: uuid.UUID
    name: str
    holding_id: uuid.UUID | None
    closed_on: date | None
    latest_amount: Amount | None
    latest_date: date | None
    value_count: int


class SnapshotValueIn(Strict):
    holding_id: uuid.UUID | None = None
    liability_id: uuid.UUID | None = None
    amount: Amount

    @model_validator(mode="after")
    def _one_target(self) -> Self:
        if (self.holding_id is None) == (self.liability_id is None):
            raise ValueError("each value needs either a holding_id or a liability_id")
        return self


class SnapshotIn(Strict):
    date: date
    values: list[SnapshotValueIn] = Field(min_length=1)

    @model_validator(mode="after")
    def _not_in_the_future(self) -> Self:
        if self.date > date.today():
            raise ValueError("the snapshot date cannot be in the future")
        return self


class SnapshotValueOut(Strict):
    holding_id: uuid.UUID | None
    liability_id: uuid.UUID | None
    amount: Amount


class SnapshotOut(Strict):
    id: uuid.UUID
    date: date
    values: list[SnapshotValueOut]


class SnapshotDetail(SnapshotOut):
    # The snapshot just before this one, to compare against.
    previous: SnapshotOut | None


class SnapshotSummary(Strict):
    id: uuid.UUID
    date: date
    net_worth: float
    change: float | None
    value_count: int


# --- Categories ------------------------------------------------------------------------------


def category_for(session: Session, owner: uuid.UUID, name: str) -> Category:
    """The owner's category with this name, created if it does not exist."""
    category = session.scalar(select(Category).where(Category.user_id == owner, Category.name == name))
    if category is None:
        category = Category(user_id=owner, name=name, excluded_from_disposable=name == EXCLUDED_CATEGORY)
        session.add(category)
        session.flush()
    return category


# --- Holdings and liabilities ----------------------------------------------------------------


def _latest_values(session: Session, owner: uuid.UUID, column: str) -> dict[uuid.UUID, tuple[Decimal, date, int]]:
    """For each holding (or liability): its amount in the latest snapshot that has it, that
    snapshot's date, and how many snapshots have it."""
    target = SnapshotValue.holding_id if column == "holding" else SnapshotValue.liability_id
    rows = session.execute(
        select(target, SnapshotValue.amount, Snapshot.date)
        .join(Snapshot, SnapshotValue.snapshot_id == Snapshot.id)
        .where(SnapshotValue.user_id == owner, target.is_not(None))
        .order_by(Snapshot.date)
    ).all()
    latest: dict[uuid.UUID, tuple[Decimal, date, int]] = {}
    for target_id, amount, day in rows:
        if target_id is None:  # excluded by the query; narrows the type
            continue
        count = latest[target_id][2] + 1 if target_id in latest else 1
        latest[target_id] = (amount, day, count)
    return latest


def list_holdings(session: Session, owner: uuid.UUID) -> list[HoldingOut]:
    holdings = session.scalars(select(Holding).where(Holding.user_id == owner).order_by(Holding.name)).all()
    categories = {c.id: c.name for c in session.scalars(select(Category).where(Category.user_id == owner))}
    mortgages = {
        lb.holding_id: lb.id
        for lb in session.scalars(
            select(Liability).where(Liability.user_id == owner, Liability.holding_id.is_not(None))
        )
    }
    in_rebalancing = set(
        session.scalars(
            select(RebalancingBucketMember.holding_id).where(
                RebalancingBucketMember.user_id == owner, RebalancingBucketMember.holding_id.is_not(None)
            )
        )
    )
    latest = _latest_values(session, owner, "holding")
    return [
        HoldingOut(
            id=h.id,
            name=h.name,
            category=categories[h.category_id],
            liquidity=cast(Liquidity, h.liquidity),
            closed_on=h.closed_on,
            mortgage_id=mortgages.get(h.id),
            latest_amount=latest[h.id][0] if h.id in latest else None,
            latest_date=latest[h.id][1] if h.id in latest else None,
            value_count=latest[h.id][2] if h.id in latest else 0,
            in_rebalancing=h.id in in_rebalancing,
        )
        for h in holdings
    ]


def _holding(session: Session, owner: uuid.UUID, holding_id: uuid.UUID) -> Holding:
    holding = session.scalar(select(Holding).where(Holding.id == holding_id, Holding.user_id == owner))
    if holding is None:
        raise NotFoundError("holding not found")
    return holding


def _liability(session: Session, owner: uuid.UUID, liability_id: uuid.UUID) -> Liability:
    liability = session.scalar(select(Liability).where(Liability.id == liability_id, Liability.user_id == owner))
    if liability is None:
        raise NotFoundError("liability not found")
    return liability


def _holding_out(session: Session, owner: uuid.UUID, holding_id: uuid.UUID) -> HoldingOut:
    return next(h for h in list_holdings(session, owner) if h.id == holding_id)


def create_holding(session: Session, owner: uuid.UUID, data: HoldingIn) -> HoldingOut:
    holding_id = uuid.uuid4()
    session.add(
        Holding(
            id=holding_id,
            user_id=owner,
            name=data.name,
            category=category_for(session, owner, data.category),
            liquidity=data.liquidity,
            closed_on=data.closed_on,
        )
    )
    session.flush()
    return _holding_out(session, owner, holding_id)


def update_holding(session: Session, owner: uuid.UUID, holding_id: uuid.UUID, data: HoldingIn) -> HoldingOut:
    """Rename, recategorise, change liquidity, close, or reopen. Applies to every snapshot."""
    holding = _holding(session, owner, holding_id)
    holding.name = data.name
    holding.category = category_for(session, owner, data.category)
    holding.liquidity = data.liquidity
    holding.closed_on = data.closed_on
    session.flush()
    return _holding_out(session, owner, holding_id)


def delete_holding(session: Session, owner: uuid.UUID, holding_id: uuid.UUID) -> None:
    """Only a holding without history can be deleted; one with history should be closed."""
    holding = _holding(session, owner, holding_id)
    if session.scalar(select(func.count()).where(SnapshotValue.holding_id == holding.id)):
        raise ConflictError("this holding has values in snapshots; close it instead of deleting it")
    if session.scalar(select(func.count()).where(Liability.holding_id == holding.id)):
        raise ConflictError("this holding has a mortgage; delete or unlink the mortgage first")
    if session.scalar(select(func.count()).where(RebalancingBucketMember.holding_id == holding.id)):
        raise ConflictError("this holding is used in the rebalancing settings")
    session.delete(holding)
    session.flush()


def list_liabilities(session: Session, owner: uuid.UUID) -> list[LiabilityOut]:
    liabilities = session.scalars(select(Liability).where(Liability.user_id == owner).order_by(Liability.name)).all()
    latest = _latest_values(session, owner, "liability")
    return [
        LiabilityOut(
            id=lb.id,
            name=lb.name,
            holding_id=lb.holding_id,
            closed_on=lb.closed_on,
            latest_amount=latest[lb.id][0] if lb.id in latest else None,
            latest_date=latest[lb.id][1] if lb.id in latest else None,
            value_count=latest[lb.id][2] if lb.id in latest else 0,
        )
        for lb in liabilities
    ]


def _link_mortgage(session: Session, owner: uuid.UUID, liability_id: uuid.UUID | None, holding_id: uuid.UUID) -> None:
    holding = _holding(session, owner, holding_id)
    other = session.scalar(select(Liability).where(Liability.holding_id == holding.id, Liability.id != liability_id))
    if other is not None:
        raise ConflictError(f"{holding.name} already has a mortgage ({other.name})")


def create_liability(session: Session, owner: uuid.UUID, data: LiabilityIn) -> LiabilityOut:
    if data.holding_id is not None:
        _link_mortgage(session, owner, None, data.holding_id)
    liability_id = uuid.uuid4()
    session.add(
        Liability(
            id=liability_id,
            user_id=owner,
            name=data.name,
            holding_id=data.holding_id,
            closed_on=data.closed_on,
        )
    )
    session.flush()
    return next(lb for lb in list_liabilities(session, owner) if lb.id == liability_id)


def update_liability(session: Session, owner: uuid.UUID, liability_id: uuid.UUID, data: LiabilityIn) -> LiabilityOut:
    """Rename, link to or unlink from a property, close, or reopen."""
    liability = _liability(session, owner, liability_id)
    if data.holding_id is not None and data.holding_id != liability.holding_id:
        _link_mortgage(session, owner, liability.id, data.holding_id)
    liability.name = data.name
    liability.holding_id = data.holding_id
    liability.closed_on = data.closed_on
    session.flush()
    return next(lb for lb in list_liabilities(session, owner) if lb.id == liability_id)


def delete_liability(session: Session, owner: uuid.UUID, liability_id: uuid.UUID) -> None:
    liability = _liability(session, owner, liability_id)
    if session.scalar(select(func.count()).where(SnapshotValue.liability_id == liability.id)):
        raise ConflictError("this liability has values in snapshots; close it instead of deleting it")
    session.delete(liability)
    session.flush()


# --- Snapshots -------------------------------------------------------------------------------


def _snapshot(session: Session, owner: uuid.UUID, snapshot_id: uuid.UUID) -> Snapshot:
    snapshot = session.scalar(select(Snapshot).where(Snapshot.id == snapshot_id, Snapshot.user_id == owner))
    if snapshot is None:
        raise NotFoundError("snapshot not found")
    return snapshot


def _snapshot_out(session: Session, snapshot: Snapshot) -> SnapshotOut:
    values = session.scalars(select(SnapshotValue).where(SnapshotValue.snapshot_id == snapshot.id)).all()
    return SnapshotOut(
        id=snapshot.id,
        date=snapshot.date,
        values=[
            SnapshotValueOut(holding_id=v.holding_id, liability_id=v.liability_id, amount=v.amount) for v in values
        ],
    )


def list_snapshots(session: Session, owner: uuid.UUID) -> list[SnapshotSummary]:
    """Newest first, with net worth and the change from the previous snapshot."""
    snapshots = session.scalars(select(Snapshot).where(Snapshot.user_id == owner).order_by(Snapshot.date)).all()
    totals: dict[uuid.UUID, Decimal] = defaultdict(Decimal)
    counts: dict[uuid.UUID, int] = defaultdict(int)
    for value in session.scalars(select(SnapshotValue).where(SnapshotValue.user_id == owner)):
        sign = 1 if value.holding_id is not None else -1
        totals[value.snapshot_id] += sign * value.amount
        counts[value.snapshot_id] += 1
    summaries: list[SnapshotSummary] = []
    previous: Decimal | None = None
    for snapshot in snapshots:
        net_worth = totals[snapshot.id]
        summaries.append(
            SnapshotSummary(
                id=snapshot.id,
                date=snapshot.date,
                net_worth=float(net_worth),
                change=None if previous is None else float(net_worth - previous),
                value_count=counts[snapshot.id],
            )
        )
        previous = net_worth
    return summaries[::-1]


def get_snapshot(session: Session, owner: uuid.UUID, snapshot_id: uuid.UUID) -> SnapshotDetail:
    snapshot = _snapshot(session, owner, snapshot_id)
    previous = session.scalar(
        select(Snapshot)
        .where(Snapshot.user_id == owner, Snapshot.date < snapshot.date)
        .order_by(Snapshot.date.desc())
        .limit(1)
    )
    out = _snapshot_out(session, snapshot)
    return SnapshotDetail(
        id=out.id,
        date=out.date,
        values=out.values,
        previous=_snapshot_out(session, previous) if previous is not None else None,
    )


def _check_values(session: Session, owner: uuid.UUID, values: list[SnapshotValueIn]) -> None:
    holding_ids = [v.holding_id for v in values if v.holding_id is not None]
    liability_ids = [v.liability_id for v in values if v.liability_id is not None]
    if len(holding_ids) != len(set(holding_ids)) or len(liability_ids) != len(set(liability_ids)):
        raise EntryError("a holding or liability appears twice in the snapshot")
    owned_holdings = set(
        session.scalars(select(Holding.id).where(Holding.user_id == owner, Holding.id.in_(holding_ids)))
    )
    liabilities = {
        lb.id: lb
        for lb in session.scalars(select(Liability).where(Liability.user_id == owner, Liability.id.in_(liability_ids)))
    }
    if set(holding_ids) - owned_holdings or set(liability_ids) - set(liabilities):
        raise EntryError("the snapshot refers to a holding or liability that does not exist")
    for liability in liabilities.values():
        if liability.holding_id is not None and liability.holding_id not in owned_holdings:
            raise EntryError(f"the mortgage {liability.name!r} needs a value for its property in the same snapshot")


def _check_date(session: Session, owner: uuid.UUID, day: date, snapshot_id: uuid.UUID | None) -> None:
    clash = session.scalar(
        select(Snapshot.id).where(Snapshot.user_id == owner, Snapshot.date == day, Snapshot.id != snapshot_id)
    )
    if clash is not None:
        raise ConflictError(f"there is already a snapshot on {day.isoformat()}")


def _write_values(session: Session, owner: uuid.UUID, snapshot: Snapshot, values: list[SnapshotValueIn]) -> None:
    for value in values:
        session.add(
            SnapshotValue(
                user_id=owner,
                snapshot_id=snapshot.id,
                holding_id=value.holding_id,
                liability_id=value.liability_id,
                amount=value.amount,
            )
        )


def create_snapshot(session: Session, owner: uuid.UUID, data: SnapshotIn) -> SnapshotDetail:
    _check_date(session, owner, data.date, None)
    _check_values(session, owner, data.values)
    snapshot = Snapshot(id=uuid.uuid4(), user_id=owner, date=data.date)
    session.add(snapshot)
    session.flush()
    _write_values(session, owner, snapshot, data.values)
    session.flush()
    return get_snapshot(session, owner, snapshot.id)


def update_snapshot(session: Session, owner: uuid.UUID, snapshot_id: uuid.UUID, data: SnapshotIn) -> SnapshotDetail:
    """Change the date and replace all values."""
    snapshot = _snapshot(session, owner, snapshot_id)
    _check_date(session, owner, data.date, snapshot.id)
    _check_values(session, owner, data.values)
    snapshot.date = data.date
    _ = session.execute(delete(SnapshotValue).where(SnapshotValue.snapshot_id == snapshot.id))
    _write_values(session, owner, snapshot, data.values)
    session.flush()
    return get_snapshot(session, owner, snapshot.id)


def delete_snapshot(session: Session, owner: uuid.UUID, snapshot_id: uuid.UUID) -> None:
    session.delete(_snapshot(session, owner, snapshot_id))
    session.flush()
