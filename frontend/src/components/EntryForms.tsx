import { useState, type FormEvent } from 'react';
import { apiRequest } from '../api/client';
import type { HoldingIn, HoldingOut, LiabilityIn, LiabilityOut, Liquidity } from '../api/types';
import { todayIso } from '../lib/entries';
import { ConfirmDialog, Field } from './forms';

function useSubmit<T>(): {
  busy: boolean;
  error: string;
  run: (action: () => Promise<T>, done: (result: T) => void) => void;
} {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = (action: () => Promise<T>, done: (result: T) => void) => {
    setBusy(true);
    setError('');
    action()
      .then(done)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false));
  };
  return { busy, error, run };
}

function ClosedField({
  closed,
  closedOn,
  onChange,
  hint,
}: {
  closed: boolean;
  closedOn: string;
  onChange: (closed: boolean, closedOn: string) => void;
  hint: string;
}) {
  return (
    <div className="field">
      <label className="field-check">
        <input type="checkbox" checked={closed} onChange={(e) => onChange(e.target.checked, closedOn || todayIso())} />
        <span>Closed</span>
      </label>
      {closed ? (
        <input
          className="input"
          type="date"
          aria-label="Closed on"
          value={closedOn}
          max={todayIso()}
          onChange={(e) => onChange(true, e.target.value)}
        />
      ) : null}
      <small>{hint}</small>
    </div>
  );
}

