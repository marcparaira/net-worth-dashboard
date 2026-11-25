import { describe, expect, it } from 'vitest';
import type { HoldingOut, LiabilityOut } from '../api/types';
import {
  amountText,
  buildGroups,
  hasErrors,
  initialTexts,
  netWorth,
  parseAmount,
  snapshotPayload,
  todayIso,
  validateSnapshot,
} from './entries';

const holding = (id: string, overrides: Partial<HoldingOut> = {}): HoldingOut => ({
  id,
  name: id,
  category: 'Accions',
  liquidity: 'liquid',
  closed_on: null,
  mortgage_id: null,
  latest_amount: null,
  latest_date: null,
  value_count: 0,
  in_rebalancing: false,
  ...overrides,
});

const liability = (id: string, overrides: Partial<LiabilityOut> = {}): LiabilityOut => ({
  id,
  name: id,
  holding_id: null,
  closed_on: null,
  latest_amount: null,
  latest_date: null,
  value_count: 0,
  ...overrides,
});

describe('parseAmount', () => {
  it('accepts plain numbers with a dot or comma and up to two decimals', () => {
    expect(parseAmount('1234').amount).toBe(1234);
    expect(parseAmount(' 1 234,5 ').amount).toBe(1234.5);
    expect(parseAmount('0.07').amount).toBe(0.07);
    expect(parseAmount('')).toEqual({ amount: null, error: '' });
  });

  it('explains what is wrong', () => {
    expect(parseAmount('-5').error).toMatch(/positive/);
    expect(parseAmount('12.345').error).toMatch(/two decimals/);
    expect(parseAmount('1.234.567').error).toMatch(/number/);
    expect(parseAmount('ten').error).toMatch(/number/);
  });

  it('round-trips through amountText', () => {
    expect([amountText(1500), amountText(1500.5), amountText(null)]).toEqual(['1500', '1500.50', '']);
  });
});

describe('buildGroups', () => {
  const holdings = [
    holding('flat', { liquidity: 'non_liquid', category: 'Immobles' }),
    holding('bank', { category: 'Efectiu i bons CT' }),
    holding('old', { closed_on: '2025-12-31' }),
  ];
  const liabilities = [liability('mortgage', { holding_id: 'flat' }), liability('card')];

  it('groups by liquidity, puts the mortgage under its property, and hides closed items', () => {
    const groups = buildGroups(holdings, liabilities, [{ holding_id: 'bank', liability_id: null, amount: 100 }], []);
    expect(groups.map((g) => [g.title, g.rows.map((r) => r.key)])).toEqual([
      ['Liquid assets', ['holding:bank']],
      ['Non-liquid assets', ['holding:flat', 'liability:mortgage']],
      ['Liabilities', ['liability:card']],
    ]);
    expect(groups[0].rows[0].previous).toBe(100);
    expect(groups[1].rows[1]).toMatchObject({ label: 'Mortgage', propertyKey: 'holding:flat' });
  });

  it('shows closed holdings on request, marked as closed', () => {
    const groups = buildGroups(holdings, liabilities, [], [], true);
    const old = groups[0].rows.find((r) => r.key === 'holding:old');
    expect(old?.closed).toBe(true);
  });

  it('keeps a closed holding when the edited snapshot has a value for it', () => {
    const groups = buildGroups(holdings, [], [], [{ holding_id: 'old', liability_id: null, amount: 5 }]);
    expect(groups[0].rows.map((r) => r.key)).toContain('holding:old');
    expect(initialTexts(groups, [{ holding_id: 'old', liability_id: null, amount: 5 }])['holding:old']).toBe('5');
  });
});

describe('snapshot validation and payload', () => {
  const groups = buildGroups(
    [holding('flat', { liquidity: 'non_liquid' }), holding('bank')],
    [liability('mortgage', { holding_id: 'flat' })],
    [],
    [],
  );
  const today = '2026-11-25';

  it('accepts a valid snapshot and builds the request', () => {
    const texts = { 'holding:bank': '1000', 'holding:flat': '200000', 'liability:mortgage': '150000' };
    expect(hasErrors(validateSnapshot('2026-11-01', [], groups, texts, today))).toBe(false);
    expect(snapshotPayload('2026-11-01', groups, texts).values).toHaveLength(3);
    const amounts = new Map(Object.entries(texts).map(([k, v]) => [k, Number(v)]));
    expect(netWorth(groups, (row) => amounts.get(row.key) ?? null)).toBe(51000);
  });

  it('rejects future, duplicate, and missing dates', () => {
    const texts = { 'holding:bank': '1' };
    expect(validateSnapshot('2026-11-26', [], groups, texts, today).date).toMatch(/future/);
    expect(validateSnapshot('2026-10-31', ['2026-10-31'], groups, texts, today).date).toMatch(/already/);
    expect(validateSnapshot('', [], groups, texts, today).date).toMatch(/Choose/);
  });

  it('needs at least one value, and the property of a mortgage', () => {
    expect(validateSnapshot('2026-11-01', [], groups, {}, today).form).toMatch(/at least one/);
    const errors = validateSnapshot('2026-11-01', [], groups, { 'liability:mortgage': '100' }, today);
    expect(errors.amounts['liability:mortgage']).toMatch(/property/);
  });

  it('formats today in local time', () => {
    expect(todayIso(new Date(2026, 0, 31, 23, 30))).toBe('2026-01-31');
  });
});
