// Chart colours reference the CSS design tokens in styles.css, so charts follow the
// light/dark theme. SVG fill and stroke accept var() values.
import type { CSSProperties } from 'react';
import { CATEGORY } from './constants';

const CHART_TOKENS = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5', '--chart-6'] as const;
const token = (name: string): string => `var(${name})`;

/** Categorical palette, in an order that keeps neighbouring colours distinguishable. */
export const PALETTE: readonly string[] = CHART_TOKENS.map(token);
export const paletteColor = (index: number): string => PALETTE[index % PALETTE.length];

/** Fixed colour per known category, so a category looks the same in every chart. */
const CATEGORY_COLORS: Record<string, string> = {
  [CATEGORY.cash]: token('--chart-1'),
  [CATEGORY.stocks]: token('--chart-2'),
  [CATEGORY.realEstate]: token('--chart-3'),
  [CATEGORY.liability]: token('--chart-4'),
  Vehicles: token('--chart-5'),
  Pensions: token('--chart-6'),
};

/** Stable colour for any category name: fixed for known ones, derived from the name otherwise. */
export function categoryColor(name: string): string {
  const known = CATEGORY_COLORS[name];
  if (known) return known;
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return paletteColor(hash);
}

export const SERIES_COLORS = {
  netWorth: token('--color-text'),
  liquid: token('--chart-1'),
  nonLiquid: token('--chart-6'),
  liabilities: token('--chart-4'),
} as const;

/** Shared Recharts props, spread onto the matching chart elements. */
export const gridProps = { strokeDasharray: '3 3', stroke: token('--color-border') };
export const axisProps = {
  stroke: token('--color-border-strong'),
  tick: { fill: token('--color-text-subtle'), fontSize: 12 },
  tickLine: false,
};
export const tooltipProps: {
  contentStyle: CSSProperties;
  labelStyle: CSSProperties;
  itemStyle: CSSProperties;
} = {
  contentStyle: {
    background: token('--color-surface'),
    border: `1px solid ${token('--color-border')}`,
    borderRadius: 8,
    boxShadow: token('--shadow-md'),
    fontSize: 13,
  },
  labelStyle: { color: token('--color-text'), fontWeight: 600, marginBottom: 4 },
  itemStyle: { color: token('--color-text-muted'), padding: 0 },
};
export const barCursor = { fill: token('--color-surface-muted') };
