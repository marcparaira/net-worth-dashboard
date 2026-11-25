import { describe, expect, it } from 'vitest';
import { euro, signedEuro, signedPercent, trendClass } from './format';

const MINUS = '\u2212'; // U+2212 MINUS SIGN

describe('number formatting', () => {
  it('signs changes with + and a true minus sign, and leaves zero unsigned', () => {
    expect(signedEuro.format(1308)).toBe('+€1,308');
    expect(signedEuro.format(-530)).toBe(`${MINUS}€530`);
    expect(signedEuro.format(0)).toBe('€0');
    expect(signedPercent.format(-0.0125)).toBe(`${MINUS}1.25%`);
  });

  it('writes negative amounts with a minus sign', () => {
    expect(euro.format(-1500)).toBe(`${MINUS}€1,500`);
  });

  it('colours changes by sign', () => {
    expect([trendClass(5), trendClass(-5), trendClass(0), trendClass(null)]).toEqual(['positive', 'negative', '', '']);
  });
});
