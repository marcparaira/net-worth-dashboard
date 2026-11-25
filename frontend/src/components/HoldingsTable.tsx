import type { HoldingItem } from '../api/types';
import { CATEGORY } from '../lib/constants';
import { euro } from '../lib/format';
import { Panel } from './common';

// e.g. "Liability" -> "liability", which styles the pill.
const pillClass = (category: string): string => category.toLowerCase().replace('-', '');

function HoldingValue({ holding }: { holding: HoldingItem }) {
  return (
    <span className="holding-value-stack">
      <b>
        {holding.category === CATEGORY.liability ? '−' : ''}
        {euro.format(holding.value)}
      </b>
      {holding.has_mortgage ? <small>Equity {euro.format(holding.equity_value)}</small> : null}
    </span>
  );
}

function HoldingRow({ holding }: { holding: HoldingItem }) {
  return (
    <div className={`table-row ${holding.has_mortgage ? 'is-mortgaged' : ''}`}>
      <span className="holding-main">
        <strong>{holding.name}</strong>
        {holding.has_mortgage ? (
          <small>
            {holding.mortgage_name} · {euro.format(holding.mortgage_value)} debt
          </small>
        ) : null}
      </span>
      <span className="holding-tags">
        <span className={`pill ${pillClass(holding.category)}`}>{holding.category}</span>
        {holding.has_mortgage ? <span className="pill mortgage">Mortgage</span> : null}
      </span>
      <HoldingValue holding={holding} />
    </div>
  );
}

export function HoldingsTable({ holdings }: { holdings: HoldingItem[] }) {
  return (
    <Panel title="Latest holdings" kicker="DETAILS">
      <div className="holdings-table">
        <div className="table-head">
          <span>Holding</span>
          <span>Type</span>
          <span>Value</span>
        </div>
        {holdings.map((holding) => (
          <HoldingRow key={holding.id} holding={holding} />
        ))}
      </div>
    </Panel>
  );
}
