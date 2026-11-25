import type { Meta, RateBasis, Summary } from '../api/types';
import { RATE_BASIS_OPTIONS } from '../lib/constants';
import { signedEuro } from '../lib/format';
import { MetricCard } from './common';

function yearOverYearText(change: number | null): string {
  return change == null ? 'Not enough history for a yearly comparison' : `${signedEuro.format(change)} vs one year ago`;
}

function yearToDateText(change: number | null): string {
  return change !== null ? `${signedEuro.format(change)} year to date` : '';
}

export function SummaryMetrics({
  summary,
  meta,
  yearToDateChange,
  basis,
  onBasisChange,
}: {
  summary: Summary;
  meta: Meta;
  yearToDateChange: number | null;
  basis: RateBasis;
  onBasisChange: (basis: RateBasis) => void;
}) {
  return (
    <div className="metrics-grid">
      <MetricCard
        title="Net worth"
        value={summary.net_worth}
        trend={summary.one_year_change}
        subtitle={yearOverYearText(summary.one_year_change)}
        detail={yearToDateText(yearToDateChange)}
      />
      <MetricCard
        title="Liquid assets"
        value={summary.liquid_assets}
        subtitle={`${Math.round((summary.liquid_assets / summary.net_worth) * 100)}% of net worth`}
      />
      <MetricCard
        title="Disposable net value"
        value={summary.disposable_net_value}
        subtitle={`Excludes ${meta.excluded_category} and their mortgages`}
      />
      <MetricCard
        title="Monthly disposable increase"
        value={summary.monthly_disposable_increase}
        trend={summary.monthly_disposable_increase}
        detail="Includes valuation changes"
        subtitle={
          <select
            className="inline-select"
            value={basis}
            onChange={(e) => onBasisChange(e.target.value as RateBasis)}
            aria-label="Averaging period"
          >
            {RATE_BASIS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        }
      />
    </div>
  );
}
