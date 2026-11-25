// Editable form of the rebalancing settings, and pure helpers to change and check it.
// Rows have stable keys, so renaming a reserve or bucket keeps its place in the fill order.
import type { BucketSettings, RebalancingSettings } from '../api/types';
import { amountText, parseAmount } from './entries';

export interface ReserveDraft {
  key: string;
  name: string;
  amount: string;
  categories: string[];
}

export interface BucketDraft {
  key: string;
  name: string;
  weight: string;
  categories: string[];
  holdingIds: string[];
  children: BucketDraft[];
}

export interface SettingsDraft {
  excluded: string[];
  reserves: ReserveDraft[];
  buckets: BucketDraft[];
  /** Keys of the reserves and leaf buckets that get first pick, in order. */
  fillOrder: string[];
}

let lastKey = 0;
export const newKey = (): string => `k${++lastKey}`;

export const isLeaf = (bucket: BucketDraft): boolean => bucket.children.length === 0;

/** Leaf buckets (those that hold money directly), depth first. */
export function leafBuckets(buckets: BucketDraft[]): BucketDraft[] {
  return buckets.flatMap((b) => (isLeaf(b) ? [b] : leafBuckets(b.children)));
}

function allBuckets(buckets: BucketDraft[]): BucketDraft[] {
  return buckets.flatMap((b) => [b, ...allBuckets(b.children)]);
}

export function fromSettings(settings: RebalancingSettings): SettingsDraft {
  const toDraft = (bucket: BucketSettings): BucketDraft => ({
    key: newKey(),
    name: bucket.name,
    weight: String(bucket.weight),
    categories: [...bucket.categories],
    holdingIds: [...bucket.holding_ids],
    children: bucket.children.map(toDraft),
  });
  const reserves = settings.reserves.map((r) => ({
    key: newKey(),
    name: r.name,
    amount: amountText(r.amount),
    categories: [...r.categories],
  }));
  const buckets = settings.buckets.map(toDraft);
  const keyByName = new Map([...reserves, ...leafBuckets(buckets)].map((item) => [item.name, item.key]));
  return {
    excluded: [...settings.excluded_categories],
    reserves,
    buckets,
    fillOrder: settings.fill_order.flatMap((name) => keyByName.get(name) ?? []),
  };
}

/** A first draft when there are no settings yet: one bucket holding every category not excluded. */
export function starterDraft(categories: string[], excluded: string[]): SettingsDraft {
  return {
    excluded,
    reserves: [],
    buckets: [
      {
        key: newKey(),
        name: 'Investments',
        weight: '100',
        categories: categories.filter((c) => !excluded.includes(c)),
        holdingIds: [],
        children: [],
      },
    ],
    fillOrder: [],
  };
}

export function toSettings(draft: SettingsDraft): RebalancingSettings {
  const toSettingsBucket = (bucket: BucketDraft): BucketSettings => ({
    name: bucket.name.trim(),
    weight: Number(bucket.weight.replace(',', '.')),
    categories: isLeaf(bucket) ? bucket.categories : [],
    holding_ids: isLeaf(bucket) ? bucket.holdingIds : [],
    children: bucket.children.map(toSettingsBucket),
  });
  const nameByKey = new Map(
    [...draft.reserves, ...leafBuckets(draft.buckets)].map((item) => [item.key, item.name.trim()]),
  );
  return {
    excluded_categories: draft.excluded,
    reserves: draft.reserves.map((r) => ({
      name: r.name.trim(),
      amount: parseAmount(r.amount).amount ?? 0,
      categories: r.categories,
    })),
    buckets: draft.buckets.map(toSettingsBucket),
    fill_order: draft.fillOrder.flatMap((key) => nameByKey.get(key) ?? []),
  };
}

/** Each bucket's share of the pool, in %: its weight relative to its siblings, times its parent's share. */
export function bucketShares(buckets: BucketDraft[], parentShare = 100): Map<string, number> {
  const weights = buckets.map((b) => Math.max(Number(b.weight.replace(',', '.')) || 0, 0));
  const total = weights.reduce((sum, w) => sum + w, 0);
  const shares = new Map<string, number>();
  buckets.forEach((bucket, i) => {
    const share = total ? (weights[i] / total) * parentShare : 0;
    shares.set(bucket.key, share);
    for (const [key, value] of bucketShares(bucket.children, share)) shares.set(key, value);
  });
  return shares;
}

