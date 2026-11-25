import { AlertTriangle, ArrowDown, ArrowUp, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiRequest } from '../api/client';
import type { CategoryIn, CategoryOut, HoldingOut, RebalancingPayload, RebalancingSettings } from '../api/types';
import { Chips } from '../components/Chips';
import { Panel } from '../components/common';
import { useApi } from '../hooks/useApi';
import { euro, signedEuro } from '../lib/format';
import { planRows, type PlanRow } from '../lib/plan';
import {
  addSubBucket,
  bucketShares,
  draftHasErrors,
  emptyBucket,
  fromSettings,
  leafBuckets,
  moveStep,
  newKey,
  removeBucket,
  starterDraft,
  toSettings,
  updateBucket,
  validateDraft,
  type BucketDraft,
  type ReserveDraft,
  type SettingsDraft,
} from '../lib/rebalancingDraft';

const PREVIEW_DELAY_MS = 400;

/**
 * Rebalancing: where the money should be, and the targets that decide it. The same table
 * shows the saved plan and, in edit mode, the targets being changed with a live preview.
 */
export function RebalancingPage() {
  const plan = useApi<RebalancingPayload>('/rebalancing');
  const settings = useApi<RebalancingSettings>('/rebalancing/settings');
  const categories = useApi<CategoryOut[]>('/categories');
  const holdings = useApi<HoldingOut[]>('/holdings');
  const [editing, setEditing] = useState(false);

  const noSettings = settings.status === 404;
  const error =
    (plan.status === 404 ? '' : plan.error) || (noSettings ? '' : settings.error) || categories.error || holdings.error;
  if (error) return <div className="center">{error}</div>;
  if ((!plan.data && plan.status !== 404) || (!settings.data && !noSettings) || !categories.data || !holdings.data)
    return (
      <div className="center">
        <RefreshCw className="spin" /> Loading rebalancing…
      </div>
    );

  const names = categories.data.map((c) => c.name);
  const reload = () => [plan, settings, categories, holdings].forEach((api) => api.reload());

  if (editing)
    return (
      <PlanEditor
        initial={
          settings.data
            ? fromSettings(settings.data)
            : starterDraft(
                names,
                categories.data.filter((c) => c.excluded_from_rebalancing).map((c) => c.name),
              )
        }
        categories={categories.data}
        holdings={holdings.data}
        onDone={() => {
          setEditing(false);
          reload();
        }}
        onCancel={() => setEditing(false)}
      />
    );

  return (
    <PlanView plan={plan.data} settings={settings.data} holdings={holdings.data} onEdit={() => setEditing(true)} />
  );
}

function PlanView({
  plan,
  settings,
  holdings,
  onEdit,
}: {
  plan: RebalancingPayload | null;
  settings: RebalancingSettings | null;
  holdings: HoldingOut[];
  onEdit: () => void;
}) {
  const draft = useMemo(() => (settings ? fromSettings(settings) : null), [settings]);
  const holdingName = (id: string) => holdings.find((h) => h.id === id)?.name ?? 'Unknown holding';

  return (
    <>
      <header className="page-header">
        <h1>Rebalancing</h1>
        <span className="list-actions">
          {plan ? (
            <span className="hint">
              Pool {euro.format(plan.pool)} · {plan.latest_date}
            </span>
          ) : null}
          <button type="button" className="button" onClick={onEdit}>
            {settings ? 'Edit targets' : 'Set up targets'}
          </button>
        </span>
      </header>

      {!draft ? (
        <div className="panel empty-state">
          <p>No targets yet. Decide how your money should be split, and see what to move.</p>
          <div className="form-actions">
            <button type="button" className="button primary" onClick={onEdit}>
              Set up targets
            </button>
          </div>
        </div>
      ) : (
        <>
          {plan?.unassigned.length ? (
            <div className="notice">
              <AlertTriangle size={16} />
              <span>
                Not in any bucket: {plan.unassigned.map((h) => holdingName(h.id)).join(', ')} (
                {euro.format(plan.unassigned.reduce((sum, h) => sum + h.amount, 0))}).
              </span>
            </div>
          ) : null}
          {!plan ? (
            <div className="notice">Add a snapshot to see where your money is against these targets.</div>
          ) : null}
          <div className="panel">
            <PlanTable rows={planRows(draft, plan, holdingName)} shares={bucketShares(draft.buckets)} />
            <PlanSummary draft={draft} plan={plan} />
          </div>
        </>
      )}
    </>
  );
}

