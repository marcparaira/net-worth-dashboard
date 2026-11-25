"""Builds the dashboard payload from processed records, one section at a time."""

from __future__ import annotations

from collections.abc import Set as AbstractSet

from .config import RateBasis
from .ledger import DEFAULT_EXCLUDED, HoldingRow, Snapshot, Totals, process_records
from .models import Record
from .schemas import (
    AllocationItem,
    AssetHistoryItem,
    AverageMonthlyChanges,
    DashboardPayload,
    HistoryPoint,
    HoldingItem,
    NetWorthChange,
    Summary,
)
from .timeseries import baseline_before, diffs, mean, monthly_summary, subtract_months

NET_WORTH_PERIODS = ((1, "Last month"), (3, "Last 3 months"), (12, "Last year"))


def money(value: float) -> float:
    return round(value, 2)


def optional_money(value: float | None) -> float | None:
    return money(value) if value is not None else None


def percent(part: float, whole: float) -> float | None:
    return round(part / whole * 100, 2) if whole else None


def summary(snapshots: list[Snapshot], monthly: list[Totals], rate_basis: RateBasis) -> Summary:
    disposable_increases = diffs([m.disposable_net_value for m in monthly])
    last_year_rate = mean(disposable_increases[-12:])
    overall_rate = mean(disposable_increases)
    chosen_rate = last_year_rate if rate_basis == "last_year" else overall_rate

    latest = snapshots[-1]
    totals = latest.totals
    prior = baseline_before(snapshots, subtract_months(latest.date, 12))
    prior_net_worth = prior.totals.net_worth if prior else None
    one_year_change = totals.net_worth - prior_net_worth if prior_net_worth is not None else None

    return {
        "liquid_assets": money(totals.liquid_assets),
        "non_liquid_assets": money(totals.non_liquid_assets),
        "liabilities": money(totals.liabilities),
        "net_worth": money(totals.net_worth),
        "disposable_net_value": money(totals.disposable_net_value),
        "net_worth_one_year_ago": optional_money(prior_net_worth),
        "one_year_change": optional_money(one_year_change),
        "one_year_change_pct": round((totals.net_worth / prior_net_worth - 1) * 100, 2) if prior_net_worth else None,
        "monthly_disposable_increase": money(chosen_rate),
        "last_year_monthly_rate": money(last_year_rate),
        "overall_monthly_rate": money(overall_rate),
        "liquid_share_of_assets": percent(totals.liquid_assets, totals.liquid_assets + totals.non_liquid_assets),
        "liquid_share_of_disposable": percent(totals.liquid_assets, totals.disposable_net_value),
    }


def net_worth_changes(snapshots: list[Snapshot]) -> list[NetWorthChange]:
    latest = snapshots[-1]
    current = latest.totals.net_worth
    periods: list[NetWorthChange] = []
    for months, label in NET_WORTH_PERIODS:
        if months == 1:
            # Records are roughly monthly but not on fixed days, so "last month" is the previous record.
            baseline = snapshots[-2] if len(snapshots) > 1 else None
        else:
            baseline = baseline_before(snapshots, subtract_months(latest.date, months))
        previous = baseline.totals.net_worth if baseline else None
        change = current - previous if previous is not None else None
        periods.append(
            {
                "months": months,
                "label": label,
                "baseline_date": baseline.date.isoformat() if baseline else None,
                "latest_date": latest.date.isoformat(),
                "change": optional_money(change),
                "change_pct": round(change / abs(previous) * 100, 2) if previous and change is not None else None,
            }
        )
    return periods


def average_monthly_changes(monthly: list[Totals]) -> AverageMonthlyChanges:
    def average_change(field: str) -> float:
        return money(mean(diffs([getattr(m, field) for m in monthly])))

    return {
        "liquid_assets": average_change("liquid_assets"),
        "non_liquid_assets": average_change("non_liquid_assets"),
        "liabilities": average_change("liabilities"),
        "net_worth": average_change("net_worth"),
    }


def history(snapshots: list[Snapshot]) -> list[HistoryPoint]:
    return [
        {
            "date": s.date.isoformat(),
            "liquid_assets": money(s.totals.liquid_assets),
            "non_liquid_assets": money(s.totals.non_liquid_assets),
            "liabilities": money(s.totals.liabilities),
            "net_worth": money(s.totals.net_worth),
            "disposable_net_value": money(s.totals.disposable_net_value),
        }
        for s in snapshots
    ]


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


def allocation(latest_rows: list[HoldingRow]) -> list[AllocationItem]:
    """Assets (no liabilities) by owned equity, largest first."""
    assets = [h for h in latest_rows if not h.is_liability]
    equity_total = sum(h.equity_value for h in assets)
    return [
        {
            **holding_item(row),
            # Allocation charts represent the portion of each asset that is owned.
            # Keep the gross value available for mortgage context in the legend.
            "value": money(row.equity_value),
            "gross_value": money(row.value),
            "share": round(row.equity_value / equity_total * 100, 2) if equity_total else 0,
        }
        for row in sorted(assets, key=lambda h: h.equity_value, reverse=True)
    ]


def latest_holdings(latest_rows: list[HoldingRow]) -> list[HoldingItem]:
    """Grouped by category, largest gross value first within each category."""
    by_value = sorted(latest_rows, key=lambda h: h.value, reverse=True)
    return [holding_item(row) for row in sorted(by_value, key=lambda h: h.category)]


def asset_history(rows: list[HoldingRow]) -> list[AssetHistoryItem]:
    return [
        {
            "id": row.id,
            "date": row.date.isoformat(),
            "name": row.name,
            "category": row.category,
            "value": money(row.value),
        }
        for row in rows
    ]


def build_dashboard(
    records: list[Record], rate_basis: RateBasis = "last_year", excluded: AbstractSet[str] = DEFAULT_EXCLUDED
) -> DashboardPayload:
    """The dashboard payload; ``excluded`` categories are left out of the disposable net value."""
    snapshots, rows = process_records(records, excluded)
    monthly = monthly_summary(snapshots)
    latest = snapshots[-1]
    latest_rows = [h for h in rows if h.date == latest.date]

    return {
        "meta": {
            "latest_date": latest.date.isoformat(),
            "excluded_categories": sorted(excluded),
            "historical_growth_basis": rate_basis,
        },
        "summary": summary(snapshots, monthly, rate_basis),
        "net_worth_changes": net_worth_changes(snapshots),
        "average_monthly_changes": average_monthly_changes(monthly),
        "history": history(snapshots),
        "allocation": allocation(latest_rows),
        "latest_holdings": latest_holdings(latest_rows),
        "asset_history": asset_history(rows),
    }
