import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import type { HoldingOut, LiabilityOut } from '../api/types';
import { HoldingForm, LiabilityForm } from '../components/EntryForms';
import { Panel, Swatch } from '../components/common';
import { useApi } from '../hooks/useApi';
import { euro } from '../lib/format';
import { categoryColor } from '../lib/theme';

type Editing = { kind: 'holding' | 'liability'; id: string | null } | null;

function LatestValue({
  amount,
  date,
  negative = false,
}: {
  amount: number | null;
  date: string | null;
  negative?: boolean;
}) {
  if (amount === null) return <span className="hint">No values yet</span>;
  return (
    <span className="holding-value-stack">
      <b>{euro.format(negative ? -amount : amount)}</b>
      <small>{date}</small>
    </span>
  );
}

export function HoldingsPage() {
  const holdingsApi = useApi<HoldingOut[]>('/holdings');
  const liabilitiesApi = useApi<LiabilityOut[]>('/liabilities');
  const categoriesApi = useApi<string[]>('/categories');
  const [editing, setEditing] = useState<Editing>(null);
  const [showClosed, setShowClosed] = useState(false);

  const holdings = holdingsApi.data;
  const liabilities = liabilitiesApi.data;
  const error = holdingsApi.error || liabilitiesApi.error;
  if (error) return <div className="center">{error}</div>;
  if (!holdings || !liabilities)
    return (
      <div className="center">
        <RefreshCw className="spin" /> Loading holdings…
      </div>
    );

  const reload = () => {
    holdingsApi.reload();
    liabilitiesApi.reload();
    categoriesApi.reload();
  };
  const done = () => {
    setEditing(null);
    reload();
  };
  const visible = <T extends { closed_on: string | null }>(items: T[]) =>
    items.filter((item) => showClosed || !item.closed_on);
  const holdingById = new Map(holdings.map((h) => [h.id, h]));
  const closedCount = [...holdings, ...liabilities].filter((item) => item.closed_on).length;

  const editingHolding = editing?.kind === 'holding' ? (holdings.find((h) => h.id === editing.id) ?? null) : null;
  const editingLiability =
    editing?.kind === 'liability' ? (liabilities.find((l) => l.id === editing.id) ?? null) : null;

  const holdingRows = (rows: HoldingOut[]) =>
    rows.map((h) => (
      <div key={h.id} className={`list-row ${h.closed_on ? 'is-closed' : ''}`}>
        <span className="holding-main">
          <strong>{h.name}</strong>
          {h.closed_on ? <small>Closed on {h.closed_on}</small> : null}
          {h.mortgage_id ? <small>Mortgage: {liabilities.find((l) => l.id === h.mortgage_id)?.name}</small> : null}
        </span>
        <span className="category">
          <Swatch color={categoryColor(h.category)} />
          {h.category}
        </span>
        <LatestValue amount={h.latest_amount} date={h.latest_date} />
        <span className="list-actions">
          <button type="button" className="button small" onClick={() => setEditing({ kind: 'holding', id: h.id })}>
            Edit
          </button>
        </span>
      </div>
    ));

  const groups = [
    { title: 'Liquid assets', rows: visible(holdings.filter((h) => h.liquidity === 'liquid')) },
    { title: 'Non-liquid assets', rows: visible(holdings.filter((h) => h.liquidity === 'non_liquid')) },
  ];

  return (
    <>
      <header className="page-header">
        <h1>Holdings</h1>
        <p>What you own and owe. Values are recorded in snapshots.</p>
      </header>

      {editing ? (
        <Panel
          title={
            editing.kind === 'holding'
              ? editing.id
                ? `Edit ${editingHolding?.name ?? 'holding'}`
                : 'New holding'
              : editing.id
                ? `Edit ${editingLiability?.name ?? 'liability'}`
                : 'New liability'
          }
          description={
            editing.kind === 'holding'
              ? 'Changes to the name and category apply to every snapshot.'
              : 'A liability linked to a property is its mortgage.'
          }
        >
          {editing.kind === 'holding' ? (
            <HoldingForm
              key={editing.id ?? 'new'}
              holding={editingHolding}
              categories={categoriesApi.data ?? []}
              onSaved={done}
              onDeleted={done}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <LiabilityForm
              key={editing.id ?? 'new'}
              liability={editingLiability}
              holdings={holdings}
              liabilities={liabilities}
              onSaved={done}
              onDeleted={done}
              onCancel={() => setEditing(null)}
            />
          )}
        </Panel>
      ) : null}

      <Panel
        title="Assets"
        description="Accounts, investments, property, pensions, and vehicles."
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
          </span>
        }
      >
        {holdings.length === 0 ? (
          <p className="empty-state">No holdings yet. Add your accounts and assets, then record a snapshot.</p>
        ) : (
          <>
            <div className="list-head">
              <span>Holding</span>
              <span>Category</span>
              <span>Latest value</span>
              <span />
            </div>
            {groups.map((group) =>
              group.rows.length ? (
                <div key={group.title}>
                  <h3 className="group-title">{group.title}</h3>
                  {holdingRows(group.rows)}
                </div>
              ) : null,
            )}
          </>
        )}
      </Panel>

      <Panel
        title="Liabilities"
        description="Mortgages and other debts."
        actions={
          <button type="button" className="button" onClick={() => setEditing({ kind: 'liability', id: null })}>
            Add liability
          </button>
        }
      >
        {liabilities.length === 0 ? (
          <p className="empty-state">No liabilities.</p>
        ) : (
          <>
            <div className="list-head">
              <span>Liability</span>
              <span>Mortgage on</span>
              <span>Latest value</span>
              <span />
            </div>
            {visible(liabilities).map((l) => (
              <div key={l.id} className={`list-row ${l.closed_on ? 'is-closed' : ''}`}>
                <span className="holding-main">
                  <strong>{l.name}</strong>
                  {l.closed_on ? <small>Closed on {l.closed_on}</small> : null}
                </span>
                <span className="hint">{l.holding_id ? holdingById.get(l.holding_id)?.name : '—'}</span>
                <LatestValue amount={l.latest_amount} date={l.latest_date} negative />
                <span className="list-actions">
                  <button
                    type="button"
                    className="button small"
                    onClick={() => setEditing({ kind: 'liability', id: l.id })}
                  >
                    Edit
                  </button>
                </span>
              </div>
            ))}
          </>
        )}
      </Panel>
    </>
  );
}
