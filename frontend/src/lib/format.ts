const LOCALE = 'en-IE';

export const euro = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
export const signedEuro = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
  signDisplay: 'exceptZero',
});
export const signedPercent = new Intl.NumberFormat(LOCALE, {
  style: 'percent',
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
});
export const compactEuro = new Intl.NumberFormat(LOCALE, {
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

/** CSS class colouring a value by its sign. */
export const trendClass = (value: number | null | undefined): string =>
  value == null ? '' : value > 0 ? 'positive' : value < 0 ? 'negative' : '';
