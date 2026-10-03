const LOCALE = 'en-IE';

export const euro = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
export const signedEuro = new Intl.NumberFormat(LOCALE, {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0, signDisplay: 'exceptZero',
});
export const signedPercent = new Intl.NumberFormat(LOCALE, {
  style: 'percent', maximumFractionDigits: 2, signDisplay: 'exceptZero',
});
export const compactEuro = new Intl.NumberFormat(LOCALE, {
  style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1,
});

export const formatEuro = (value) => euro.format(value);
export const formatCompactEuro = (value) => compactEuro.format(value);
export const dateLabel = (value) => new Date(value).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });

/** CSS class colouring a value by its sign. */
export const trendClass = (value) => (value > 0 ? 'positive' : value < 0 ? 'negative' : '');
