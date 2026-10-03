import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line,
  LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { ArrowDownRight, ArrowUpRight, Landmark, PiggyBank, RefreshCw, ShieldCheck, WalletCards } from 'lucide-react';
import './styles.css';

const API = import.meta.env.VITE_API_URL || '/api';
const euro = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const signedEuro = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, signDisplay: 'exceptZero' });
const signedPercent = new Intl.NumberFormat('en-IE', { style: 'percent', maximumFractionDigits: 2, signDisplay: 'exceptZero' });
const compactEuro = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 });
const dateLabel = (value) => new Date(value).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
const colors = ['#5eead4', '#60a5fa', '#c084fc', '#f59e0b', '#fb7185', '#34d399', '#a3e635', '#f472b6'];

function Card({ title, value, subtitle, detail, icon: Icon, trend }) {
  return <section className="metric-card">
    <div className="metric-top"><span>{title}</span><Icon size={18} /></div>
    <strong>{euro.format(value || 0)}</strong>
    <div className={`metric-sub ${trend > 0 ? 'positive' : trend < 0 ? 'negative' : ''}`}>
      {trend > 0 ? <ArrowUpRight size={15}/> : trend < 0 ? <ArrowDownRight size={15}/> : null}
      <div>
        <div>{subtitle}</div>
        {detail ? <small>{detail}</small> : null}
      </div>
    </div>
  </section>;
}

function Panel({ title, kicker, children, className = '' }) {
  return <section className={`panel ${className}`}>
    <header><div><span>{kicker}</span><h2>{title}</h2></div></header>
    {children}
  </section>;
}

function HoldingValue({ holding }) {
  return <span className="holding-value-stack">
    <b>{holding.category === 'Liability' ? '−' : ''}{euro.format(holding.value)}</b>
    {holding.has_mortgage ? <small>Equity {euro.format(holding.equity_value)}</small> : null}
  </span>;
}

