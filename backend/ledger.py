"""Turns raw records into dated balance-sheet totals and per-holding rows."""
from __future__ import annotations

from dataclasses import dataclass, fields
from datetime import date

from .config import EXCLUDED_CATEGORY, LIABILITY_CATEGORY
from .models import Holding, Liability, Record


@dataclass(frozen=True)
class Totals:
    liquid_assets: float
    non_liquid_assets: float
    liabilities: float
    net_worth: float
    disposable_net_value: float

    def lerp(self, other: Totals, t: float) -> Totals:
        """Linear interpolation of every field, ``t=0`` gives ``self`` and ``t=1`` gives ``other``."""
        return Totals(**{
            field.name: getattr(self, field.name) + (getattr(other, field.name) - getattr(self, field.name)) * t
            for field in fields(self)
        })


@dataclass(frozen=True)
class Snapshot:
    date: date
    totals: Totals


@dataclass(frozen=True)
class HoldingRow:
    """One holding (or standalone liability) on a given record date."""

    id: str
    date: date
    name: str
    category: str
    value: float
    mortgage_name: str | None
    mortgage_value: float

    @property
    def is_liability(self) -> bool:
        return self.category == LIABILITY_CATEGORY

    @property
    def equity_value(self) -> float:
        return -self.value if self.is_liability else self.value - self.mortgage_value

    @property
    def has_mortgage(self) -> bool:
        return bool(self.mortgage_name and self.mortgage_value)


def mortgage_value(holding: Holding) -> float:
    return holding.mortgage.value if holding.mortgage else 0.0


def standalone_liabilities(record: Record) -> list[Liability]:
    """Liabilities that are not already accounted for as a mortgage linked to a holding."""
    linked_names = {item.mortgage.name for item in record.holdings if item.mortgage and item.mortgage.name}
    return [item for item in record.liabilities.non_liquid if item.name not in linked_names]


def record_totals(record: Record) -> Totals:
    liquid_total = sum(item.value for item in record.assets.liquid)
    non_liquid_total = sum(item.value for item in record.assets.non_liquid)
    liabilities_total = sum(item.value for item in standalone_liabilities(record)) + sum(
        mortgage_value(item) for item in record.holdings
    )
    # Excluded holdings leave with their linked mortgage, i.e. only their equity is removed.
    excluded_equity = sum(
        item.value - mortgage_value(item) for item in record.holdings if item.category == EXCLUDED_CATEGORY
    )
    net_worth = liquid_total + non_liquid_total - liabilities_total
    return Totals(
        liquid_assets=liquid_total,
        non_liquid_assets=non_liquid_total,
        liabilities=liabilities_total,
        net_worth=net_worth,
        disposable_net_value=net_worth - excluded_equity,
    )


def record_rows(record: Record) -> list[HoldingRow]:
    holding_rows = [
        HoldingRow(
            id=item.id,
            date=record.date,
            name=item.name,
            category=item.category,
            value=item.value,
            mortgage_name=item.mortgage.name if item.mortgage and item.mortgage.name else None,
            mortgage_value=mortgage_value(item),
        )
        for item in record.holdings
    ]
    liability_rows = [
        HoldingRow(
            id=item.id,
            date=record.date,
            name=item.name,
            category=LIABILITY_CATEGORY,
            value=item.value,
            mortgage_name=None,
            mortgage_value=0.0,
        )
        for item in standalone_liabilities(record)
    ]
    return holding_rows + liability_rows


def process_records(records: list[Record]) -> tuple[list[Snapshot], list[HoldingRow]]:
    """Snapshots sorted by date and holding rows sorted by (date, category, name)."""
    snapshots = sorted((Snapshot(record.date, record_totals(record)) for record in records), key=lambda s: s.date)
    rows = sorted((row for record in records for row in record_rows(record)), key=lambda h: (h.date, h.category, h.name))
    return snapshots, rows
