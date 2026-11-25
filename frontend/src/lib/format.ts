const LOCALE = 'en-IE';
// U+2212 MINUS SIGN, written as an escape so it is not mistaken for a hyphen in source.
const MINUS = '\u2212';

/** Number formatter that writes negatives with a true minus sign (U+2212), aligned with "+". */
function formatter(options: Intl.NumberFormatOptions): { format: (value: number) => string } {
  const format = new Intl.NumberFormat(LOCALE, options);
  return { format: (value) => format.format(value).replace('-', MINUS) };
}

/** Amounts: €1,234 and -€1,234, with U+2212 as the minus. */
export const euro = formatter({ style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
/** Changes: +€1,234, -€1,234 (U+2212), and €0 (no sign for zero). */
export const signedEuro = formatter({
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
  signDisplay: 'exceptZero',
});
/** Relative changes: +1.25%, -0.5% (U+2212). */
export const signedPercent = formatter({ style: 'percent', maximumFractionDigits: 2, signDisplay: 'exceptZero' });
/** Chart axes: €12K, -€1.5K (U+2212). */
export const compactEuro = formatter({
  style: 'currency',
  currency: 'EUR',
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** Euro amount for chart tooltips and labels, which may pass non-numeric values. */
export const formatEuro = (value: unknown): string => (typeof value === 'number' ? euro.format(value) : String(value));
export const formatCompactEuro = (value: number): string => compactEuro.format(value);
export const dateLabel = (value: unknown): string =>
  new Date(String(value)).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });

/** CSS class colouring a change by its sign: gains green, losses red, no change neutral. */
export const trendClass = (value: number | null | undefined): string =>
  value == null ? '' : value > 0 ? 'positive' : value < 0 ? 'negative' : '';
