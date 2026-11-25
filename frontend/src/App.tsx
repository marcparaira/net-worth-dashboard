import { useHashRoute } from './hooks/useHashRoute';
import { APP_VERSION, versionLabel } from './lib/version';
import { DashboardPage } from './pages/DashboardPage';
import { RebalancingPage } from './pages/RebalancingPage';
import { SnapshotFormPage } from './pages/SnapshotFormPage';
import { SnapshotsPage } from './pages/SnapshotsPage';

const NAV = [
  { path: 'dashboard', label: 'Dashboard' },
  { path: 'rebalancing', label: 'Rebalancing' },
  { path: 'snapshots', label: 'Snapshots' },
] as const;

function Page({ route }: { route: string[] }) {
  const [section = 'dashboard', id] = route;
  switch (section) {
    case 'rebalancing':
      return <RebalancingPage />;
    case 'snapshots':
      if (id === 'new') return <SnapshotFormPage key="new" snapshotId={null} />;
      if (id) return <SnapshotFormPage key={id} snapshotId={id} />;
      return <SnapshotsPage />;
    default:
      return <DashboardPage />;
  }
}

export function App() {
  const route = useHashRoute();
  const section = route[0] ?? 'dashboard';

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true" />
            <span>Net Worth</span>
          </div>
          <nav className="nav" aria-label="Main">
            {NAV.map((item) => (
              <a key={item.path} href={`#${item.path}`} aria-current={section === item.path ? 'page' : undefined}>
                {item.label}
              </a>
            ))}
          </nav>
          <a className="button primary" href="#snapshots/new">
            New snapshot
          </a>
        </div>
      </header>
      <main className="app-shell">
        <Page route={route} />
        <footer className="app-footer">Net Worth Dashboard · {versionLabel(APP_VERSION)}</footer>
      </main>
    </>
  );
}
