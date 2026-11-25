import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { HistoryPoint } from '../api/types';
import type { CategoryHistoryRow } from '../lib/derive';
import { dateLabel, formatCompactEuro, formatEuro } from '../lib/format';
import { axisProps, gridProps, paletteColor, SERIES_COLORS, tooltipProps } from '../lib/theme';
import { Panel } from './common';

interface Series {
  key: string;
  name: string;
  color: string;
  width: number;
}

const BALANCE_SERIES: Series[] = [
  { key: 'net_worth', name: 'Net worth', color: SERIES_COLORS.netWorth, width: 3 },
  { key: 'liquid_assets', name: 'Liquid', color: SERIES_COLORS.liquid, width: 2 },
  { key: 'non_liquid_assets', name: 'Non-liquid', color: SERIES_COLORS.nonLiquid, width: 2 },
  { key: 'liabilities', name: 'Liabilities', color: SERIES_COLORS.liabilities, width: 2 },
];

/** Line chart over dates with euro axes. */
function DatedLineChart({ rows, series }: { rows: object[]; series: Series[] }) {
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows}>
          <CartesianGrid {...gridProps} vertical={false} />
          <XAxis dataKey="date" tickFormatter={dateLabel} {...axisProps} />
          <YAxis tickFormatter={formatCompactEuro} {...axisProps} width={66} />
          <Tooltip formatter={formatEuro} labelFormatter={dateLabel} {...tooltipProps} />
          <Legend />
          {series.map((s) => (
            <Line key={s.key} dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={s.width} dot={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BalanceHistoryChart({ history }: { history: HistoryPoint[] }) {
  return (
    <Panel title="Balance sheet evolution" kicker="HISTORY">
      <DatedLineChart rows={history} series={BALANCE_SERIES} />
    </Panel>
  );
}

export function CategoryHistoryChart({ rows, categories }: { rows: CategoryHistoryRow[]; categories: string[] }) {
  const series = categories.map((category, i) => ({ key: category, name: category, color: paletteColor(i), width: 2 }));
  return (
    <Panel title="Value by asset type" kicker="HISTORY">
      <DatedLineChart rows={rows} series={series} />
      <p className="footnote">Gross value of the holdings in each type, before mortgages.</p>
    </Panel>
  );
}
