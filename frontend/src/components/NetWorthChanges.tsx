import type { NetWorthChange } from '../api/types';
import { signedEuro, signedPercent, trendClass } from '../lib/format';
import { Panel, TrendLine } from './common';

function changeDescription({ change, change_pct: changePct }: NetWorthChange): string {
  if (change == null) return 'Not enough history';
  if (changePct == null) return 'Percentage unavailable (zero baseline)';
  return signedPercent.format(changePct / 100);
}

function PeriodCard({ period }: { period: NetWorthChange }) {
  return (
    <div className="summary-card">
      <span>{period.label}</span>
      <strong className={trendClass(period.change)}>
        {period.change == null ? '—' : signedEuro.format(period.change)}
      </strong>
      <TrendLine value={period.change}>{changeDescription(period)}</TrendLine>
      {period.baseline_date && (
        <small>
          {period.baseline_date} → {period.latest_date}
        </small>
      )}
    </div>
  );
}

export function NetWorthChanges({ periods }: { periods: NetWorthChange[] }) {
  return (
    <Panel
      title="Net worth change"
      description="Last month compares with the previous snapshot; 3 months and last year with the latest snapshot on or before that date."
    >
      <div className="summary-cards">
        {periods.map((period) => (
          <PeriodCard key={period.months} period={period} />
        ))}
      </div>
    </Panel>
  );
}
