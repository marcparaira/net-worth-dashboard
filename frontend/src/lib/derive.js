// Pure functions that derive chart data from the /api/dashboard payload.
import { CATEGORY } from './constants';
import { paletteColor } from './theme';

const sum = (values) => values.reduce((total, value) => total + value, 0);

/** Sum of owned equity across all assets (allocation values are already net of mortgages). */
export function totalAssetEquity(allocation = []) {
  return sum(allocation.map(item => item.value));
}

/** Allocation equity grouped by category, largest first, with each category's share in %. */
export function categoryAllocation(allocation = []) {
  if (!allocation.length) return [];
  const totals = {};
  for (const item of allocation) totals[item.category] = (totals[item.category] || 0) + item.value;
  const totalEquity = totalAssetEquity(allocation);
  return Object.entries(totals)
    .map(([name, value]) => ({
      name,
      value,
      share: totalEquity ? Number((value / totalEquity * 100).toFixed(2)) : 0,
    }))
    .sort((left, right) => right.value - left.value);
}

/**
 * Real estate equity, stocks and cash segments for the investment-mix donuts.
 * Colours follow the category allocation order so they match the other charts.
 */
export function investmentMix(categories) {
  return [CATEGORY.realEstate, CATEGORY.stocks, CATEGORY.cash].map(name => {
    const index = categories.findIndex(c => c.name === name);
    return {
      name,
      value: Math.max(categories[index]?.value || 0, 0),
      color: paletteColor(index < 0 ? categories.length : index),
    };
  });
}

/** One row per record date with the gross value of each category. */
export function categoryHistory(data, categories) {
  if (!data?.asset_history?.length) return { rows: [], categories: [] };
  // Reuse the allocation order so each category keeps the same colour in both charts.
  const names = [...new Set([...categories.map(c => c.name), ...data.asset_history.map(h => h.category)])];
  const zeroes = Object.fromEntries(names.map(name => [name, 0]));
  const byDate = Object.fromEntries(data.history.map(h => [h.date, { date: h.date, ...zeroes }]));
  for (const holding of data.asset_history) {
    if (byDate[holding.date]) byDate[holding.date][holding.category] += holding.value;
  }
  return { rows: Object.values(byDate), categories: names };
}

/** Net worth change since the last record before 1 January of the latest record's year. */
export function yearToDateChange(history = []) {
  if (!history.length) return null;
  const latest = history[history.length - 1];
  const startOfYear = new Date(new Date(latest.date).getFullYear(), 0, 1);
  const baseline = [...history].reverse().find(entry => new Date(entry.date) < startOfYear);
  return baseline ? latest.net_worth - baseline.net_worth : null;
}

/** `average_monthly_changes` as bar-chart rows ("net_worth" -> "net worth"). */
export function averageMovementRows(averageMonthlyChanges) {
  return Object.entries(averageMonthlyChanges).map(([name, value]) => ({ name: name.replaceAll('_', ' '), value }));
}
