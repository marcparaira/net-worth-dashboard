from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Literal, TypedDict, cast

import yaml
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError

from .models import Record

BASE_DIR = Path(__file__).resolve().parent
RECORDS_DIR = BASE_DIR / "records"
EXCLUDED_CATEGORY = "Immobles"
LIABILITY_CATEGORY = "Liability"

RateBasis = Literal["last_year", "overall"]

app = FastAPI(title="Net Worth Dashboard API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@dataclass(frozen=True)
class Totals:
    liquid_assets: float
    non_liquid_assets: float
    liabilities: float
    net_worth: float
    disposable_net_value: float

    def lerp(self, other: Totals, t: float) -> Totals:
        def mix(a: float, b: float) -> float:
            return a + (b - a) * t

        return Totals(
            mix(self.liquid_assets, other.liquid_assets),
            mix(self.non_liquid_assets, other.non_liquid_assets),
            mix(self.liabilities, other.liabilities),
            mix(self.net_worth, other.net_worth),
            mix(self.disposable_net_value, other.disposable_net_value),
        )


@dataclass(frozen=True)
class Snapshot:
    date: date
    totals: Totals


@dataclass(frozen=True)
class HoldingRow:
    id: str
    date: date
    name: str
    category: str
    value: float
    mortgage_name: str | None
    mortgage_value: float

    @property
    def equity_value(self) -> float:
        return -self.value if self.category == LIABILITY_CATEGORY else self.value - self.mortgage_value

    @property
    def has_mortgage(self) -> bool:
        return bool(self.mortgage_name and self.mortgage_value)


class Meta(TypedDict):
    latest_date: str
    excluded_category: str
    historical_growth_basis: RateBasis


class Summary(TypedDict):
    liquid_assets: float
    non_liquid_assets: float
    liabilities: float
    net_worth: float
    disposable_net_value: float
    net_worth_one_year_ago: float | None
    one_year_change: float | None
    one_year_change_pct: float | None
    monthly_disposable_increase: float
    last_year_monthly_rate: float
    overall_monthly_rate: float


class NetWorthChange(TypedDict):
    months: int
    label: str
    baseline_date: str | None
    latest_date: str
    change: float | None
    change_pct: float | None


class AverageMonthlyChanges(TypedDict):
    liquid_assets: float
    non_liquid_assets: float
    liabilities: float
    net_worth: float


class HistoryPoint(TypedDict):
    date: str
    liquid_assets: float
    non_liquid_assets: float
    liabilities: float
    net_worth: float
    disposable_net_value: float


class HoldingItem(TypedDict):
    id: str
    name: str
    category: str
    value: float
    mortgage_name: str | None
    mortgage_value: float
    equity_value: float
    has_mortgage: bool


class AllocationItem(HoldingItem):
    gross_value: float
    share: float


class AssetHistoryItem(TypedDict):
    id: str
    date: str
    name: str
    category: str
    value: float


class DashboardPayload(TypedDict):
    meta: Meta
    summary: Summary
    net_worth_changes: list[NetWorthChange]
    average_monthly_changes: AverageMonthlyChanges
    history: list[HistoryPoint]
    allocation: list[AllocationItem]
    latest_holdings: list[HoldingItem]
    asset_history: list[AssetHistoryItem]


def load_records() -> list[Record]:
    records: list[Record] = []
    for path in sorted(RECORDS_DIR.glob("*.y*ml")):
        with path.open("r", encoding="utf-8") as handle:
            data = cast(object, yaml.safe_load(handle))
        if data is None:
            continue
        try:
            records.append(Record.model_validate(data))
        except ValidationError as exc:
            raise ValueError(f"{path.name}: {exc}") from exc
    if not records:
        raise RuntimeError(f"No YAML records found in {RECORDS_DIR}")
    return records


def process_records(records: list[Record]) -> tuple[list[Snapshot], list[HoldingRow]]:
    snapshots: list[Snapshot] = []
    holding_rows: list[HoldingRow] = []

    for record in records:
        holdings = record.holdings
        linked_liability_names = {item.mortgage.name for item in holdings if item.mortgage and item.mortgage.name}
        liabilities = [item for item in record.liabilities.non_liquid if item.name not in linked_liability_names]

        liquid_total = sum(item.value for item in record.assets.liquid)
        non_liquid_total = sum(item.value for item in record.assets.non_liquid)
        liabilities_total = sum(item.value for item in liabilities) + sum(
            item.mortgage.value for item in holdings if item.mortgage
        )
        # Excluded holdings leave with their linked mortgage, i.e. only their equity is removed.
        excluded_equity = sum(
            item.value - (item.mortgage.value if item.mortgage else 0)
            for item in holdings
            if item.category == EXCLUDED_CATEGORY
        )
        net_worth = liquid_total + non_liquid_total - liabilities_total
        snapshots.append(Snapshot(record.date, Totals(
            liquid_assets=liquid_total,
            non_liquid_assets=non_liquid_total,
            liabilities=liabilities_total,
            net_worth=net_worth,
            disposable_net_value=net_worth - excluded_equity,
        )))

        for item in holdings:
            holding_rows.append(HoldingRow(
                id=item.id,
                date=record.date,
                name=item.name,
                category=item.category,
                value=item.value,
                mortgage_name=item.mortgage.name if item.mortgage and item.mortgage.name else None,
                mortgage_value=item.mortgage.value if item.mortgage else 0.0,
            ))
        for item in liabilities:
            holding_rows.append(HoldingRow(
                id=item.id,
                date=record.date,
                name=item.name,
                category=LIABILITY_CATEGORY,
                value=item.value,
                mortgage_name=None,
                mortgage_value=0.0,
            ))

    snapshots.sort(key=lambda s: s.date)
    holding_rows.sort(key=lambda h: (h.date, h.category, h.name))
    return snapshots, holding_rows


def month_end(year: int, month: int) -> date:
    return date(year, month, calendar.monthrange(year, month)[1])


def subtract_months(day: date, months: int) -> date:
    """Calendar month offset that clamps to the target month's last day."""
    index = day.year * 12 + day.month - 1 - months
    year, month = divmod(index, 12)
    return date(year, month + 1, min(day.day, calendar.monthrange(year, month + 1)[1]))


def monthly_summary(snapshots: list[Snapshot]) -> list[Totals]:
    """Last snapshot of each calendar month, linearly interpolating months without one."""
    if not snapshots:
        return []
    by_month: dict[tuple[int, int], Totals] = {(s.date.year, s.date.month): s.totals for s in snapshots}
    first, last = snapshots[0].date, snapshots[-1].date
    months = [
        divmod(index, 12)
        for index in range(first.year * 12 + first.month - 1, last.year * 12 + last.month)
    ]
    slots = [by_month.get((year, month + 1)) for year, month in months]
    known = [index for index, totals in enumerate(slots) if totals is not None]
    monthly: list[Totals] = []
    for index, totals in enumerate(slots):
        if totals is None:
            before = max(k for k in known if k < index)
            after = min(k for k in known if k > index)
            start, end = slots[before], slots[after]
            assert start is not None and end is not None
            totals = start.lerp(end, (index - before) / (after - before))
        monthly.append(totals)
    return monthly


def mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def diffs(values: list[float]) -> list[float]:
    return [b - a for a, b in zip(values, values[1:])]


def money(value: float) -> float:
    return round(value, 2)


def baseline_before(snapshots: list[Snapshot], target: date) -> Snapshot | None:
    candidates = [s for s in snapshots if s.date <= target]
    return candidates[-1] if candidates else None


def net_worth_changes(snapshots: list[Snapshot]) -> list[NetWorthChange]:
    latest = snapshots[-1]
    current = latest.totals.net_worth
    periods: list[NetWorthChange] = []
    for months, label in ((1, "Last month"), (3, "Last 3 months"), (12, "Last year")):
        baseline = baseline_before(snapshots, subtract_months(latest.date, months))
        previous = baseline.totals.net_worth if baseline else None
        change = current - previous if previous is not None else None
        periods.append({
            "months": months,
            "label": label,
            "baseline_date": baseline.date.isoformat() if baseline else None,
            "latest_date": latest.date.isoformat(),
            "change": money(change) if change is not None else None,
            "change_pct": round(change / abs(previous) * 100, 2) if previous and change is not None else None,
        })
    return periods


def holding_item(row: HoldingRow) -> HoldingItem:
    return {
        "id": row.id,
        "name": row.name,
        "category": row.category,
        "value": money(row.value),
        "mortgage_name": row.mortgage_name,
        "mortgage_value": money(row.mortgage_value),
        "equity_value": money(row.equity_value),
        "has_mortgage": row.has_mortgage,
    }


def calculate_payload(rate_basis: RateBasis = "last_year") -> DashboardPayload:
    snapshots, holdings = process_records(load_records())
    monthly = monthly_summary(snapshots)
    disposable_increases = diffs([m.disposable_net_value for m in monthly])
    last_year_rate = mean(disposable_increases[-12:])
    overall_rate = mean(disposable_increases)
    chosen_rate = last_year_rate if rate_basis == "last_year" else overall_rate

    latest = snapshots[-1]
    prior = baseline_before(snapshots, subtract_months(latest.date, 12))

    latest_holdings = [h for h in holdings if h.date == latest.date]
    assets_only = [h for h in latest_holdings if h.category != LIABILITY_CATEGORY]
    asset_equity_total = sum(h.equity_value for h in assets_only)
    allocation: list[AllocationItem] = [
        {
            **holding_item(row),
            # Allocation charts represent the portion of each asset that is owned.
            # Keep the gross value available for mortgage context in the legend.
            "value": money(row.equity_value),
            "gross_value": money(row.value),
            "share": round(row.equity_value / asset_equity_total * 100, 2) if asset_equity_total else 0,
        }
        for row in sorted(assets_only, key=lambda h: h.equity_value, reverse=True)
    ]

    latest_net_worth = latest.totals.net_worth
    prior_net_worth = prior.totals.net_worth if prior else None

    return {
        "meta": {
            "latest_date": latest.date.isoformat(),
            "excluded_category": EXCLUDED_CATEGORY,
            "historical_growth_basis": rate_basis,
        },
        "summary": {
            "liquid_assets": money(latest.totals.liquid_assets),
            "non_liquid_assets": money(latest.totals.non_liquid_assets),
            "liabilities": money(latest.totals.liabilities),
            "net_worth": money(latest_net_worth),
            "disposable_net_value": money(latest.totals.disposable_net_value),
            "net_worth_one_year_ago": money(prior_net_worth) if prior_net_worth is not None else None,
            "one_year_change": money(latest_net_worth - prior_net_worth) if prior_net_worth is not None else None,
            "one_year_change_pct": round((latest_net_worth / prior_net_worth - 1) * 100, 2) if prior_net_worth else None,
            "monthly_disposable_increase": money(chosen_rate),
            "last_year_monthly_rate": money(last_year_rate),
            "overall_monthly_rate": money(overall_rate),
        },
        "net_worth_changes": net_worth_changes(snapshots),
        "average_monthly_changes": {
            "liquid_assets": money(mean(diffs([m.liquid_assets for m in monthly]))),
            "non_liquid_assets": money(mean(diffs([m.non_liquid_assets for m in monthly]))),
            "liabilities": money(mean(diffs([m.liabilities for m in monthly]))),
            "net_worth": money(mean(diffs([m.net_worth for m in monthly]))),
        },
        "history": [
            {
                "date": s.date.isoformat(),
                "liquid_assets": money(s.totals.liquid_assets),
                "non_liquid_assets": money(s.totals.non_liquid_assets),
                "liabilities": money(s.totals.liabilities),
                "net_worth": money(s.totals.net_worth),
                "disposable_net_value": money(s.totals.disposable_net_value),
            }
            for s in snapshots
        ],
        "allocation": allocation,
        "latest_holdings": [
            holding_item(row)
            for row in sorted(sorted(latest_holdings, key=lambda h: h.value, reverse=True), key=lambda h: h.category)
        ],
        "asset_history": [
            {
                "id": row.id,
                "date": row.date.isoformat(),
                "name": row.name,
                "category": row.category,
                "value": money(row.value),
            }
            for row in holdings
        ],
    }


@app.get("/api/dashboard")
def dashboard(rate_basis: RateBasis = "last_year") -> DashboardPayload:
    return calculate_payload(rate_basis=rate_basis)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}

