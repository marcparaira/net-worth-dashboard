import { RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { RateBasis } from '../api/types';
import { AllocationPanel } from '../components/AllocationPanel';
import { AverageMovementChart } from '../components/AverageMovementChart';
import { BalanceHistoryChart, CategoryHistoryChart } from '../components/HistoryCharts';
import { HoldingsTable } from '../components/HoldingsTable';
import { InvestmentMix } from '../components/InvestmentMix';
import { NetWorthChanges } from '../components/NetWorthChanges';
import { SummaryMetrics } from '../components/SummaryMetrics';
import { useDashboard } from '../hooks/useDashboard';
import { CATEGORY } from '../lib/constants';
import { categoryAllocation, categoryHistory, investmentMix, totalAssetEquity, yearToDateChange } from '../lib/derive';

export function DashboardPage() {
  const [basis, setBasis] = useState<RateBasis>('last_year');
  const { data, loading, error, status } = useDashboard(basis);

  const categories = useMemo(() => categoryAllocation(data?.allocation), [data]);
  const mix = useMemo(() => investmentMix(categories), [categories]);
  const categoryRows = useMemo(() => categoryHistory(data, categories), [data, categories]);
  const assetEquity = useMemo(() => totalAssetEquity(data?.allocation), [data]);
  const ytdChange = useMemo(() => yearToDateChange(data?.history), [data]);

  if (loading && !data)
    return (
      <div className="center">
        <RefreshCw className="spin" /> Loading dashboard…
      </div>
    );
  if (status === 404)
    return (
      <div className="panel empty-state">
        <h1>Welcome</h1>
        <p>Record your first snapshot: add what you own and owe, and what each is worth today.</p>
        <div className="form-actions">
          <a className="button primary" href="#snapshots/new">
            Record a snapshot
          </a>
        </div>
      </div>
    );
  if (error) return <div className="center">{error}</div>;
  if (!data) return null;

  return (
    <>
      <header className="page-header">
        <h1>Net worth</h1>
        <p>Latest snapshot {data.meta.latest_date}</p>
      </header>

      <SummaryMetrics
        summary={data.summary}
        meta={data.meta}
        yearToDateChange={ytdChange}
        basis={basis}
        onBasisChange={setBasis}
      />

      <NetWorthChanges periods={data.net_worth_changes} />

      <div className="two-col">
        <BalanceHistoryChart history={data.history} />
        <CategoryHistoryChart rows={categoryRows.rows} categories={categoryRows.categories} />
      </div>

      <div className="two-col">
        <InvestmentMix
          title="Investment mix"
          segments={mix}
          note="Real estate at equity value; vehicles and pensions left out."
        />
        <InvestmentMix
          title="Available money"
          segments={mix.filter((segment) => segment.name !== CATEGORY.realEstate)}
          note="Money outside real estate: invested in stocks or held as cash."
        />
      </div>

      <div className="two-col">
        <AllocationPanel allocation={data.allocation} categories={categories} totalEquity={assetEquity} />
        <AverageMovementChart averageMonthlyChanges={data.average_monthly_changes} />
      </div>

      <HoldingsTable holdings={data.latest_holdings} />
    </>
  );
}
