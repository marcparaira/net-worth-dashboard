import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { AllocationPanel } from '../components/AllocationPanel';
import { AverageMovementChart } from '../components/AverageMovementChart';
import { BalanceHistoryChart, CategoryHistoryChart } from '../components/HistoryCharts';
import { HoldingsTable } from '../components/HoldingsTable';
import { InvestmentMix } from '../components/InvestmentMix';
import { NetWorthChanges } from '../components/NetWorthChanges';
import { SummaryMetrics } from '../components/SummaryMetrics';
import { useDashboard } from '../hooks/useDashboard';
import { CATEGORY } from '../lib/constants';
import {
  categoryAllocation, categoryHistory, investmentMix, totalAssetEquity, yearToDateChange,
} from '../lib/derive';

export function DashboardPage() {
  const [basis, setBasis] = useState('last_year');
  const { data, loading, error } = useDashboard(basis);

  const categories = useMemo(() => categoryAllocation(data?.allocation), [data]);
  const mix = useMemo(() => investmentMix(categories), [categories]);
  const categoryRows = useMemo(() => categoryHistory(data, categories), [data, categories]);
  const assetEquity = useMemo(() => totalAssetEquity(data?.allocation), [data]);
  const ytdChange = useMemo(() => yearToDateChange(data?.history), [data]);

  if (loading && !data) return <div className="center"><RefreshCw className="spin"/> Loading dashboard…</div>;
  if (error) return <div className="center">{error}</div>;
  if (!data) return null;

  return <>
    <header className="hero">
      <h1>Net worth</h1>
      <p>As of {data.meta.latest_date}</p>
    </header>

    <SummaryMetrics summary={data.summary} meta={data.meta} yearToDateChange={ytdChange}
      basis={basis} onBasisChange={setBasis}/>

    <NetWorthChanges periods={data.net_worth_changes}/>

    <div className="two-col even">
      <BalanceHistoryChart history={data.history}/>
      <CategoryHistoryChart rows={categoryRows.rows} categories={categoryRows.categories}/>
    </div>

    <div className="two-col even">
      <InvestmentMix title="Investment mix" segments={mix}
        note="Immobles at equity value (after subtracting mortgages). Vehicles and Pensions are left out." />
      <InvestmentMix title="Available money" segments={mix.filter(segment => segment.name !== CATEGORY.realEstate)}
        note="How much of the money outside Immobles is invested in Accions versus held as cash and short-term bonds." />
    </div>

    <div className="two-col lower">
      <AllocationPanel allocation={data.allocation} categories={categories} totalEquity={assetEquity}/>
      <AverageMovementChart averageMonthlyChanges={data.average_monthly_changes}/>
    </div>

    <HoldingsTable holdings={data.latest_holdings}/>
  </>;
}