/** Add or edit a holding: name, category, liquidity, and whether it is closed. */
export function HoldingForm({
  holding,
  categories,
  defaultLiquidity = 'liquid',
  onSaved,
  onDeleted,
  onCancel,
}: {
  holding: HoldingOut | null;
  categories: string[];
  defaultLiquidity?: Liquidity;
  onSaved: (holding: HoldingOut) => void;
  onDeleted: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(holding?.name ?? '');
  const [category, setCategory] = useState(holding?.category ?? '');
  const [liquidity, setLiquidity] = useState<Liquidity>(holding?.liquidity ?? defaultLiquidity);
  const [closed, setClosed] = useState(Boolean(holding?.closed_on));
  const [closedOn, setClosedOn] = useState(holding?.closed_on ?? '');
  const [touched, setTouched] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const save = useSubmit<HoldingOut>();
  const remove = useSubmit<void>();

  const errors = {
    name: name.trim() ? '' : 'Enter a name',
    category: category.trim() ? '' : 'Choose or type a category',
  };
  const categoryChanged = holding !== null && category.trim() !== holding.category;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (errors.name || errors.category) return;
    const body: HoldingIn = { name, category, liquidity, closed_on: closed ? closedOn : null };
    save.run(
      () =>
        holding
          ? apiRequest<HoldingOut>('PUT', `/holdings/${holding.id}`, body)
          : apiRequest<HoldingOut>('POST', '/holdings', body),
      onSaved,
    );
  };

  return (
    <form onSubmit={submit} noValidate>
      <div className="form-grid">
        <Field label="Name" error={touched ? errors.name : ''}>
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              className="input"
              value={name}
              maxLength={200}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <Field
          label="Category"
          error={touched ? errors.category : ''}
          hint={
            categoryChanged && holding?.in_rebalancing ? (
              <span className="hint warning">
                Used in the rebalancing settings; check them after changing the category.
              </span>
            ) : (
              'Pick one or type a new one.'
            )
          }
        >
          {({ id, describedBy, invalid }) => (
            <>
              <input
                id={id}
                className="input"
                list="category-options"
                value={category}
                maxLength={100}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                onChange={(e) => setCategory(e.target.value)}
              />
              <datalist id="category-options">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <Field
          label="Liquidity"
          hint="Liquid: available within days (cash, funds). Non-liquid: property, pensions, vehicles."
        >
          {({ id, describedBy }) => (
            <select
              id={id}
              className="input"
              value={liquidity}
              aria-describedby={describedBy}
              onChange={(e) => setLiquidity(e.target.value as Liquidity)}
            >
              <option value="liquid">Liquid</option>
              <option value="non_liquid">Non-liquid</option>
            </select>
          )}
        </Field>
        {holding ? (
          <ClosedField
            closed={closed}
            closedOn={closedOn}
            hint="Closed holdings keep their history and no longer appear in new snapshots."
            onChange={(isClosed, on) => {
              setClosed(isClosed);
              setClosedOn(on);
            }}
          />
        ) : null}
      </div>
      {save.error || remove.error ? <p className="form-error">{save.error || remove.error}</p> : null}
      <div className="form-actions">
        {holding && holding.value_count === 0 ? (
          <button type="button" className="button danger" onClick={() => setConfirmDelete(true)}>
            Delete
          </button>
        ) : null}
        <span className="spacer" />
        <button type="button" className="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="button primary" disabled={save.busy}>
          {holding ? 'Save holding' : 'Add holding'}
        </button>
      </div>
      {holding ? (
        <ConfirmDialog
          open={confirmDelete}
          title="Delete holding"
          confirmLabel="Delete"
          busy={remove.busy}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() =>
            remove.run(
              () => apiRequest<void>('DELETE', `/holdings/${holding.id}`),
              () => {
                setConfirmDelete(false);
                onDeleted();
              },
            )
          }
        >
          <p>
            Delete <strong>{holding.name}</strong>? It has no values in any snapshot, so no history is lost.
          </p>
        </ConfirmDialog>
      ) : null}
    </form>
  );
}

/** Add or edit a liability; linking it to a property makes it that property's mortgage. */
export function LiabilityForm({
  liability,
  holdings,
  liabilities,
  onSaved,
  onDeleted,
  onCancel,
}: {
  liability: LiabilityOut | null;
  holdings: HoldingOut[];
  liabilities: LiabilityOut[];
  onSaved: (liability: LiabilityOut) => void;
  onDeleted: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(liability?.name ?? '');
  const [holdingId, setHoldingId] = useState(liability?.holding_id ?? '');
  const [closed, setClosed] = useState(Boolean(liability?.closed_on));
  const [closedOn, setClosedOn] = useState(liability?.closed_on ?? '');
  const [touched, setTouched] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const save = useSubmit<LiabilityOut>();
  const remove = useSubmit<void>();

  // A property can have one mortgage: offer the properties that are free, plus the current link.
  const taken = new Set(liabilities.filter((l) => l.id !== liability?.id).map((l) => l.holding_id));
  const properties = holdings.filter((h) => !taken.has(h.id) && (!h.closed_on || h.id === liability?.holding_id));
  const nameError = name.trim() ? '' : 'Enter a name';

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (nameError) return;
    const body: LiabilityIn = { name, holding_id: holdingId || null, closed_on: closed ? closedOn : null };
    save.run(
      () =>
        liability
          ? apiRequest<LiabilityOut>('PUT', `/liabilities/${liability.id}`, body)
          : apiRequest<LiabilityOut>('POST', '/liabilities', body),
      onSaved,
    );
  };

  return (
    <form onSubmit={submit} noValidate>
      <div className="form-grid">
        <Field label="Name" error={touched ? nameError : ''}>
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              className="input"
              value={name}
              maxLength={200}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <Field label="Mortgage on" hint="Link a mortgage to the property it finances.">
          {({ id, describedBy }) => (
            <select
              id={id}
              className="input"
              value={holdingId}
              aria-describedby={describedBy}
              onChange={(e) => setHoldingId(e.target.value)}
            >
              <option value="">Not a mortgage</option>
              {properties.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        {liability ? (
          <ClosedField
            closed={closed}
            closedOn={closedOn}
            hint="Closed (repaid) liabilities keep their history and no longer appear in new snapshots."
            onChange={(isClosed, on) => {
              setClosed(isClosed);
              setClosedOn(on);
            }}
          />
        ) : null}
      </div>
      {save.error || remove.error ? <p className="form-error">{save.error || remove.error}</p> : null}
      <div className="form-actions">
        {liability && liability.value_count === 0 ? (
          <button type="button" className="button danger" onClick={() => setConfirmDelete(true)}>
            Delete
          </button>
        ) : null}
        <span className="spacer" />
        <button type="button" className="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="button primary" disabled={save.busy}>
          {liability ? 'Save liability' : 'Add liability'}
        </button>
      </div>
      {liability ? (
        <ConfirmDialog
          open={confirmDelete}
          title="Delete liability"
          confirmLabel="Delete"
          busy={remove.busy}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() =>
            remove.run(
              () => apiRequest<void>('DELETE', `/liabilities/${liability.id}`),
              () => {
                setConfirmDelete(false);
                onDeleted();
              },
            )
          }
        >
          <p>
            Delete <strong>{liability.name}</strong>? It has no values in any snapshot, so no history is lost.
          </p>
        </ConfirmDialog>
      ) : null}
    </form>
  );
}
