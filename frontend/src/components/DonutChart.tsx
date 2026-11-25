import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { formatEuro } from '../lib/format';
import { tooltipProps } from '../lib/theme';

export interface DonutSegment {
  name: string;
  value: number;
  color: string;
  key?: string;
}

/** Donut with a centred total. */
export function DonutChart({
  segments,
  centerValue,
  centerLabel,
}: {
  segments: DonutSegment[];
  centerValue: number;
  centerLabel: string;
}) {
  return (
    <div className="donut">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={segments}
            dataKey="value"
            nameKey="name"
            innerRadius={66}
            outerRadius={92}
            paddingAngle={1}
            startAngle={90}
            endAngle={-270}
            stroke="var(--color-surface)"
            strokeWidth={2}
            isAnimationActive={false}
          >
            {segments.map((segment, i) => (
              <Cell key={segment.key ?? i} fill={segment.color} />
            ))}
          </Pie>
          <Tooltip formatter={formatEuro} {...tooltipProps} />
        </PieChart>
      </ResponsiveContainer>
      <div className="donut-label">
        <strong>{formatEuro(centerValue)}</strong>
        <span>{centerLabel}</span>
      </div>
    </div>
  );
}
