// Pure functions that derive chart data from the /api/dashboard payload.
import type { AllocationItem, AverageMonthlyChanges, DashboardPayload, HistoryPoint } from '../api/types';
import { CATEGORY } from './constants';
import { categoryColor, SERIES_COLORS } from './theme';

export interface CategoryTotal {
  name: string;
  value: number;
  /** Share of total asset equity, in %. */
  share: number;
}

export interface Segment {
  name: string;
  value: number;
  color: string;
}

/** One row per record date: `date` plus the gross value of each category. */
export type CategoryHistoryRow = { date: string } & Record<string, string | number>;

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

/** Sum of owned equity across all assets (allocation values are already net of mortgages). */
export function totalAssetEquity(allocation: AllocationItem[] = []): number {
  return sum(allocation.map((item) => item.value));
}

/** Allocation equity grouped by category, largest first, with each category's share in %. */
export function categoryAllocation(allocation: AllocationItem[] = []): CategoryTotal[] {
  if (!allocation.length) return [];
  const totals: Record<string, number> = {};
  for (const item of allocation) totals[item.category] = (totals[item.category] ?? 0) + item.value;
  const totalEquity = totalAssetEquity(allocation);
  return Object.entries(totals)
    .map(([name, value]) => ({
      name,
      value,
      share: totalEquity ? Number(((value / totalEquity) * 100).toFixed(2)) : 0,
    }))
    .sort((left, right) => right.value - left.value);
}

/** Real estate equity, stocks and cash segments for the investment-mix donuts, in their category colours. */
export function investmentMix(categories: CategoryTotal[]): Segment[] {
  return [CATEGORY.realEstate, CATEGORY.stocks, CATEGORY.cash].map((name) => ({
    name,
    value: Math.max(categories.find((c) => c.name === name)?.value ?? 0, 0),
    color: categoryColor(name),
  }));
}

/** One row per record date with the gross value of each category. */
export function categoryHistory(
  data: DashboardPayload | null,
  categories: CategoryTotal[],
): { rows: CategoryHistoryRow[]; categories: string[] } {
  if (!data?.asset_history.length) return { rows: [], categories: [] };
  // Largest categories first, so the legend order matches the allocation panel.
  const names = [...new Set([...categories.map((c) => c.name), ...data.asset_history.map((h) => h.category)])];
  const zeroes = Object.fromEntries(names.map((name) => [name, 0]));
  const byDate: Record<string, CategoryHistoryRow> = Object.fromEntries(
    data.history.map((h) => [h.date, { ...zeroes, date: h.date }]),
  );
  for (const holding of data.asset_history) {
    const row = byDate[holding.date];
    if (!row) continue;
    const current = row[holding.category];
    row[holding.category] = (typeof current === 'number' ? current : 0) + holding.value;
  }
  return { rows: Object.values(byDate), categories: names };
}

/** Net worth change since the last record before 1 January of the latest record's year. */
export function yearToDateChange(history: HistoryPoint[] = []): number | null {
  const latest = history.at(-1);
  if (!latest) return null;
  const startOfYear = new Date(new Date(latest.date).getFullYear(), 0, 1);
  const baseline = [...history].reverse().find((entry) => new Date(entry.date) < startOfYear);
  return baseline ? latest.net_worth - baseline.net_worth : null;
}

const MOVEMENT_ROWS: { key: keyof AverageMonthlyChanges; name: string; color: string }[] = [
  { key: 'liquid_assets', name: 'Liquid assets', color: SERIES_COLORS.liquid },
  { key: 'non_liquid_assets', name: 'Non-liquid assets', color: SERIES_COLORS.nonLiquid },
  { key: 'liabilities', name: 'Liabilities', color: SERIES_COLORS.liabilities },
  { key: 'net_worth', name: 'Net worth', color: SERIES_COLORS.netWorth },
];

/** `average_monthly_changes` as labelled bar-chart rows, coloured like the balance sheet series. */
export function averageMovementRows(averageMonthlyChanges: AverageMonthlyChanges): Segment[] {
  return MOVEMENT_ROWS.map(({ key, name, color }) => ({ name, value: averageMonthlyChanges[key], color }));
}
