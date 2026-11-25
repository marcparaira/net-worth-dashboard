import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AllocationItem } from '../api/types';
import type { Option } from '../lib/constants';
import type { CategoryTotal } from '../lib/derive';
import { euro, formatCompactEuro, formatEuro } from '../lib/format';
import { axisProps, barCursor, categoryColor, gridProps, tooltipProps } from '../lib/theme';
import { DonutChart } from './DonutChart';
import { LegendRow, Panel, SegmentedControl } from './common';

type View = 'holdings' | 'categories';

const VIEWS: readonly Option<View>[] = [
  { value: 'holdings', label: 'Holdings' },
  { value: 'categories', label: 'Categories' },
];
const MAX_LEGEND_HOLDINGS = 7;

function holdingNote(item: AllocationItem): string {
  const base = `${item.category} · ${item.share}%`;
  return item.has_mortgage
    ? `${base} · Value ${euro.format(item.gross_value)} · Mortgage ${euro.format(item.mortgage_value)}`
    : base;
}

function HoldingsAllocation({ allocation, totalEquity }: { allocation: AllocationItem[]; totalEquity: number }) {
  // Each holding takes its category's colour, as in every other chart.
  const segments = allocation.map((item) => ({ ...item, color: categoryColor(item.category), key: item.id }));
  return (
    <div className="allocation-wrap">
      <DonutChart segments={segments} centerValue={totalEquity} centerLabel="Total equity" />
      <div className="allocation-list">
        {segments.slice(0, MAX_LEGEND_HOLDINGS).map((item) => (
          <LegendRow
            key={item.id}
            color={item.color}
            label={item.name}
            note={holdingNote(item)}
            amount={euro.format(item.value)}
          />
        ))}
      </div>
    </div>
  );
}

/** Tooltip row: amount, and the category's share of total equity. */
const categoryTooltip = (value: unknown, _name: unknown, item: { payload?: CategoryTotal }) =>
  [formatEuro(value), `${item.payload?.share ?? 0}% of equity`] as const;

function CategoryAllocation({ categories }: { categories: CategoryTotal[] }) {
  return (
    <div className="category-allocation">
      <div className="chart short">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={categories} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid {...gridProps} horizontal={false} />
            <XAxis type="number" tickFormatter={formatCompactEuro} {...axisProps} />
            <YAxis type="category" dataKey="name" width={120} {...axisProps} axisLine={false} />
            <Tooltip formatter={categoryTooltip} cursor={barCursor} {...tooltipProps} />
            <Bar dataKey="value" radius={3} barSize={20} isAnimationActive={false}>
              {categories.map((entry) => (
                <Cell key={entry.name} fill={categoryColor(entry.name)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="allocation-list">
        {categories.map((item) => (
          <LegendRow
            key={item.name}
            color={categoryColor(item.name)}
            label={item.name}
            note={`${item.share}% of total equity`}
            amount={euro.format(item.value)}
          />
        ))}
      </div>
    </div>
  );
}

export function AllocationPanel({
  allocation,
  categories,
  totalEquity,
}: {
  allocation: AllocationItem[];
  categories: CategoryTotal[];
  totalEquity: number;
}) {
  const [view, setView] = useState<View>('holdings');
  return (
    <Panel
      title="Asset allocation"
      description="Equity in each asset, after mortgages."
      actions={<SegmentedControl options={VIEWS} value={view} onChange={setView} label="Allocation view" />}
    >
      {view === 'holdings' ? (
        <HoldingsAllocation allocation={allocation} totalEquity={totalEquity} />
      ) : (
        <CategoryAllocation categories={categories} />
      )}
    </Panel>
  );
}
