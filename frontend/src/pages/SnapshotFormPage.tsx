import { RefreshCw } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { apiRequest } from '../api/client';
import type { CategoryOut, HoldingOut, LiabilityOut, SnapshotDetail, SnapshotOut, SnapshotSummary } from '../api/types';
import { HoldingForm, LiabilityForm } from '../components/EntryForms';
import { Panel } from '../components/common';
import { useApi } from '../hooks/useApi';
import { navigate } from '../hooks/useHashRoute';
import {
  buildGroups,
  hasErrors,
  initialTexts,
  netWorth,
  parseAmount,
  snapshotPayload,
  todayIso,
  validateSnapshot,
  type EntryRow,
} from '../lib/entries';
import { euro, signedEuro, trendClass } from '../lib/format';

/** Loads what the form needs, then shows it: a new snapshot (`snapshotId` null) or an existing one. */
export function SnapshotFormPage({ snapshotId }: { snapshotId: string | null }) {
  const holdings = useApi<HoldingOut[]>('/holdings');
  const liabilities = useApi<LiabilityOut[]>('/liabilities');
  const categories = useApi<CategoryOut[]>('/categories');
  const snapshots = useApi<SnapshotSummary[]>('/snapshots');
  // A new snapshot starts from the latest one; an existing one from itself.
  const sourceId = snapshotId ?? snapshots.data?.[0]?.id ?? null;
  const source = useApi<SnapshotDetail>(sourceId ? `/snapshots/${sourceId}` : null);

  const error = holdings.error || liabilities.error || snapshots.error || source.error;
  if (error) return <div className="center">{error}</div>;
  const ready =
    holdings.data && liabilities.data && snapshots.data && (sourceId === null || source.data?.id === sourceId);
  if (!ready || !holdings.data || !liabilities.data || !snapshots.data)
    return (
      <div className="center">
        <RefreshCw className="spin" /> Loading…
      </div>
    );

  const detail = sourceId ? source.data : null;
  return (
    <SnapshotEditor
      key={snapshotId ?? 'new'}
      snapshot={snapshotId ? detail : null}
      previous={snapshotId ? (detail?.previous ?? null) : detail}
      holdings={holdings.data}
      liabilities={liabilities.data}
      categories={(categories.data ?? []).map((c) => c.name)}
      takenDates={snapshots.data.filter((s) => s.id !== snapshotId).map((s) => s.date)}
      onEntriesChanged={() => {
        holdings.reload();
        liabilities.reload();
        categories.reload();
      }}
    />
  );
}

/** The holding or liability whose form is open; `id` null when adding a new one. */
type Editing = { kind: 'holding' | 'liability'; id: string | null } | null;

