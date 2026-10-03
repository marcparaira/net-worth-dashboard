import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCompactEuro, formatEuro, euro, signedEuro } from '../lib/format';
import { axisProps, gridProps, tooltipProps } from '../lib/theme';
import { Panel } from './common';

const ordinal = (n) => ({ 1: 'st', 2: 'nd', 3: 'rd' })[n] ?? 'th';

/** Positive gap = money to add to the bucket, negative = bucket is over its target. */
export function GapLabel({ gap }) {
  if (Math.abs(gap) < 1) return <span className="gap on-target">On target</span>;
  return <span className={`gap ${gap > 0 ? 'under' : 'over'}`}>
    {signedEuro.format(gap)} <small>{gap > 0 ? 'to add' : 'over'}</small>
  </span>;
}

const fillLabel = (fillOrder, name) => {
  const position = fillOrder.indexOf(name) + 1;
  return position ? `filled ${position}${ordinal(position)}` : null;
};

function TargetRow({ bucket, fillOrder, depth = 0 }) {
  const priority = fillLabel(fillOrder, bucket.name);
  const note = [depth ? `${bucket.share_of_parent}% of group` : null, priority ? `Priority · ${priority}` : null]
    .filter(Boolean).join(' · ');
  return <>
    <div className={`table-row rebalance-row ${bucket.children.length ? 'is-group' : ''}`}>
      <span className="holding-main" style={{ paddingLeft: depth * 18 }}>
        <strong>{bucket.name}</strong>
        {note ? <small>{note}</small> : null}
      </span>
      <span className="share">{bucket.share}%</span>
      <b>{euro.format(bucket.target)}</b>
      <b>{euro.format(bucket.current)}</b>
      <GapLabel gap={bucket.gap}/>
    </div>
    {bucket.children.map(child => <TargetRow key={child.name} bucket={child} fillOrder={fillOrder} depth={depth + 1}/>)}
  </>;
}

export function TargetsTable({ data }) {
  return <Panel title="Target vs current" kicker="ALLOCATION">
    <div className="holdings-table rebalance-table">
      <div className="table-head rebalance-row">
        <span>Bucket</span><span className="share">Of pool</span><span>Target</span><span>Current</span><span>Gap</span>
      </div>
      {data.reserves.map(reserve => <div key={reserve.name} className="table-row rebalance-row is-reserve">
        <span className="holding-main">
          <strong>{reserve.name}</strong><small>Fixed amount · {fillLabel(data.fill_order, reserve.name)}</small>
        </span>
        <span className="share">—</span>
        <b>{euro.format(reserve.target)}</b>
        <b>{euro.format(reserve.current)}</b>
        <GapLabel gap={reserve.gap}/>
      </div>)}
      {data.buckets.map(bucket => <TargetRow key={bucket.name} bucket={bucket} fillOrder={data.fill_order}/>)}
    </div>
    <p className="footnote">
      Pool to split: {euro.format(data.pool)}, i.e. everything except the fixed-amount reserves and excluded categories.
      Real estate is counted at equity value (minus its mortgage).
    </p>
  </Panel>;
}

export function TargetsChart({ slices }) {
  const rows = slices.map(slice => ({ name: slice.name, Target: slice.target, Current: slice.current }));
  return <Panel title="Where the money should be" kicker="TARGETS">
    <div className="chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ left: 20 }} barGap={2}>
          <CartesianGrid {...gridProps} horizontal={false}/>
          <XAxis type="number" tickFormatter={formatCompactEuro} {...axisProps}/>
          <YAxis type="category" dataKey="name" width={150} {...axisProps} tick={{ fontSize: 12 }}/>
          <Tooltip formatter={formatEuro} cursor={{ fill: '#ffffff08' }} {...tooltipProps}/>
          <Legend wrapperStyle={{ fontSize: 12 }}/>
          <Bar dataKey="Target" fill="#3b4d6e" radius={[0, 6, 6, 0]}/>
          <Bar dataKey="Current" fill="#5eead4" radius={[0, 6, 6, 0]}/>
        </BarChart>
      </ResponsiveContainer>
    </div>
  </Panel>;
}
