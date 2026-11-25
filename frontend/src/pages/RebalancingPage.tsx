import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useMemo } from 'react';
import type { RebalancingPayload } from '../api/types';
import { RebalancingBreakdown } from '../components/RebalancingBreakdown';
import { TargetsChart, TargetsTable } from '../components/RebalancingTargets';
import { useApi } from '../hooks/useApi';
import { euro } from '../lib/format';
import { allSlices, holdingsBreakdown } from '../lib/rebalancing';

export function RebalancingPage() {
  const { data, loading, error } = useApi<RebalancingPayload>('/rebalancing');

  const slices = useMemo(() => (data ? allSlices(data) : []), [data]);
  const holdings = useMemo(
    () => (data ? holdingsBreakdown(slices, data.excluded, data.unassigned) : []),
    [data, slices],
  );

  if (loading && !data)
    return (
      <div className="center">
        <RefreshCw className="spin" /> Loading rebalancing…
      </div>
    );
  if (error) return <div className="center">{error}</div>;
  if (!data) return null;

  const toAdd = slices.filter((s) => s.gap > 0).sort((a, b) => b.gap - a.gap);
  const over = slices.filter((s) => s.gap < 0).sort((a, b) => a.gap - b.gap);
  const [mostUnder] = toAdd;
  const [mostOver] = over;

  return (
    <>
      <header className="hero">
        <h1>Rebalancing</h1>
        <p>As of {data.latest_date} · targets from rebalancing.json in the data directory</p>
      </header>

      <div className="summary-cards rebalance-summary">
        <div className="summary-card">
          <span>Pool to split</span>
          <strong>{euro.format(data.pool)}</strong>
          <small>After the fixed-amount reserves, without excluded categories</small>
        </div>
        <div className="summary-card">
          <span>Most underweight</span>
          <strong className="positive">{mostUnder ? euro.format(mostUnder.gap) : '—'}</strong>
          <small>{mostUnder ? `to add to ${mostUnder.name}` : 'Every bucket is at or above target'}</small>
        </div>
        <div className="summary-card">
          <span>Most overweight</span>
          <strong className="negative">{mostOver ? euro.format(-mostOver.gap) : '—'}</strong>
          <small>{mostOver ? `over target in ${mostOver.name}` : 'No bucket is over target'}</small>
        </div>
      </div>

      {data.unassigned.length ? (
        <div className="notice">
          <AlertTriangle size={16} />
          <span>
            {data.unassigned.map((h) => h.name).join(', ')} {data.unassigned.length > 1 ? 'are' : 'is'} not accepted by
            any bucket ({euro.format(data.unassigned.reduce((sum, h) => sum + h.amount, 0))}). Add the category or
            holding id to a bucket in rebalancing.json, or exclude the category.
          </span>
        </div>
      ) : null}

      <div className="two-col even">
        <TargetsTable data={data} />
        <TargetsChart slices={slices} />
      </div>

      <RebalancingBreakdown slices={slices} holdings={holdings} excluded={data.excluded} />
    </>
  );
}
