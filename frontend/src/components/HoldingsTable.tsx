import type { HoldingItem } from '../api/types';
import { CATEGORY } from '../lib/constants';
import { euro } from '../lib/format';
import { categoryColor } from '../lib/theme';
import { Panel, Swatch } from './common';

function HoldingValue({ holding }: { holding: HoldingItem }) {
  // Liabilities are owed, so they are shown as negative amounts.
  const value = holding.category === CATEGORY.liability ? -holding.value : holding.value;
  return (
    <span className="holding-value-stack">
      <b>{euro.format(value)}</b>
      {holding.has_mortgage ? <small>Equity {euro.format(holding.equity_value)}</small> : null}
    </span>
  );
}

function HoldingRow({ holding }: { holding: HoldingItem }) {
  return (
    <div className="table-row">
      <span className="holding-main">
        <strong>{holding.name}</strong>
        {holding.has_mortgage ? (
          <small>
            {holding.mortgage_name} · {euro.format(holding.mortgage_value)} outstanding
          </small>
        ) : null}
      </span>
      <span className="holding-tags">
        <span className="category">
          <Swatch color={categoryColor(holding.category)} />
          {holding.category}
        </span>
        {holding.has_mortgage ? <span className="tag">Mortgage</span> : null}
      </span>
      <HoldingValue holding={holding} />
    </div>
  );
}

export function HoldingsTable({ holdings }: { holdings: HoldingItem[] }) {
  return (
    <Panel title="Latest holdings" description="Values from the latest snapshot.">
      <div className="holdings-table">
        <div className="table-head">
          <span>Holding</span>
          <span>Category</span>
          <span>Value</span>
        </div>
        {holdings.map((holding) => (
          <HoldingRow key={holding.id} holding={holding} />
        ))}
      </div>
    </Panel>
  );
}
