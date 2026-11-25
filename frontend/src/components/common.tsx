import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Option } from '../lib/constants';
import { euro, trendClass } from '../lib/format';

type Trend = number | null | undefined;

export function Panel({
  title,
  description,
  actions,
  children,
  className = '',
}: {
  title: string;
  description?: ReactNode;
  /** Controls shown at the right of the header, such as a view toggle. */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <header className="panel-header">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}

/** Small colour square identifying a category or series. */
export function Swatch({ color }: { color: string }) {
  return <i className="swatch" style={{ background: color }} aria-hidden="true" />;
}

export function TrendIcon({ value }: { value: Trend }) {
  if (value == null) return null;
  if (value > 0) return <ArrowUpRight size={15} />;
  if (value < 0) return <ArrowDownRight size={15} />;
  return null;
}

/** Sign-coloured line with an up/down arrow. */
export function TrendLine({ value, children }: { value: Trend; children: ReactNode }) {
  return (
    <div className={`metric-sub ${trendClass(value)}`}>
      <TrendIcon value={value} />
      {children}
    </div>
  );
}

export function MetricCard({
  title,
  value,
  subtitle,
  detail,
  trend,
}: {
  title: string;
  value: number;
  subtitle: ReactNode;
  detail?: string;
  trend?: Trend;
}) {
  return (
    <section className="metric-card">
      <div className="metric-top">
        <span>{title}</span>
      </div>
      <strong>{euro.format(value || 0)}</strong>
      <TrendLine value={trend}>
        <div>
          <div>{subtitle}</div>
          {detail ? <small>{detail}</small> : null}
        </div>
      </TrendLine>
    </section>
  );
}

/** Colour-dot legend row used next to donut and bar charts. */
export function LegendRow({
  color,
  label,
  note,
  amount,
  className,
}: {
  color: string;
  label: ReactNode;
  note?: ReactNode;
  amount: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <i style={{ background: color }} aria-hidden="true" />
      <span>
        {label}
        <small>{note}</small>
      </span>
      <b>{amount}</b>
    </div>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name of the group, such as "Allocation view". */
  label?: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          className={value === option.value ? 'active' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
