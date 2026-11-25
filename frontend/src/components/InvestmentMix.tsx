import type { Segment } from '../lib/derive';
import { euro } from '../lib/format';
import { DonutChart } from './DonutChart';
import { LegendRow, Panel } from './common';

export function InvestmentMix({ title, segments, note }: { title: string; segments: Segment[]; note: string }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  return (
    <Panel title={title} description={note}>
      <div className="ring-wrap">
        <DonutChart
          segments={segments.map((s) => ({ ...s, key: s.name }))}
          centerValue={total}
          centerLabel="invested"
        />
        <div className="allocation-list">
          {segments.map((segment) => (
            <LegendRow
              key={segment.name}
              color={segment.color}
              label={segment.name}
              note={total ? `${((segment.value / total) * 100).toFixed(1)}%` : '—'}
              amount={euro.format(segment.value)}
            />
          ))}
        </div>
      </div>
    </Panel>
  );
}
