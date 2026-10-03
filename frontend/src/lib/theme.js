/** Categorical palette; series and legend entries pick colours by index. */
export const PALETTE = ['#5eead4', '#60a5fa', '#c084fc', '#f59e0b', '#fb7185', '#34d399', '#a3e635', '#f472b6'];
export const paletteColor = (index) => PALETTE[index % PALETTE.length];

export const SERIES_COLORS = {
  netWorth: '#5eead4',
  liquid: '#60a5fa',
  nonLiquid: '#c084fc',
  liabilities: '#fb7185',
};

/** Shared Recharts props, spread onto the matching chart elements. */
export const gridProps = { strokeDasharray: '3 3', stroke: '#243149' };
export const axisProps = { stroke: '#8290aa' };
export const tooltipProps = {
  contentStyle: { background: '#111a2e', border: '1px solid #293855', borderRadius: 12 },
};
