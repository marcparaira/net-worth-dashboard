import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { apiRequest } from '../api/client';
import type { SnapshotSummary } from '../api/types';
import { Panel } from '../components/common';
import { ConfirmDialog } from '../components/forms';
import { useApi } from '../hooks/useApi';
import { euro, signedEuro, trendClass } from '../lib/format';

export function SnapshotsPage() {
  const { data, error, reload } = useApi<SnapshotSummary[]>('/snapshots');
  const [deleting, setDeleting] = useState<SnapshotSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  if (error) return <div className="center">{error}</div>;
  if (!data)
    return (
      <div className="center">
        <RefreshCw className="spin" /> Loading snapshots…
      </div>
    );

  const confirmDelete = () => {
    if (!deleting) return;
    setBusy(true);
    setDeleteError('');
    apiRequest<void>('DELETE', `/snapshots/${deleting.id}`)
      .then(() => {
        setDeleting(null);
        reload();
      })
      .catch((err: unknown) => setDeleteError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false));
  };

  return (
    <>
      <header className="page-header">
        <h1>Snapshots</h1>
        <p>Your balance sheet on each date. Newest first.</p>
      </header>

      <Panel
        title={`${data.length} snapshot${data.length === 1 ? '' : 's'}`}
        actions={
          <a className="button primary" href="#snapshots/new">
            New snapshot
          </a>
        }
      >
        {data.length === 0 ? (
          <div className="empty-state">
            <p>No snapshots yet. Add your holdings, then record what each one is worth today.</p>
            <div className="form-actions">
              <a className="button" href="#holdings">
                Add holdings
              </a>
              <a className="button primary" href="#snapshots/new">
                New snapshot
              </a>
            </div>
          </div>
        ) : (
          <div className="snapshot-list">
            <div className="list-head">
              <span>Date</span>
              <span>Net worth</span>
              <span>Change</span>
              <span>Values</span>
              <span />
            </div>
            {data.map((snapshot) => (
              <div key={snapshot.id} className="list-row">
                <strong>{snapshot.date}</strong>
                <b>{euro.format(snapshot.net_worth)}</b>
                <span className={trendClass(snapshot.change)}>
                  {snapshot.change === null ? '—' : signedEuro.format(snapshot.change)}
                </span>
                <span className="hint">{snapshot.value_count}</span>
                <span className="list-actions">
                  <a className="button small" href={`#snapshots/${snapshot.id}`}>
                    Edit
                  </a>
                  <button type="button" className="button small danger" onClick={() => setDeleting(snapshot)}>
                    Delete
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete snapshot"
        confirmLabel="Delete snapshot"
        busy={busy}
        onCancel={() => {
          setDeleting(null);
          setDeleteError('');
        }}
        onConfirm={confirmDelete}
      >
        {deleting ? (
          <p>
            Delete the snapshot of <strong>{deleting.date}</strong>, with {deleting.value_count} values and a net worth
            of {euro.format(deleting.net_worth)}? This cannot be undone.
          </p>
        ) : null}
        {deleteError ? <p className="form-error">{deleteError}</p> : null}
      </ConfirmDialog>
    </>
  );
}
