import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AverageMonthlyChanges } from '../api/types';
import { averageMovementRows } from '../lib/derive';
import { formatCompactEuro, formatEuro } from '../lib/format';
import { axisProps, barCursor, gridProps, tooltipProps } from '../lib/theme';
import { Panel } from './common';

export function AverageMovementChart({ averageMonthlyChanges }: { averageMonthlyChanges: AverageMonthlyChanges }) {
  const rows = averageMovementRows(averageMonthlyChanges);
  return (
    <Panel title="Average monthly movement" description="Average change per month over the whole history.">
      <div className="chart short">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid {...gridProps} horizontal={false} />
            <XAxis type="number" tickFormatter={formatCompactEuro} {...axisProps} />
            <YAxis type="category" dataKey="name" width={120} {...axisProps} axisLine={false} />
            <ReferenceLine x={0} stroke="var(--color-border-strong)" />
            <Tooltip formatter={formatEuro} cursor={barCursor} {...tooltipProps} />
            <Bar dataKey="value" name="Per month" radius={3} barSize={20} isAnimationActive={false}>
              {rows.map((row) => (
                <Cell key={row.name} fill={row.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}