/** Exclusions and fill order, as one quiet line each. */
function PlanSummary({ draft, plan }: { draft: SettingsDraft; plan: RebalancingPayload | null }) {
  const steps = new Map([...draft.reserves, ...leafBuckets(draft.buckets)].map((s) => [s.key, s.name]));
  const excludedTotal = plan?.excluded.reduce((sum, h) => sum + h.amount, 0) ?? 0;
  return (
    <div className="plan-summary">
      <p>
        <span>Left out</span>
        {draft.excluded.length
          ? `${draft.excluded.join(', ')}${plan ? ` (${euro.format(excludedTotal)})` : ''}`
          : 'Nothing'}
      </p>
      <p>
        <span>Filled first</span>
        {draft.fillOrder.length
          ? draft.fillOrder.map((key, i) => `${i + 1}. ${steps.get(key)}`).join('  ')
          : 'Nothing; reserves first, then buckets by weight'}
      </p>
    </div>
  );
}

function GapLabel({ gap }: { gap: number }) {
  if (Math.abs(gap) < 1) return <span className="gap on-target">On target</span>;
  return (
    <span className={`gap ${gap > 0 ? 'under' : 'over'}`}>
      {signedEuro.format(gap)} <small>{gap > 0 ? 'to add' : 'over'}</small>
    </span>
  );
}

function Progress({ current, target }: { current: number; target: number }) {
  const ratio = target > 0 ? current / target : current > 0 ? 2 : 0;
  return (
    <span className={`progress ${ratio > 1.005 ? 'is-over' : ''}`} aria-hidden="true">
      <i style={{ width: `${Math.min(ratio, 1) * 100}%` }} />
    </span>
  );
}

interface EditHandlers {
  errors: Record<string, string>;
  expanded: string | null;
  setExpanded: (key: string | null) => void;
  changeReserve: (key: string, next: Partial<ReserveDraft>) => void;
  changeBucket: (key: string, change: (bucket: BucketDraft) => BucketDraft) => void;
  remove: (row: PlanRow) => void;
  addSubBucket: (key: string) => void;
  membersEditor: (row: PlanRow) => ReactNode;
}

/** The plan: one row per reserve and bucket. With `edit`, names, targets, and members are editable. */
function PlanTable({ rows, shares, edit }: { rows: PlanRow[]; shares: Map<string, number>; edit?: EditHandlers }) {
  return (
    <div className="plan-table">
      <div className="plan-head">
        <span>Reserve or bucket</span>
        <span>Target</span>
        <span>Current</span>
        <span>Gap</span>
      </div>
      {rows.map((row) => {
        const isGroup = row.kind === 'bucket' && row.bucket.children.length > 0;
        const name = row.kind === 'reserve' ? row.reserve.name : row.bucket.name;
        const share = row.kind === 'bucket' ? (shares.get(row.key) ?? 0) : null;
        const error = edit?.errors[row.key];
        const open = edit?.expanded === row.key;
        const members =
          row.kind === 'reserve'
            ? `Reserve · ${row.members.join(', ') || 'no categories'}`
            : isGroup
              ? `${row.bucket.children.length} sub-buckets`
              : row.members.join(', ') || 'Holds nothing yet';
        return (
          <div key={row.key} className={`plan-row ${isGroup ? 'is-group' : ''}`} aria-invalid={Boolean(error)}>
            <div className="plan-cells">
              <span className="plan-name" style={{ paddingLeft: row.depth * 20 }}>
                {edit ? (
                  <input
                    className="input"
                    aria-label={row.kind === 'reserve' ? 'Reserve name' : 'Bucket name'}
                    value={name}
                    maxLength={100}
                    onChange={(e) =>
                      row.kind === 'reserve'
                        ? edit.changeReserve(row.key, { name: e.target.value })
                        : edit.changeBucket(row.key, (b) => ({ ...b, name: e.target.value }))
                    }
                  />
                ) : (
                  <strong>{name}</strong>
                )}
                <small>
                  {edit && !isGroup ? (
                    <button
                      type="button"
                      className="link-button"
                      aria-expanded={open}
                      onClick={() => edit.setExpanded(open ? null : row.key)}
                    >
                      {members}
                    </button>
                  ) : (
                    members
                  )}
                  {edit ? (
                    <>
                      {row.kind === 'bucket' ? (
                        <>
                          {' · '}
                          <button type="button" className="link-button" onClick={() => edit.addSubBucket(row.key)}>
                            Split
                          </button>
                        </>
                      ) : null}
                      {' · '}
                      <button type="button" className="link-button danger" onClick={() => edit.remove(row)}>
                        Remove
                      </button>
                    </>
                  ) : null}
                </small>
              </span>
              <span className="plan-target">
                {edit ? (
                  <>
                    <input
                      className="input amount"
                      inputMode="decimal"
                      aria-label={row.kind === 'reserve' ? `${name} amount in euros` : `${name} weight`}
                      value={row.kind === 'reserve' ? row.reserve.amount : row.bucket.weight}
                      onChange={(e) =>
                        row.kind === 'reserve'
                          ? edit.changeReserve(row.key, { amount: e.target.value })
                          : edit.changeBucket(row.key, (b) => ({ ...b, weight: e.target.value }))
                      }
                    />
                    <small>{row.kind === 'reserve' ? 'euros' : `weight · ${(share ?? 0).toFixed(0)}% of pool`}</small>
                  </>
                ) : (
                  <>
                    <b>{row.numbers ? euro.format(row.numbers.target) : '—'}</b>
                    <small>{row.kind === 'reserve' ? 'fixed' : `${(share ?? 0).toFixed(0)}% of pool`}</small>
                  </>
                )}
              </span>
              <span className="plan-current">
                <b>{row.numbers ? euro.format(row.numbers.current) : '—'}</b>
                {row.numbers ? <Progress current={row.numbers.current} target={row.numbers.target} /> : null}
              </span>
              <span className="plan-gap">{row.numbers ? <GapLabel gap={row.numbers.gap} /> : '—'}</span>
            </div>
            {error ? <p className="field-error">{error}</p> : null}
            {open && edit ? <div className="plan-members">{edit.membersEditor(row)}</div> : null}
          </div>
        );
      })}
    </div>
  );
}