function App() {
  const [data, setData] = useState(null);
  const [basis, setBasis] = useState('last_year');
  const [allocationView, setAllocationView] = useState('holdings');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetch(`${API}/dashboard?rate_basis=${basis}`, { signal: controller.signal })
      .then(r => { if (!r.ok) throw new Error('Could not load dashboard data'); return r.json(); })
      .then(setData).catch(e => { if (e.name !== 'AbortError') setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [basis]);

  const categoryAllocation = useMemo(() => {
    if (!data?.allocation?.length) return [];
    const totals = data.allocation.reduce((acc, item) => {
      const current = acc[item.category] || 0;
      acc[item.category] = current + item.value;
      return acc;
    }, {});
    const totalEquity = data.allocation.reduce((sum, item) => sum + item.value, 0);
    return Object.entries(totals)
      .map(([name, value]) => ({
        name,
        value,
        share: totalEquity ? Number((value / totalEquity * 100).toFixed(2)) : 0,
      }))
      .sort((left, right) => right.value - left.value);
  }, [data]);

  const totalAssetEquity = useMemo(
    () => data?.allocation?.reduce((sum, item) => sum + item.value, 0) || 0,
    [data],
  );

  const yearToDateChange = useMemo(() => {
    if (!data?.history?.length) return null;
    const latest = data.history[data.history.length - 1];
    const latestDate = new Date(latest.date);
    const startOfYear = new Date(latestDate.getFullYear(), 0, 1);
    const baseline = [...data.history].reverse().find(entry => new Date(entry.date) < startOfYear);
    if (!baseline) return null;
    return latest.net_worth - baseline.net_worth;
  }, [data]);

  if (loading && !data) return <main className="center"><RefreshCw className="spin"/> Loading dashboard…</main>;
  if (error) return <main className="center">{error}</main>;
  if (!data) return null;

  const s = data.summary;
  return <main className="app-shell">
    <div className="ambient ambient-one"/><div className="ambient ambient-two"/>
    <header className="hero">
      <div>
        <span className="eyebrow">PERSONAL FINANCE / {data.meta.latest_date}</span>
        <h1>Net worth, clearly.</h1>
        <p>One view of assets, liabilities and balance sheet history.</p>
      </div>
      <div className="controls">
        <label>Historical growth
          <select value={basis} onChange={e => setBasis(e.target.value)}>
            <option value="last_year">Last 12 months</option>
            <option value="overall">All-time average</option>
          </select>
        </label>
      </div>
    </header>

    <div className="metrics-grid">
      <Card title="Net worth" value={s.net_worth} icon={Landmark} trend={s.one_year_change} subtitle={s.one_year_change == null ? 'Not enough history for a yearly comparison' : `${signedEuro.format(s.one_year_change)} vs one year ago`} detail={yearToDateChange !== null ? `${yearToDateChange >= 0 ? '+' : ''}${euro.format(yearToDateChange)} year to date` : ''} />
      <Card title="Liquid assets" value={s.liquid_assets} icon={WalletCards} subtitle={`${Math.round(s.liquid_assets / s.net_worth * 100)}% of net worth`} />
      <Card title="Disposable net value" value={s.disposable_net_value} icon={ShieldCheck} subtitle={`Excludes ${data.meta.excluded_category} and their mortgages`} />
      <Card title="Monthly disposable increase" value={s.monthly_disposable_increase} icon={PiggyBank} trend={s.monthly_disposable_increase} subtitle={basis === 'last_year' ? 'Recent 12-month average' : 'Full-history average'} detail="Includes valuation changes" />
    </div>

    <Panel title="Net worth change" kicker="RECENT GROWTH">
      <div className="summary-cards period-changes">
        {data.net_worth_changes?.map(period => <div className="summary-card" key={period.months}>
          <span>{period.label}</span>
          <strong className={period.change > 0 ? 'positive' : period.change < 0 ? 'negative' : ''}>
            {period.change == null ? '—' : signedEuro.format(period.change)}
          </strong>
          <div className={`metric-sub ${period.change > 0 ? 'positive' : period.change < 0 ? 'negative' : ''}`}>
            {period.change > 0 ? <ArrowUpRight size={15}/> : period.change < 0 ? <ArrowDownRight size={15}/> : null}
            {period.change == null ? 'Not enough history' : period.change_pct == null ? 'Percentage unavailable (zero baseline)' : `${signedPercent.format(period.change_pct / 100)} change`}
          </div>
          {period.baseline_date && <small>{period.baseline_date} → {period.latest_date}</small>}
        </div>)}
      </div>
      <p className="footnote">Compared with the latest record on or before 1, 3, or 12 months before the latest saved date.</p>
    </Panel>

    <div className="two-col">
      <Panel title="Balance sheet evolution" kicker="HISTORY">
        <div className="chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.history}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#243149"/>
              <XAxis dataKey="date" tickFormatter={dateLabel} stroke="#8290aa"/><YAxis tickFormatter={compactEuro.format} stroke="#8290aa" width={66}/>
              <Tooltip formatter={euro.format} labelFormatter={dateLabel} contentStyle={{ background:'#111a2e', border:'1px solid #293855', borderRadius:12 }}/>
              <Legend/><Line dataKey="net_worth" name="Net worth" stroke="#5eead4" strokeWidth={3} dot={false}/>
              <Line dataKey="liquid_assets" name="Liquid" stroke="#60a5fa" strokeWidth={2} dot={false}/>
              <Line dataKey="non_liquid_assets" name="Non-liquid" stroke="#c084fc" strokeWidth={2} dot={false}/>
              <Line dataKey="liabilities" name="Liabilities" stroke="#fb7185" strokeWidth={2} dot={false}/>
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title="Current asset allocation" kicker="PORTFOLIO">
        <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:'14px' }}>
          <div style={{ display:'inline-flex', gap:'4px', padding:'4px', border:'1px solid #243149', borderRadius:'999px', background:'#0e1626cc' }}>
            <button type="button" onClick={() => setAllocationView('holdings')} style={{ border:'none', borderRadius:'999px', padding:'8px 14px', background:allocationView === 'holdings' ? '#5eead4' : 'transparent', color:allocationView === 'holdings' ? '#08111d' : '#9fb0cb', font:'600 .78rem DM Sans', cursor:'pointer' }}>Holdings</button>
            <button type="button" onClick={() => setAllocationView('types')} style={{ border:'none', borderRadius:'999px', padding:'8px 14px', background:allocationView === 'types' ? '#5eead4' : 'transparent', color:allocationView === 'types' ? '#08111d' : '#9fb0cb', font:'600 .78rem DM Sans', cursor:'pointer' }}>Asset types</button>
          </div>
        </div>
        {allocationView === 'holdings' ? <div className="allocation-wrap">
          <div className="donut"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data.allocation} dataKey="value" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={2}>{data.allocation.map((_, i) => <Cell key={i} fill={colors[i % colors.length]}/>)}</Pie><Tooltip formatter={euro.format} contentStyle={{ background:'#111a2e', border:'1px solid #293855', borderRadius:12 }}/></PieChart></ResponsiveContainer><div className="donut-label"><strong>{euro.format(totalAssetEquity)}</strong><span>Total asset equity</span></div></div>
          <div className="allocation-list">{data.allocation.slice(0,7).map((x,i)=><div key={x.id} className={x.has_mortgage ? 'mortgaged-asset' : ''}><i style={{background:colors[i%colors.length]}}/><span>{x.name}<small>{x.has_mortgage ? `${x.category} · ${x.share}% · Value ${euro.format(x.gross_value)} · Mortgage ${euro.format(x.mortgage_value)}` : `${x.category} · ${x.share}%`}</small></span><b>{euro.format(x.value)}</b></div>)}</div>
        </div> : <div style={{ display:'grid', gridTemplateRows:'minmax(220px, 1fr) auto', gap:'10px' }}>
          <div className="chart short" style={{ minHeight:'260px' }}><ResponsiveContainer width="100%" height="100%"><BarChart data={categoryAllocation} layout="vertical" margin={{ top: 10, right: 8, bottom: 10, left: 8 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#243149"/><XAxis type="number" tickFormatter={compactEuro.format} stroke="#8290aa"/><YAxis type="category" dataKey="name" width={72} stroke="#8290aa"/><Tooltip formatter={(value, _name, item) => [euro.format(value), `${item.payload.share}%`]} contentStyle={{ background:'#111a2e', border:'1px solid #293855', borderRadius:12 }}/><Bar dataKey="value" radius={[0,7,7,0]}>{categoryAllocation.map((entry, i) => <Cell key={entry.name} fill={colors[i % colors.length]}/>)}</Bar></BarChart></ResponsiveContainer></div>
          <div className="allocation-list">{categoryAllocation.map((x,i)=><div key={x.name}><i style={{background:colors[i%colors.length]}}/><span>{x.name}<small>{x.share}% of total asset equity</small></span><b>{euro.format(x.value)}</b></div>)}</div>
        </div>}
      </Panel>
    </div>

    <div className="two-col lower">
      <Panel title="Average monthly movement" kicker="MOMENTUM">
        <div className="chart short"><ResponsiveContainer width="100%" height="100%"><BarChart data={Object.entries(data.average_monthly_changes).map(([name,value])=>({name:name.replaceAll('_',' '),value}))} layout="vertical" margin={{left:30}}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#243149"/><XAxis type="number" tickFormatter={compactEuro.format} stroke="#8290aa"/><YAxis type="category" dataKey="name" width={115} stroke="#8290aa"/><Tooltip formatter={euro.format} contentStyle={{ background:'#111a2e', border:'1px solid #293855', borderRadius:12 }}/><Bar dataKey="value" fill="#60a5fa" radius={[0,7,7,0]}/></BarChart></ResponsiveContainer></div>
      </Panel>
      <Panel title="Latest holdings" kicker="DETAILS">
        <div className="holdings-table"><div className="table-head"><span>Holding</span><span>Type</span><span>Value</span></div>{data.latest_holdings.map(x=><div className={`table-row ${x.has_mortgage ? 'is-mortgaged' : ''}`} key={x.id}><span className="holding-main"><strong>{x.name}</strong>{x.has_mortgage ? <small>{x.mortgage_name} · {euro.format(x.mortgage_value)} debt</small> : null}</span><span className="holding-tags"><span className={`pill ${x.category.toLowerCase().replace('-','')}`}>{x.category}</span>{x.has_mortgage ? <span className="pill mortgage">Mortgage</span> : null}</span><HoldingValue holding={x} /></div>)}</div>
      </Panel>
    </div>
  </main>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
