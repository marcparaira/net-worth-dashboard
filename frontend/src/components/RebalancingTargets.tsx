import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { RebalancingBucket, RebalancingPayload } from '../api/types';
import { euro, formatCompactEuro, formatEuro, signedEuro } from '../lib/format';
import type { Slice } from '../lib/rebalancing';
import { axisProps, barCursor, CURRENT_COLOR, gridProps, TARGET_COLOR, tooltipProps } from '../lib/theme';
import { Panel } from './common';

const legendLabel = (value: string) => <span className="legend-label">{value}</span>;

const ordinal = (n: number): string => ({ 1: 'st', 2: 'nd', 3: 'rd' })[n] ?? 'th';

/**
 * Positive gap = money to add to the bucket (accent), negative = over its target (warning).
 * Gains and losses colours are reserved for changes in value.
 */
function GapLabel({ gap }: { gap: number }) {
  if (Math.abs(gap) < 1) return <span className="gap on-target">On target</span>;
  return (
    <span className={`gap ${gap > 0 ? 'under' : 'over'}`}>
      {signedEuro.format(gap)} <small>{gap > 0 ? 'to add' : 'over'}</small>
    </span>
  );
}

const fillLabel = (fillOrder: string[], name: string): string | null => {
  const position = fillOrder.indexOf(name) + 1;
  return position ? `filled ${position}${ordinal(position)}` : null;
};

function TargetRow({
  bucket,
  fillOrder,
  depth = 0,
}: {
  bucket: RebalancingBucket;
  fillOrder: string[];
  depth?: number;
}) {
  const priority = fillLabel(fillOrder, bucket.name);
  const note = [depth ? `${bucket.share_of_parent}% of group` : null, priority ? `Priority · ${priority}` : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <>
      <div className={`table-row rebalance-row ${bucket.children.length ? 'is-group' : ''}`}>
        <span className="holding-main" style={{ paddingLeft: depth * 18 }}>
          <strong>{bucket.name}</strong>
          {note ? <small>{note}</small> : null}
        </span>
        <span className="share">{bucket.share}%</span>
        <b>{euro.format(bucket.target)}</b>
        <b>{euro.format(bucket.current)}</b>
        <GapLabel gap={bucket.gap} />
      </div>
      {bucket.children.map((child) => (
        <TargetRow key={child.name} bucket={child} fillOrder={fillOrder} depth={depth + 1} />
      ))}
    </>
  );
}

export function TargetsTable({ data }: { data: RebalancingPayload }) {
  return (
    <Panel title="Target vs current" description="Reserves are filled first, then the pool is split by weight.">
      <div className="holdings-table rebalance-table">
        <div className="table-head rebalance-row">
          <span>Bucket</span>
          <span className="share">Of pool</span>
          <span>Target</span>
          <span>Current</span>
          <span>Gap</span>
        </div>
        {data.reserves.map((reserve) => (
          <div key={reserve.name} className="table-row rebalance-row is-reserve">
            <span className="holding-main">
              <strong>{reserve.name}</strong>
              <small>Reserve · fixed amount · {fillLabel(data.fill_order, reserve.name)}</small>
            </span>
            <span className="share">—</span>
            <b>{euro.format(reserve.target)}</b>
            <b>{euro.format(reserve.current)}</b>
            <GapLabel gap={reserve.gap} />
          </div>
        ))}
        {data.buckets.map((bucket) => (
          <TargetRow key={bucket.name} bucket={bucket} fillOrder={data.fill_order} />
        ))}
      </div>
      <p className="footnote">
        Pool to split: {euro.format(data.pool)}, everything except the reserves and excluded categories. Real estate
        counts at equity value (after its mortgage).
      </p>
    </Panel>
  );
}

export function TargetsChart({ slices }: { slices: Slice[] }) {
  const rows = slices.map((slice) => ({ name: slice.name, Target: slice.target, Current: slice.current }));
  return (
    <Panel title="Where the money should be" description="Target and current amount of each reserve and bucket.">
      <div className="chart">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }} barGap={2}>
            <CartesianGrid {...gridProps} horizontal={false} />
            <XAxis type="number" tickFormatter={formatCompactEuro} {...axisProps} />
            <YAxis type="category" dataKey="name" width={140} {...axisProps} axisLine={false} />
            <Tooltip formatter={formatEuro} cursor={barCursor} {...tooltipProps} />
            <Legend iconType="square" iconSize={10} formatter={legendLabel} />
            <Bar dataKey="Target" fill={TARGET_COLOR} radius={3} barSize={12} isAnimationActive={false} />
            <Bar dataKey="Current" fill={CURRENT_COLOR} radius={3} barSize={12} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}
