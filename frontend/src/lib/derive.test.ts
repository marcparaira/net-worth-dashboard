import { describe, expect, it } from 'vitest';
import type { AllocationItem, HistoryPoint } from '../api/types';
import { averageMovementRows, categoryAllocation, investmentMix, yearToDateChange } from './derive';

const holding = (id: string, category: string, value: number): AllocationItem => ({
  id,
  name: id,
  category,
  value,
  gross_value: value,
  share: 0,
  mortgage_name: null,
  mortgage_value: 0,
  equity_value: value,
  has_mortgage: false,
});

const point = (date: string, netWorth: number): HistoryPoint => ({
  date,
  net_worth: netWorth,
  liquid_assets: 0,
  non_liquid_assets: 0,
  liabilities: 0,
  disposable_net_value: 0,
});

describe('categoryAllocation', () => {
  it('groups by category, largest first, with shares in %', () => {
    const result = categoryAllocation([
      holding('a', 'Accions', 100),
      holding('b', 'Efectiu i bons CT', 300),
      holding('c', 'Accions', 100),
    ]);
    expect(result).toEqual([
      { name: 'Efectiu i bons CT', value: 300, share: 60 },
      { name: 'Accions', value: 200, share: 40 },
    ]);
  });

  it('returns nothing without allocation', () => {
    expect(categoryAllocation()).toEqual([]);
  });
});

describe('investmentMix', () => {
  it('always returns the three segments, with zero for missing categories', () => {
    const mix = investmentMix([{ name: 'Accions', value: 500, share: 100 }]);
    expect(mix.map((s) => [s.name, s.value])).toEqual([
      ['Immobles', 0],
      ['Accions', 500],
      ['Efectiu i bons CT', 0],
    ]);
  });
});

describe('yearToDateChange', () => {
  it('compares with the last record before 1 January of the latest year', () => {
    const history = [point('2025-11-30', 900), point('2025-12-31', 1000), point('2026-03-31', 1250)];
    expect(yearToDateChange(history)).toBe(250);
  });

  it('is null without a record before the latest year', () => {
    expect(yearToDateChange([point('2026-01-31', 1000)])).toBeNull();
    expect(yearToDateChange([])).toBeNull();
  });
});

describe('averageMovementRows', () => {
  it('turns keys into readable labels', () => {
    const rows = averageMovementRows({ liquid_assets: 1, non_liquid_assets: 2, liabilities: 3, net_worth: 4 });
    expect(rows.map((r) => r.name)).toEqual(['liquid assets', 'non liquid assets', 'liabilities', 'net worth']);
  });
});
