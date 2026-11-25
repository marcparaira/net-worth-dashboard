import { describe, expect, it } from 'vitest';
import type { RebalancingPayload, RebalancingSettings } from '../api/types';
import { planRows } from './plan';
import { fromSettings } from './rebalancingDraft';

const settings: RebalancingSettings = {
  excluded_categories: [],
  reserves: [{ name: 'Emergency', amount: 6000, categories: ['Cash'] }],
  buckets: [
    { name: 'Property', weight: 40, categories: [], holding_ids: ['flat-id'], children: [] },
    {
      name: 'Markets',
      weight: 60,
      categories: [],
      holding_ids: [],
      children: [{ name: 'Funds', weight: 1, categories: ['Shares'], holding_ids: [], children: [] }],
    },
  ],
  fill_order: [],
};

const bucket = (name: string, target: number, children: RebalancingPayload['buckets'] = []) => ({
  name,
  share: 0,
  share_of_parent: 0,
  target,
  current: target - 10,
  gap: 10,
  holdings: [],
  children,
});

const payload: RebalancingPayload = {
  latest_date: '2026-09-30',
  pool: 100,
  fill_order: [],
  reserves: [{ name: 'Emergency', target: 6000, current: 6000, gap: 0, holdings: [] }],
  buckets: [bucket('Property', 40), bucket('Markets', 60, [bucket('Funds', 60)])],
  excluded: [],
  unassigned: [],
};

describe('planRows', () => {
  it('lists reserves, then buckets depth first, with their numbers and members', () => {
    const rows = planRows(fromSettings(settings), payload, (id) => (id === 'flat-id' ? 'Flat' : id));
    expect(rows.map((r) => [r.kind, r.depth, r.members.join(','), r.numbers?.target])).toEqual([
      ['reserve', 0, 'Cash', 6000],
      ['bucket', 0, 'Flat', 40],
      ['bucket', 0, '', 60],
      ['bucket', 1, 'Shares', 60],
    ]);
  });

  it('shows no numbers for a row the computed plan does not match yet', () => {
    const draft = fromSettings(settings);
    draft.buckets[0].name = 'Renamed';
    expect(planRows(draft, payload, String)[1].numbers).toBeNull();
    expect(planRows(draft, null, String).every((r) => r.numbers === null)).toBe(true);
  });
});
