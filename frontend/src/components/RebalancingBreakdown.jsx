import { useState } from 'react';
import { euro } from '../lib/format';
import { LegendRow, Panel, SegmentedControl } from './common';

const VIEWS = [
  { value: 'bucket', label: 'By bucket' },
  { value: 'holding', label: 'By holding' },
];

function SliceCard({ slice }) {
  return <div className="slice-card" style={{ '--accent': slice.color }}>
    <header>
      <span>{slice.parent ?? (slice.isReserve ? 'Reserve' : 'Bucket')}</span>
      <strong>{slice.name}</strong>
      <b>{euro.format(slice.current)}</b>
    </header>
    <div className="allocation-list">
      {slice.holdings.length
        ? slice.holdings.map(h => <LegendRow key={h.id} color={slice.color} label={h.name} note={h.category}
          amount={euro.format(h.amount)}/>)
        : <p className="footnote">Nothing assigned yet.</p>}
    </div>
  </div>;
}

function HoldingSplit({ holding }) {
  return <div className="holding-split">
    <div className="holding-split-head">
      <span className="holding-main"><strong>{holding.name}</strong><small>{holding.category}</small></span>
      <b>{euro.format(holding.amount)}</b>
    </div>
    <div className="split-bar">
      {holding.parts.map(part => <i key={part.name} title={`${part.name}: ${euro.format(part.amount)}`}
        style={{ flexGrow: Math.max(part.amount, 0), background: part.color }}/>)}
    </div>
    <div className="split-parts">
      {holding.parts.map(part => <span key={part.name}>
        <i style={{ background: part.color }}/>{part.name} <b>{euro.format(part.amount)}</b>
      </span>)}
    </div>
  </div>;
}

export function RebalancingBreakdown({ slices, holdings, excluded }) {
  const [view, setView] = useState('bucket');
  return <Panel title="What counts as what" kicker="BREAKDOWN">
    <div className="allocation-toolbar">
      <SegmentedControl options={VIEWS} value={view} onChange={setView}/>
    </div>
    {view === 'bucket'
      ? <div className="slice-grid">
        {slices.map(slice => <SliceCard key={slice.name} slice={slice}/>)}
        {excluded.length ? <SliceCard slice={{
          name: 'Excluded', parent: 'Not part of the plan', color: '#4b5a75', holdings: excluded,
          current: excluded.reduce((sum, h) => sum + h.amount, 0),
        }}/> : null}
      </div>
      : <div className="holding-splits">
        {holdings.map(holding => <HoldingSplit key={holding.id} holding={holding}/>)}
      </div>}
    <p className="footnote">
      Cash can't be told apart by purpose, so it is assigned on paper: reserves and priority buckets are filled first, in
      the config's fill order, then what's left is shared between the other buckets in proportion to their targets.
    </p>
  </Panel>;
}
