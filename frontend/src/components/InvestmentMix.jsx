import { euro } from '../lib/format';
import { DonutChart } from './DonutChart';
import { LegendRow, Panel } from './common';

const RING_PROPS = { innerRadius: 62, startAngle: 90, endAngle: -270, stroke: 'none' };

export function InvestmentMix({ title, segments, note }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  return <Panel title={title} kicker="BALANCE">
    <div className="ring-wrap">
      <DonutChart segments={segments.map(s => ({ ...s, key: s.name }))} centerValue={total} centerLabel="invested"
        pieProps={RING_PROPS} tooltipItemStyle={{ color: '#edf3ff' }}/>
      <div className="allocation-list">
        {segments.map(segment => <LegendRow key={segment.name} color={segment.color} label={segment.name}
          note={total ? `${(segment.value / total * 100).toFixed(1)}%` : '—'} amount={euro.format(segment.value)}/>)}
      </div>
    </div>
    <p className="footnote">{note}</p>
  </Panel>;
}
