// Shapes of the JSON returned by the API; keep in sync with backend/schemas.py.

export type RateBasis = 'last_year' | 'overall';

export interface Meta {
  latest_date: string;
  excluded_category: string;
  historical_growth_basis: RateBasis;
}

export interface Summary {
  liquid_assets: number;
  non_liquid_assets: number;
  liabilities: number;
  net_worth: number;
  disposable_net_value: number;
  net_worth_one_year_ago: number | null;
  one_year_change: number | null;
  one_year_change_pct: number | null;
  monthly_disposable_increase: number;
  last_year_monthly_rate: number;
  overall_monthly_rate: number;
  liquid_share_of_assets: number | null;
  liquid_share_of_disposable: number | null;
}

export interface NetWorthChange {
  months: number;
  label: string;
  baseline_date: string | null;
  latest_date: string;
  change: number | null;
  change_pct: number | null;
}

export interface AverageMonthlyChanges {
  liquid_assets: number;
  non_liquid_assets: number;
  liabilities: number;
  net_worth: number;
}

export interface HistoryPoint {
  date: string;
  liquid_assets: number;
  non_liquid_assets: number;
  liabilities: number;
  net_worth: number;
  disposable_net_value: number;
}

export interface HoldingItem {
  id: string;
  name: string;
  category: string;
  value: number;
  mortgage_name: string | null;
  mortgage_value: number;
  equity_value: number;
  has_mortgage: boolean;
}

export interface AllocationItem extends HoldingItem {
  gross_value: number;
  share: number;
}

export interface AssetHistoryItem {
  id: string;
  date: string;
  name: string;
  category: string;
  value: number;
}

export interface DashboardPayload {
  meta: Meta;
  summary: Summary;
  net_worth_changes: NetWorthChange[];
  average_monthly_changes: AverageMonthlyChanges;
  history: HistoryPoint[];
  allocation: AllocationItem[];
  latest_holdings: HoldingItem[];
  asset_history: AssetHistoryItem[];
}

// GET /api/rebalancing

export interface RebalancingHolding {
  id: string;
  name: string;
  category: string;
  amount: number;
}

export interface RebalancingReserve {
  name: string;
  target: number;
  current: number;
  gap: number;
  holdings: RebalancingHolding[];
}

export interface RebalancingBucket {
  name: string;
  share: number;
  share_of_parent: number;
  target: number;
  current: number;
  gap: number;
  holdings: RebalancingHolding[];
  children: RebalancingBucket[];
}

export interface RebalancingPayload {
  latest_date: string;
  pool: number;
  fill_order: string[];
  reserves: RebalancingReserve[];
  buckets: RebalancingBucket[];
  excluded: RebalancingHolding[];
  unassigned: RebalancingHolding[];
}

// Data entry: /api/holdings, /api/liabilities, /api/snapshots, /api/categories

export type Liquidity = 'liquid' | 'non_liquid';

export interface HoldingOut {
  id: string;
  name: string;
  category: string;
  liquidity: Liquidity;
  closed_on: string | null;
  mortgage_id: string | null;
  latest_amount: number | null;
  latest_date: string | null;
  value_count: number;
  in_rebalancing: boolean;
}

export interface HoldingIn {
  name: string;
  category: string;
  liquidity: Liquidity;
  closed_on: string | null;
}

export interface LiabilityOut {
  id: string;
  name: string;
  /** The property this liability finances (a mortgage), if any. */
  holding_id: string | null;
  closed_on: string | null;
  latest_amount: number | null;
  latest_date: string | null;
  value_count: number;
}

export interface LiabilityIn {
  name: string;
  holding_id: string | null;
  closed_on: string | null;
}

export interface SnapshotValue {
  holding_id: string | null;
  liability_id: string | null;
  amount: number;
}

export interface SnapshotOut {
  id: string;
  date: string;
  values: SnapshotValue[];
}

export interface SnapshotDetail extends SnapshotOut {
  previous: SnapshotOut | null;
}

export interface SnapshotIn {
  date: string;
  values: SnapshotValue[];
}

export interface SnapshotSummary {
  id: string;
  date: string;
  net_worth: number;
  change: number | null;
  value_count: number;
}
