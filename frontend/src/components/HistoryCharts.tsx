import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { HistoryPoint } from '../api/types';
import type { CategoryHistoryRow } from '../lib/derive';
import { dateLabel, formatCompactEuro, formatEuro } from '../lib/format';
import { axisProps, categoryColor, gridProps, SERIES_COLORS, tooltipProps } from '../lib/theme';
import { Panel } from './common';

interface Series {
  key: string;
  name: string;
  color: string;
  width: number;
}

const BALANCE_SERIES: Series[] = [
  { key: 'net_worth', name: 'Net worth', color: SERIES_COLORS.netWorth, width: 2.5 },
  { key: 'liquid_assets', name: 'Liquid', color: SERIES_COLORS.liquid, width: 2 },
  { key: 'non_liquid_assets', name: 'Non-liquid', color: SERIES_COLORS.nonLiquid, width: 2 },
  { key: 'liabilities', name: 'Liabilities', color: SERIES_COLORS.liabilities, width: 2 },
];

const legendLabel = (value: string) => <span className="legend-label">{value}</span>;

/** Line chart over dates with euro axes. */
function DatedLineChart({ rows, series }: { rows: object[]; series: Series[] }) {
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid {...gridProps} vertical={false} />
          <XAxis dataKey="date" tickFormatter={dateLabel} {...axisProps} minTickGap={24} />
          <YAxis tickFormatter={formatCompactEuro} {...axisProps} axisLine={false} width={64} />
          <Tooltip formatter={formatEuro} labelFormatter={dateLabel} {...tooltipProps} />
          <Legend iconType="plainline" iconSize={14} formatter={legendLabel} />
          {series.map((s) => (
            <Line
              key={s.key}
              dataKey={s.key}
              name={s.name}
              stroke={s.color}
              strokeWidth={s.width}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BalanceHistoryChart({ history }: { history: HistoryPoint[] }) {
  return (
    <Panel title="Balance sheet" description="Assets, liabilities, and net worth at each snapshot.">
      <DatedLineChart rows={history} series={BALANCE_SERIES} />
    </Panel>
  );
}

export function CategoryHistoryChart({ rows, categories }: { rows: CategoryHistoryRow[]; categories: string[] }) {
  const series = categories.map((category) => ({
    key: category,
    name: category,
    color: categoryColor(category),
    width: 2,
  }));
  return (
    <Panel title="Value by category" description="Gross value of the holdings in each category, before mortgages.">
      <DatedLineChart rows={rows} series={series} />
    </Panel>
  );
}
