import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AverageMonthlyChanges } from '../api/types';
import { averageMovementRows } from '../lib/derive';
import { formatCompactEuro, formatEuro } from '../lib/format';
import { axisProps, gridProps, SERIES_COLORS, tooltipProps } from '../lib/theme';
import { Panel } from './common';

export function AverageMovementChart({ averageMonthlyChanges }: { averageMonthlyChanges: AverageMonthlyChanges }) {
  return (
    <Panel title="Average monthly movement" kicker="MOMENTUM">
      <div className="chart short">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={averageMovementRows(averageMonthlyChanges)} layout="vertical" margin={{ left: 30 }}>
            <CartesianGrid {...gridProps} horizontal={false} />
            <XAxis type="number" tickFormatter={formatCompactEuro} {...axisProps} />
            <YAxis type="category" dataKey="name" width={115} {...axisProps} />
            <Tooltip formatter={formatEuro} {...tooltipProps} />
            <Bar dataKey="value" fill={SERIES_COLORS.liquid} radius={[0, 7, 7, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}
