import type { CSSProperties } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { formatEuro } from '../lib/format';
import { tooltipProps } from '../lib/theme';

export interface DonutSegment {
  name: string;
  value: number;
  color: string;
  key?: string;
}

export interface RingProps {
  innerRadius?: number;
  startAngle?: number;
  endAngle?: number;
  stroke?: string;
}

/** Donut with a centred total. */
export function DonutChart({
  segments,
  centerValue,
  centerLabel,
  pieProps,
  tooltipItemStyle,
}: {
  segments: DonutSegment[];
  centerValue: number;
  centerLabel: string;
  pieProps?: RingProps;
  tooltipItemStyle?: CSSProperties;
}) {
  return (
    <div className="donut">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={segments} dataKey="value" nameKey="name" outerRadius={88} paddingAngle={2} {...pieProps}>
            {segments.map((segment, i) => (
              <Cell key={segment.key ?? i} fill={segment.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={formatEuro}
            {...tooltipProps}
            {...(tooltipItemStyle && { itemStyle: tooltipItemStyle })}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="donut-label">
        <strong>{formatEuro(centerValue)}</strong>
        <span>{centerLabel}</span>
      </div>
    </div>
  );
}