/** The tree with the bucket `key` replaced by `change(bucket)`. */
export function updateBucket(
  buckets: BucketDraft[],
  key: string,
  change: (bucket: BucketDraft) => BucketDraft,
): BucketDraft[] {
  return buckets.map((b) => (b.key === key ? change(b) : { ...b, children: updateBucket(b.children, key, change) }));
}

export function removeBucket(buckets: BucketDraft[], key: string): BucketDraft[] {
  return buckets.filter((b) => b.key !== key).map((b) => ({ ...b, children: removeBucket(b.children, key) }));
}

export const emptyBucket = (name = 'New bucket'): BucketDraft => ({
  key: newKey(),
  name,
  weight: '1',
  categories: [],
  holdingIds: [],
  children: [],
});

/**
 * Adds a sub-bucket. A bucket that held money directly becomes a group: what it held moves to
 * the new sub-bucket, so nothing is lost.
 */
export function addSubBucket(buckets: BucketDraft[], parentKey: string): BucketDraft[] {
  return updateBucket(buckets, parentKey, (parent) => {
    const child = emptyBucket();
    if (isLeaf(parent)) {
      child.categories = parent.categories;
      child.holdingIds = parent.holdingIds;
    }
    return { ...parent, categories: [], holdingIds: [], children: [...parent.children, child] };
  });
}

/** Moves `key` one place up (-1) or down (+1) in the fill order. */
export function moveStep(order: string[], key: string, delta: -1 | 1): string[] {
  const index = order.indexOf(key);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= order.length) return order;
  const next = [...order];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export interface DraftErrors {
  /** Per reserve or bucket key. */
  items: Record<string, string>;
  form: string;
}

export const draftHasErrors = (errors: DraftErrors): boolean =>
  Boolean(errors.form || Object.values(errors.items).some(Boolean));

/** The checks the server makes, for immediate feedback. */
export function validateDraft(draft: SettingsDraft): DraftErrors {
  const errors: DraftErrors = { items: {}, form: '' };
  if (!draft.buckets.length) errors.form = 'Add at least one bucket';

  const named = [...draft.reserves, ...leafBuckets(draft.buckets)];
  const counts = new Map<string, number>();
  for (const item of named) counts.set(item.name.trim(), (counts.get(item.name.trim()) ?? 0) + 1);

  for (const reserve of draft.reserves) {
    const { amount, error } = parseAmount(reserve.amount);
    if (!reserve.name.trim()) errors.items[reserve.key] = 'Enter a name';
    else if ((counts.get(reserve.name.trim()) ?? 0) > 1) errors.items[reserve.key] = 'Names must be unique';
    else if (error || amount === null) errors.items[reserve.key] = error || 'Enter an amount';
    else if (!reserve.categories.length) errors.items[reserve.key] = 'Choose the categories it draws from';
  }

  const holdingOwners = new Map<string, number>();
  for (const leaf of leafBuckets(draft.buckets))
    for (const id of leaf.holdingIds) holdingOwners.set(id, (holdingOwners.get(id) ?? 0) + 1);

  for (const bucket of allBuckets(draft.buckets)) {
    const weight = Number(bucket.weight.replace(',', '.'));
    if (!bucket.name.trim()) errors.items[bucket.key] = 'Enter a name';
    else if (!(weight > 0)) errors.items[bucket.key] = 'The weight must be a number above 0';
    else if (isLeaf(bucket) && (counts.get(bucket.name.trim()) ?? 0) > 1)
      errors.items[bucket.key] = 'Names must be unique';
    else if (isLeaf(bucket) && !bucket.categories.length && !bucket.holdingIds.length)
      errors.items[bucket.key] = 'Choose what it holds, or add sub-buckets';
    else if (bucket.holdingIds.some((id) => (holdingOwners.get(id) ?? 0) > 1))
      errors.items[bucket.key] = 'A holding can only be in one bucket';
  }
  return errors;
}
