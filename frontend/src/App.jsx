import { SegmentedControl } from './components/common';
import { useHashPage } from './hooks/useHashPage';
import { DashboardPage } from './pages/DashboardPage';
import { RebalancingPage } from './pages/RebalancingPage';

const PAGES = [
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'rebalancing', label: 'Rebalancing' },
];

export function App() {
  const [page, setPage] = useHashPage(PAGES);

  return <main className="app-shell">
    <nav className="page-nav">
      <SegmentedControl options={PAGES} value={page} onChange={setPage}/>
    </nav>
    {page === 'rebalancing' ? <RebalancingPage/> : <DashboardPage/>}
  </main>;
}
