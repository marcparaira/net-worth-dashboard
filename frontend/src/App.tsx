import { SegmentedControl } from './components/common';
import { useHashPage } from './hooks/useHashPage';
import type { Option } from './lib/constants';
import { APP_VERSION, versionLabel } from './lib/version';
import { DashboardPage } from './pages/DashboardPage';
import { RebalancingPage } from './pages/RebalancingPage';

type Page = 'dashboard' | 'rebalancing';

const PAGES: readonly Option<Page>[] = [
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'rebalancing', label: 'Rebalancing' },
];

export function App() {
  const [page, setPage] = useHashPage(PAGES);

  return (
    <main className="app-shell">
      <nav className="page-nav">
        <SegmentedControl options={PAGES} value={page} onChange={setPage} />
      </nav>
      {page === 'rebalancing' ? <RebalancingPage /> : <DashboardPage />}
      <footer className="app-footer">Net Worth Dashboard · {versionLabel(APP_VERSION)}</footer>
    </main>
  );
}
