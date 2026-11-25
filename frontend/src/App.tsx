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
  const [page] = useHashPage(PAGES);

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true" />
            <span>Net Worth</span>
          </div>
          <nav className="nav" aria-label="Main">
            {PAGES.map((item) => (
              <a key={item.value} href={`#${item.value}`} aria-current={page === item.value ? 'page' : undefined}>
                {item.label}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <main className="app-shell">
        {page === 'rebalancing' ? <RebalancingPage /> : <DashboardPage />}
        <footer className="app-footer">Net Worth Dashboard · {versionLabel(APP_VERSION)}</footer>
      </main>
    </>
  );
}
