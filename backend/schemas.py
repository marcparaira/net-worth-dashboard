"""Shapes of the JSON returned by the API."""

from __future__ import annotations

from typing import TypedDict

from .config import RateBasis


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
    liquid_share_of_assets: float | None
    liquid_share_of_disposable: float | None


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


# ``GET /api/rebalancing``


class RebalancingHolding(TypedDict):
    id: str
    name: str
    category: str
    amount: float


class RebalancingReserve(TypedDict):
    name: str
    target: float
    current: float
    gap: float
    holdings: list[RebalancingHolding]


class RebalancingBucket(TypedDict):
    name: str
    share: float
    share_of_parent: float
    target: float
    current: float
    gap: float
    holdings: list[RebalancingHolding]
    children: list[RebalancingBucket]


class RebalancingPayload(TypedDict):
    latest_date: str
    pool: float
    fill_order: list[str]
    reserves: list[RebalancingReserve]
    buckets: list[RebalancingBucket]
    excluded: list[RebalancingHolding]
    unassigned: list[RebalancingHolding]
