# SQLAlchemy declares __tablename__ and __table_args__ as untyped class attributes.
# pyright: reportUnannotatedClassAttribute=false, reportAny=false
"""Database schema (SQLAlchemy ORM). Migrations in backend/migrations are generated from it.

Every table carries ``user_id``, so each row's owner is explicit and row-level security can be
added without joins. Amounts are exact decimals (``NUMERIC(14, 2)``).
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    MetaData,
    Numeric,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, declared_attr, mapped_column, relationship

# Exact money: up to 999,999,999,999.99.
Money = Numeric(14, 2, asdecimal=True)

LIQUIDITIES = ("liquid", "non_liquid")


class Base(DeclarativeBase):
    # Deterministic constraint names, so migrations can refer to them.
    metadata = MetaData(
        naming_convention={
            "ix": "ix_%(column_0_label)s",
            "uq": "uq_%(table_name)s_%(column_0_N_name)s",
            "ck": "ck_%(table_name)s_%(constraint_name)s",
            "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
            "pk": "pk_%(table_name)s",
        }
    )


class Timestamps:
    """When a row was created and last changed (NFR-07, auditability)."""

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Owned(Timestamps):
    """A row that belongs to one user; deleting the user deletes it."""

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)

    @declared_attr
    def user_id(cls) -> Mapped[uuid.UUID]:
        return mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)


class User(Timestamps, Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    # Identity-provider subject (Cognito ``sub``); "local" until accounts exist.
    subject: Mapped[str] = mapped_column(String(255), unique=True)
    locale: Mapped[str | None] = mapped_column(String(16))
    currency: Mapped[str] = mapped_column(String(3), default="EUR", server_default="EUR")


class Category(Owned, Base):
    __tablename__ = "categories"
    __table_args__ = (UniqueConstraint("user_id", "name"),)

    name: Mapped[str] = mapped_column(String(100))
    excluded_from_disposable: Mapped[bool] = mapped_column(default=False, server_default="false")
    excluded_from_rebalancing: Mapped[bool] = mapped_column(default=False, server_default="false")


class Holding(Owned, Base):
    """An asset (account, property, vehicle, pension) whose value is recorded in snapshots."""

    __tablename__ = "holdings"
    __table_args__ = (CheckConstraint(f"liquidity IN {LIQUIDITIES}", name="liquidity"),)

    name: Mapped[str] = mapped_column(String(200))
    category_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("categories.id", ondelete="RESTRICT"), index=True)
    liquidity: Mapped[str] = mapped_column(String(20))
    closed_on: Mapped[date | None] = mapped_column(Date)

    category: Mapped[Category] = relationship()


class Liability(Owned, Base):
    """A debt. A mortgage is a liability linked to the property it finances."""

    __tablename__ = "liabilities"
    __table_args__ = (UniqueConstraint("holding_id"),)

    name: Mapped[str] = mapped_column(String(200))
    holding_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("holdings.id", ondelete="RESTRICT"))
    closed_on: Mapped[date | None] = mapped_column(Date)

    holding: Mapped[Holding | None] = relationship()


class Snapshot(Owned, Base):
    __tablename__ = "snapshots"
    __table_args__ = (UniqueConstraint("user_id", "date"),)

    date: Mapped[date] = mapped_column(Date)


class SnapshotValue(Owned, Base):
    """The amount of one holding or one liability on a snapshot date."""

    __tablename__ = "snapshot_values"
    __table_args__ = (
        UniqueConstraint("snapshot_id", "holding_id"),
        UniqueConstraint("snapshot_id", "liability_id"),
        CheckConstraint("(holding_id IS NULL) <> (liability_id IS NULL)", name="one_target"),
    )

    snapshot_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("snapshots.id", ondelete="CASCADE"), index=True)
    holding_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("holdings.id", ondelete="RESTRICT"), index=True)
    liability_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("liabilities.id", ondelete="RESTRICT"), index=True
    )
    amount: Mapped[Decimal] = mapped_column(Money)

    snapshot: Mapped[Snapshot] = relationship()
    holding: Mapped[Holding | None] = relationship()
    liability: Mapped[Liability | None] = relationship()


class RebalancingReserve(Owned, Base):
    """A fixed amount (emergency fund, down payment) filled before the pool is split."""

    __tablename__ = "rebalancing_reserves"
    __table_args__ = (UniqueConstraint("user_id", "name"), CheckConstraint("amount >= 0", name="amount"))

    name: Mapped[str] = mapped_column(String(100))
    amount: Mapped[Decimal] = mapped_column(Money)
    # Order in the settings; reserves outside the fill order are filled in this order, last.
    position: Mapped[int] = mapped_column()
    # Position in the fill order, if listed.
    fill_position: Mapped[int | None] = mapped_column()


class RebalancingReserveCategory(Owned, Base):
    """A category a reserve may draw from."""

    __tablename__ = "rebalancing_reserve_categories"
    __table_args__ = (UniqueConstraint("reserve_id", "category_id"),)

    reserve_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("rebalancing_reserves.id", ondelete="CASCADE"), index=True)
    category_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("categories.id", ondelete="RESTRICT"))
    position: Mapped[int] = mapped_column()

    reserve: Mapped[RebalancingReserve] = relationship()
    category: Mapped[Category] = relationship()


class RebalancingBucket(Owned, Base):
    """A share of the pool; a tree, with weights relative among siblings."""

    __tablename__ = "rebalancing_buckets"
    __table_args__ = (CheckConstraint("weight > 0", name="weight"),)

    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("rebalancing_buckets.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(100))
    weight: Mapped[float] = mapped_column(Float)
    position: Mapped[int] = mapped_column()
    fill_position: Mapped[int | None] = mapped_column()

    parent: Mapped[RebalancingBucket | None] = relationship(remote_side="RebalancingBucket.id")


class RebalancingBucketMember(Owned, Base):
    """A category, or one specific holding, that a leaf bucket may hold."""

    __tablename__ = "rebalancing_bucket_members"
    __table_args__ = (
        UniqueConstraint("bucket_id", "category_id"),
        UniqueConstraint("bucket_id", "holding_id"),
        CheckConstraint("(category_id IS NULL) <> (holding_id IS NULL)", name="one_target"),
    )

    bucket_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("rebalancing_buckets.id", ondelete="CASCADE"), index=True)
    category_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("categories.id", ondelete="RESTRICT"))
    holding_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("holdings.id", ondelete="RESTRICT"))
    position: Mapped[int] = mapped_column()

    bucket: Mapped[RebalancingBucket] = relationship()
    category: Mapped[Category | None] = relationship()
    holding: Mapped[Holding | None] = relationship()
