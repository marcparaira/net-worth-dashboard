import { describe, expect, it } from 'vitest';
import type { RebalancingSettings } from '../api/types';
import {
  addSubBucket,
  bucketShares,
  draftHasErrors,
  fromSettings,
  leafBuckets,
  moveStep,
  removeBucket,
  toSettings,
  updateBucket,
  validateDraft,
} from './rebalancingDraft';

const settings: RebalancingSettings = {
  excluded_categories: ['Pensions'],
  reserves: [{ name: 'Emergency fund', amount: 6000, categories: ['Cash'] }],
  buckets: [
    { name: 'Real estate', weight: 40, categories: [], holding_ids: ['flat-id'], children: [] },
    {
      name: 'Stocks and cash',
      weight: 60,
      categories: [],
      holding_ids: [],
      children: [
        { name: 'Index funds', weight: 80, categories: ['Shares'], holding_ids: [], children: [] },
        { name: 'Bonds', weight: 20, categories: ['Cash'], holding_ids: [], children: [] },
      ],
    },
  ],
  fill_order: ['Emergency fund', 'Bonds'],
};

describe('rebalancing draft', () => {
  it('round-trips the settings', () => {
    expect(toSettings(fromSettings(settings))).toEqual(settings);
  });

  it('keeps the fill order when a step is renamed', () => {
    const draft = fromSettings(settings);
    const bonds = leafBuckets(draft.buckets).find((b) => b.name === 'Bonds');
    const renamed = {
      ...draft,
      buckets: updateBucket(draft.buckets, bonds!.key, (b) => ({ ...b, name: 'Short bonds' })),
    };
    expect(toSettings(renamed).fill_order).toEqual(['Emergency fund', 'Short bonds']);
  });

  it('computes each bucket share of the pool', () => {
    const draft = fromSettings(settings);
    const shares = bucketShares(draft.buckets);
    const byName = new Map(leafBuckets(draft.buckets).map((b) => [b.name, shares.get(b.key)]));
    expect(byName.get('Real estate')).toBe(40);
    expect(byName.get('Index funds')).toBeCloseTo(48);
    expect(byName.get('Bonds')).toBeCloseTo(12);
  });

  it('moves what a bucket held into its first sub-bucket', () => {
    const draft = fromSettings(settings);
    const realEstate = draft.buckets[0];
    const split = addSubBucket(draft.buckets, realEstate.key);
    expect(split[0].holdingIds).toEqual([]);
    expect(split[0].children[0].holdingIds).toEqual(['flat-id']);
    expect(removeBucket(split, split[0].children[0].key)[0].children).toEqual([]);
  });

  it('moves fill-order steps within bounds', () => {
    expect(moveStep(['a', 'b', 'c'], 'c', -1)).toEqual(['a', 'c', 'b']);
    expect(moveStep(['a', 'b'], 'a', -1)).toEqual(['a', 'b']);
  });

  it('reports what the server would reject', () => {
    const draft = fromSettings(settings);
    expect(draftHasErrors(validateDraft(draft))).toBe(false);

    const leaves = leafBuckets(draft.buckets);
    const broken = {
      ...draft,
      reserves: [{ ...draft.reserves[0], amount: '10.125' }],
      buckets: updateBucket(
        updateBucket(draft.buckets, leaves[1].key, (b) => ({ ...b, categories: [], holdingIds: [] })),
        leaves[2].key,
        (b) => ({ ...b, name: 'Index funds' }),
      ),
    };
    const errors = validateDraft(broken);
    expect(errors.items[draft.reserves[0].key]).toMatch(/two decimals/);
    expect(errors.items[leaves[1].key]).toMatch(/Names must be unique|Choose what it holds/);
    expect(errors.items[leaves[2].key]).toMatch(/unique/);
    expect(validateDraft({ ...draft, buckets: [] }).form).toMatch(/at least one bucket/);
  });
});
