import { describe, expect, it } from 'vitest';
import type { RebalancingBucket, RebalancingPayload } from '../api/types';
import { allSlices, holdingsBreakdown, leafBuckets } from './rebalancing';

const bucket = (name: string, children: RebalancingBucket[] = []): RebalancingBucket => ({
  name,
  share: 0,
  share_of_parent: 0,
  target: 0,
  current: 0,
  gap: 0,
  holdings: [],
  children,
});

describe('leafBuckets', () => {
  it('flattens the tree and keeps the parent name', () => {
    const leaves = leafBuckets([bucket('Real estate'), bucket('Stocks and cash', [bucket('Funds'), bucket('Bonds')])]);
    expect(leaves.map((l) => [l.name, l.parent])).toEqual([
      ['Real estate', null],
      ['Funds', 'Stocks and cash'],
      ['Bonds', 'Stocks and cash'],
    ]);
  });
});

describe('holdingsBreakdown', () => {
  it('adds up each holding across slices, unassigned and excluded', () => {
    const cash = { id: 'cash', name: 'Cash', category: 'Efectiu i bons CT' };
    const payload: RebalancingPayload = {
      latest_date: '2026-01-31',
      pool: 0,
      fill_order: [],
      reserves: [{ name: 'Emergency', target: 0, current: 0, gap: 0, holdings: [{ ...cash, amount: 600 }] }],
      buckets: [{ ...bucket('Bonds'), holdings: [{ ...cash, amount: 400 }] }],
      excluded: [{ id: 'car', name: 'Car', category: 'Vehicles', amount: 50 }],
      unassigned: [],
    };
    const result = holdingsBreakdown(allSlices(payload), payload.excluded, payload.unassigned);
    expect(result.map((h) => [h.id, h.amount, h.parts.map((p) => p.name)])).toEqual([
      ['cash', 1000, ['Emergency', 'Bonds']],
      ['car', 50, ['Excluded']],
    ]);
  });
});
