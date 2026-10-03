import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { euro, formatCompactEuro } from '../lib/format';
import { axisProps, gridProps, paletteColor, tooltipProps } from '../lib/theme';
import { DonutChart } from './DonutChart';
import { LegendRow, Panel, SegmentedControl } from './common';

const VIEWS = [
  { value: 'holdings', label: 'Holdings' },
  { value: 'types', label: 'Asset types' },
];
const MAX_LEGEND_HOLDINGS = 7;

function holdingNote(item) {
  const base = `${item.category} · ${item.share}%`;
  return item.has_mortgage
    ? `${base} · Value ${euro.format(item.gross_value)} · Mortgage ${euro.format(item.mortgage_value)}`
    : base;
}

function HoldingsAllocation({ allocation, totalEquity }) {
  const segments = allocation.map((item, i) => ({ ...item, color: paletteColor(i) }));
  return <div className="allocation-wrap">
    <DonutChart segments={segments} centerValue={totalEquity} centerLabel="Total asset equity"
      pieProps={{ innerRadius: 58 }}/>
    <div className="allocation-list">
      {segments.slice(0, MAX_LEGEND_HOLDINGS).map(item => <LegendRow key={item.id}
        className={item.has_mortgage ? 'mortgaged-asset' : ''} color={item.color} label={item.name}
        note={holdingNote(item)} amount={euro.format(item.value)}/>)}
    </div>
  </div>;
}

function CategoryAllocation({ categories }) {
  return <div className="category-allocation">
    <div className="chart short">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={categories} layout="vertical" margin={{ top: 10, right: 8, bottom: 10, left: 8 }}>
          <CartesianGrid {...gridProps} horizontal={false}/>
          <XAxis type="number" tickFormatter={formatCompactEuro} {...axisProps}/>
          <YAxis type="category" dataKey="name" width={72} {...axisProps}/>
          <Tooltip formatter={(value, _name, item) => [euro.format(value), `${item.payload.share}%`]} {...tooltipProps}/>
          <Bar dataKey="value" radius={[0, 7, 7, 0]}>
            {categories.map((entry, i) => <Cell key={entry.name} fill={paletteColor(i)}/>)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
    <div className="allocation-list">
      {categories.map((item, i) => <LegendRow key={item.name} color={paletteColor(i)} label={item.name}
        note={`${item.share}% of total asset equity`} amount={euro.format(item.value)}/>)}
    </div>
  </div>;
}

export function AllocationPanel({ allocation, categories, totalEquity }) {
  const [view, setView] = useState('holdings');
  return <Panel title="Current asset allocation" kicker="PORTFOLIO">
    <div className="allocation-toolbar">
      <SegmentedControl options={VIEWS} value={view} onChange={setView}/>
    </div>
    {view === 'holdings'
      ? <HoldingsAllocation allocation={allocation} totalEquity={totalEquity}/>
      : <CategoryAllocation categories={categories}/>}
  </Panel>;
}
