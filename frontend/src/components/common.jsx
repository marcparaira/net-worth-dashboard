import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { euro, trendClass } from '../lib/format';

export function Panel({ title, kicker, children, className = '' }) {
  return <section className={`panel ${className}`}>
    <header><div><span>{kicker}</span><h2>{title}</h2></div></header>
    {children}
  </section>;
}

export function TrendIcon({ value }) {
  if (value > 0) return <ArrowUpRight size={15}/>;
  if (value < 0) return <ArrowDownRight size={15}/>;
  return null;
}

/** Sign-coloured line with an up/down arrow. */
export function TrendLine({ value, children }) {
  return <div className={`metric-sub ${trendClass(value)}`}>
    <TrendIcon value={value}/>
    {children}
  </div>;
}

export function MetricCard({ title, value, subtitle, detail, trend }) {
  return <section className="metric-card">
    <div className="metric-top"><span>{title}</span></div>
    <strong>{euro.format(value || 0)}</strong>
    <TrendLine value={trend}>
      <div>
        <div>{subtitle}</div>
        {detail ? <small>{detail}</small> : null}
      </div>
    </TrendLine>
  </section>;
}

/** Colour-dot legend row used next to donut and bar charts. */
export function LegendRow({ color, label, note, amount, className }) {
  return <div className={className}>
    <i style={{ background: color }}/>
    <span>{label}<small>{note}</small></span>
    <b>{amount}</b>
  </div>;
}

export function SegmentedControl({ options, value, onChange }) {
  return <div className="segmented">
    {options.map(option => <button key={option.value} type="button" aria-pressed={value === option.value}
      className={value === option.value ? 'active' : ''} onClick={() => onChange(option.value)}>
      {option.label}
    </button>)}
  </div>;
}