function SnapshotEditor({
  snapshot,
  previous,
  holdings,
  liabilities,
  categories,
  takenDates,
  onEntriesChanged,
}: {
  /** The snapshot being edited, or null for a new one. */
  snapshot: SnapshotDetail | null;
  /** What the form compares with: the snapshot before, or for a new one the latest. */
  previous: SnapshotOut | null;
  holdings: HoldingOut[];
  liabilities: LiabilityOut[];
  categories: string[];
  takenDates: string[];
  onEntriesChanged: () => void;
}) {
  const [showClosed, setShowClosed] = useState(false);
  const groups = useMemo(
    () => buildGroups(holdings, liabilities, previous?.values, snapshot?.values, showClosed),
    [holdings, liabilities, previous, snapshot, showClosed],
  );
  // A new snapshot is pre-filled with the latest values, so only what changed needs typing.
  const [initial] = useState(() => initialTexts(groups, snapshot ? snapshot.values : previous?.values));
  const [texts, setTexts] = useState<Record<string, string>>(initial);
  const [date, setDate] = useState(snapshot?.date ?? todayIso());
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [editing, setEditing] = useState<Editing>(null);

  const errors = validateSnapshot(date, takenDates, groups, texts);
  const amountOf = (row: EntryRow) => parseAmount(texts[row.key] ?? '').amount;
  const previousTotal = previous ? netWorth(groups, (row) => row.previous) : null;
  const total = netWorth(groups, amountOf);

  const closedCount = [...holdings, ...liabilities].filter((item) => item.closed_on).length;

  // Not a <form> submit: holding and liability forms open inside this page, and forms cannot nest.
  const submit = () => {
    setSubmitted(true);
    if (hasErrors(errors)) return;
    setSaving(true);
    setSaveError('');
    const body = snapshotPayload(date, groups, texts);
    const request = snapshot
      ? apiRequest<SnapshotDetail>('PUT', `/snapshots/${snapshot.id}`, body)
      : apiRequest<SnapshotDetail>('POST', '/snapshots', body);
    request
      .then(() => navigate('snapshots'))
      .catch((err: unknown) => setSaveError(err instanceof Error ? err.message : String(err)))
      .finally(() => setSaving(false));
  };

  const entryChanged = () => {
    setEditing(null);
    onEntriesChanged();
  };

  const entryForm = (open: NonNullable<Editing>) =>
    open.kind === 'holding' ? (
      <HoldingForm
        key={open.id ?? 'new'}
        holding={holdings.find((h) => h.id === open.id) ?? null}
        categories={categories}
        onSaved={entryChanged}
        onDeleted={entryChanged}
        onCancel={() => setEditing(null)}
      />
    ) : (
      <LiabilityForm
        key={open.id ?? 'new'}
        liability={liabilities.find((l) => l.id === open.id) ?? null}
        holdings={holdings}
        liabilities={liabilities}
        onSaved={entryChanged}
        onDeleted={entryChanged}
        onCancel={() => setEditing(null)}
      />
    );

  return (
    <div>
      <header className="page-header">
        <h1>{snapshot ? `Snapshot of ${snapshot.date}` : 'New snapshot'}</h1>
        <p>{previous ? `Compared with ${previous.date}` : 'Your first snapshot'}</p>
      </header>

      <Panel
        title="Date"
        description={snapshot ? 'Changing the date moves this snapshot.' : 'The date these values are from.'}
      >
        <label className="field" style={{ maxWidth: 220 }}>
          <span>Snapshot date</span>
          <input
            className="input"
            type="date"
            value={date}
            max={todayIso()}
            aria-invalid={Boolean(errors.date)}
            onChange={(e) => setDate(e.target.value)}
          />
          {errors.date ? (
            <span className="field-error" role="alert">
              {errors.date}
            </span>
          ) : null}
        </label>
      </Panel>

      {editing && editing.id === null ? (
        <Panel title={editing.kind === 'holding' ? 'New holding' : 'New liability'}>{entryForm(editing)}</Panel>
      ) : null}

      <Panel
        title="Values"
        description="Leave a field empty for anything not held on this date. Edit a holding to rename it, change its category, or close it."
        actions={
          <span className="list-actions">
            {closedCount ? (
              <label className="field-check hint">
                <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
                Show closed ({closedCount})
              </label>
            ) : null}
            <button type="button" className="button" onClick={() => setEditing({ kind: 'holding', id: null })}>
              Add holding
            </button>
            <button type="button" className="button" onClick={() => setEditing({ kind: 'liability', id: null })}>
              Add liability
            </button>
          </span>
        }
      >
        {groups.length === 0 ? (
          <p className="empty-state">Add your first holding to record its value.</p>
        ) : (
          <>
            <div className="entry-head">
              <span>Holding</span>
              <span>Previous</span>
              <span>Value on this date</span>
              <span>Change</span>
            </div>
            {groups.map((group) => (
              <div key={group.key}>
                <h3 className="group-title">{group.title}</h3>
                {group.rows.map((row) => {
                  const amount = amountOf(row);
                  const change = amount !== null && row.previous !== null ? amount - row.previous : null;
                  const changed = (texts[row.key] ?? '') !== (initial[row.key] ?? '');
                  const error = errors.amounts[row.key];
                  const open = editing?.kind === row.kind && editing.id === row.id;
                  return (
                    <Fragment key={row.key}>
                      <div
                        className={`entry-row ${changed ? 'is-changed' : ''} ${row.propertyKey ? 'is-mortgage' : ''}`}
                      >
                        <span className="holding-main">
                          <strong>{row.name}</strong>
                          <small>
                            {row.label}
                            {row.closed ? ' · Closed' : ''} ·{' '}
                            <button
                              type="button"
                              className="link-button"
                              aria-expanded={open}
                              aria-label={`Edit ${row.name}`}
                              onClick={() => setEditing(open ? null : { kind: row.kind, id: row.id })}
                            >
                              Edit
                            </button>
                          </small>
                        </span>
                        <span className="hint">{row.previous === null ? '—' : euro.format(row.previous)}</span>
                        <span className="entry-input">
                          <input
                            className="input amount"
                            inputMode="decimal"
                            autoComplete="off"
                            aria-label={`${row.name} value`}
                            aria-invalid={Boolean(error)}
                            value={texts[row.key] ?? ''}
                            onChange={(e) => setTexts({ ...texts, [row.key]: e.target.value })}
                          />
                          {error ? <span className="field-error">{error}</span> : null}
                        </span>
                        <span className="hint">{change ? signedEuro.format(change) : ''}</span>
                      </div>
                      {open ? (
                        <div className="entry-editor">
                          <p className="hint">Changes apply to {row.name} in every snapshot.</p>
                          {entryForm({ kind: row.kind, id: row.id })}
                        </div>
                      ) : null}
                    </Fragment>
                  );
                })}
              </div>
            ))}
          </>
        )}
        {submitted && errors.form ? <p className="form-error">{errors.form}</p> : null}
      </Panel>

      {saveError ? (
        <div className="notice" role="alert">
          {saveError}
        </div>
      ) : null}

      <div className="sticky-footer">
        <span className="totals">
          <span className="hint">Net worth</span>
          {previousTotal !== null ? <span className="hint">{euro.format(previousTotal)} →</span> : null}
          <strong>{euro.format(total)}</strong>
          {previousTotal !== null ? (
            <span className={trendClass(total - previousTotal)}>{signedEuro.format(total - previousTotal)}</span>
          ) : null}
        </span>
        <a className="button" href="#snapshots">
          Cancel
        </a>
        <button type="button" className="button primary" disabled={saving} onClick={submit}>
          {saving ? 'Saving…' : snapshot ? 'Save changes' : 'Save snapshot'}
        </button>
      </div>
    </div>
  );
}