function usePreview(settings: RebalancingSettings, valid: boolean) {
  const key = JSON.stringify(settings);
  const [result, setResult] = useState<{ key: string; payload: RebalancingPayload | null; error: string } | null>(null);
  useEffect(() => {
    if (!valid) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      apiRequest<RebalancingPayload>('POST', '/rebalancing/preview', JSON.parse(key) as unknown, controller.signal)
        .then((payload) => setResult({ key, payload, error: '' }))
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          setResult({ key, payload: null, error: err instanceof Error ? err.message : String(err) });
        });
    }, PREVIEW_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [key, valid]);
  const current = result?.key === key;
  return { payload: current ? result.payload : null, error: current ? result.error : '' };
}

function PlanEditor({
  initial,
  categories,
  holdings,
  onDone,
  onCancel,
}: {
  initial: SettingsDraft;
  categories: CategoryOut[];
  holdings: HoldingOut[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [disposable, setDisposable] = useState(() =>
    categories.filter((c) => c.excluded_from_disposable).map((c) => c.name),
  );
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const settings = useMemo(() => toSettings(draft), [draft]);
  const errors = validateDraft(draft);
  const valid = !draftHasErrors(errors);
  const preview = usePreview(settings, valid);
  const holdingName = (id: string) => holdings.find((h) => h.id === id)?.name ?? 'Unknown holding';
  const rows = planRows(draft, preview.payload, holdingName);

  const change = (next: Partial<SettingsDraft>) => setDraft({ ...draft, ...next });
  const categoryOptions = (selected: string[]) =>
    categories
      .map((c) => c.name)
      .filter((name) => !draft.excluded.includes(name) || selected.includes(name))
      .map((name) => ({ value: name, label: name }));
  const steps = [...draft.reserves, ...leafBuckets(draft.buckets)];
  const stepName = new Map(steps.map((s) => [s.key, s.name || '(unnamed)']));

  const edit: EditHandlers = {
    errors: errors.items,
    expanded,
    setExpanded,
    changeReserve: (key, next) =>
      change({ reserves: draft.reserves.map((r) => (r.key === key ? { ...r, ...next } : r)) }),
    changeBucket: (key, fn) => change({ buckets: updateBucket(draft.buckets, key, fn) }),
    remove: (row) =>
      change({
        reserves: row.kind === 'reserve' ? draft.reserves.filter((r) => r.key !== row.key) : draft.reserves,
        buckets: row.kind === 'bucket' ? removeBucket(draft.buckets, row.key) : draft.buckets,
        fillOrder: draft.fillOrder.filter((k) => k !== row.key),
      }),
    addSubBucket: (key) => change({ buckets: addSubBucket(draft.buckets, key) }),
    membersEditor: (row) => {
      if (row.kind === 'reserve')
        return (
          <Chips
            label={`Categories ${row.reserve.name} draws from`}
            options={categoryOptions(row.reserve.categories)}
            selected={row.reserve.categories}
            onChange={(selected) => edit.changeReserve(row.key, { categories: selected })}
          />
        );
      const taken = new Set(
        leafBuckets(draft.buckets)
          .filter((b) => b.key !== row.key)
          .flatMap((b) => b.holdingIds),
      );
      return (
        <>
          <Chips
            label={`Categories in ${row.bucket.name}`}
            options={categoryOptions(row.bucket.categories)}
            selected={row.bucket.categories}
            onChange={(selected) => edit.changeBucket(row.key, (b) => ({ ...b, categories: selected }))}
          />
          <Chips
            label={`Holdings in ${row.bucket.name}`}
            options={holdings
              .filter((h) => !h.closed_on || row.bucket.holdingIds.includes(h.id))
              .map((h) => ({ value: h.id, label: h.name }))}
            selected={row.bucket.holdingIds}
            disabled={(id) => taken.has(id)}
            onChange={(selected) => edit.changeBucket(row.key, (b) => ({ ...b, holdingIds: selected }))}
          />
          <small className="hint">A holding picked here goes only to this bucket.</small>
        </>
      );
    },
  };

  const save = async () => {
    setSaving(true);
    setSaveError('');
    try {
      // Disposable-value exclusions are category flags; save the categories that changed first.
      for (const category of categories) {
        const excluded = disposable.includes(category.name);
        if (excluded === category.excluded_from_disposable) continue;
        const body: CategoryIn = {
          name: category.name,
          excluded_from_disposable: excluded,
          excluded_from_rebalancing: category.excluded_from_rebalancing,
        };
        await apiRequest('PUT', `/categories/${category.id}`, body);
      }
      await apiRequest('PUT', '/rebalancing/settings', settings);
      onDone();
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const allCategories = categories.map((c) => ({ value: c.name, label: c.name }));

  return (
    <>
      <header className="page-header">
        <h1>Edit targets</h1>
        <span className="hint">
          {preview.payload ? `Pool ${euro.format(preview.payload.pool)} · ` : ''}Figures update as you type.
        </span>
      </header>

      {preview.error ? <div className="notice">{preview.error}</div> : null}

      <div className="panel">
        <PlanTable rows={rows} shares={bucketShares(draft.buckets)} edit={edit} />
        <div className="form-actions">
          <button
            type="button"
            className="button"
            onClick={() =>
              change({
                reserves: [...draft.reserves, { key: newKey(), name: 'New reserve', amount: '', categories: [] }],
              })
            }
          >
            Add reserve
          </button>
          <button
            type="button"
            className="button"
            onClick={() => change({ buckets: [...draft.buckets, emptyBucket()] })}
          >
            Add bucket
          </button>
        </div>
        {errors.form ? <p className="form-error">{errors.form}</p> : null}
      </div>

      <div className="two-col">
        <Panel title="Left out" description="Categories ignored by the plan, and by the disposable net value.">
          <div className="field">
            <span>From the plan</span>
            <Chips
              label="Categories left out of the plan"
              options={allCategories}
              selected={draft.excluded}
              onChange={(excluded) => change({ excluded })}
            />
          </div>
          <div className="field" style={{ marginTop: 16 }}>
            <span>From the disposable net value</span>
            <Chips
              label="Categories left out of the disposable net value"
              options={allCategories}
              selected={disposable}
              onChange={setDisposable}
            />
          </div>
        </Panel>

        <Panel title="Filled first" description="These get first pick of the money they accept, in order.">
          {draft.fillOrder.length ? (
            <ol className="steps">
              {draft.fillOrder.map((key, index) => (
                <li key={key}>
                  <span className="step-number">{index + 1}</span>
                  <span className="step-name">{stepName.get(key)}</span>
                  <button
                    type="button"
                    className="button small"
                    aria-label={`Move ${stepName.get(key)} up`}
                    disabled={index === 0}
                    onClick={() => change({ fillOrder: moveStep(draft.fillOrder, key, -1) })}
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    className="button small"
                    aria-label={`Move ${stepName.get(key)} down`}
                    disabled={index === draft.fillOrder.length - 1}
                    onClick={() => change({ fillOrder: moveStep(draft.fillOrder, key, 1) })}
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    type="button"
                    className="link-button"
                    aria-label={`Stop filling ${stepName.get(key)} first`}
                    onClick={() => change({ fillOrder: draft.fillOrder.filter((k) => k !== key) })}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="hint">Nothing. Reserves are filled first, then buckets by weight.</p>
          )}
          <div className="chips" style={{ marginTop: 12 }}>
            {steps
              .filter((s) => !draft.fillOrder.includes(s.key))
              .map((s) => (
                <button
                  key={s.key}
                  type="button"
                  className="button small"
                  onClick={() => change({ fillOrder: [...draft.fillOrder, s.key] })}
                >
                  + {s.name || '(unnamed)'}
                </button>
              ))}
          </div>
        </Panel>
      </div>

      {saveError ? (
        <div className="notice" role="alert">
          {saveError}
        </div>
      ) : null}

      <div className="sticky-footer">
        <span className="totals">
          <span className="hint">
            {valid ? 'Nothing is saved until you save.' : 'Fix the highlighted rows to save.'}
          </span>
        </span>
        <button type="button" className="button" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="button" className="button primary" onClick={() => void save()} disabled={!valid || saving}>
          {saving ? 'Saving…' : 'Save targets'}
        </button>
      </div>
    </>
  );
}
