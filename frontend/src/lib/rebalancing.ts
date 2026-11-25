import type { RebalancingBucket, RebalancingHolding, RebalancingPayload, RebalancingReserve } from '../api/types';
import { NEUTRAL_COLOR, sliceColor } from './theme';

const UNASSIGNED_COLOR = 'var(--color-warning)';

interface SliceExtras {
  /** Name of the parent bucket group, if any. */
  parent: string | null;
  color: string;
  isReserve?: boolean;
}

/** A reserve or leaf bucket: one "slice" of the money. */
export type Slice = (RebalancingReserve | RebalancingBucket) & SliceExtras;

export interface HoldingPart {
  name: string;
  color: string;
  amount: number;
}

export interface HoldingBreakdown extends RebalancingHolding {
  parts: HoldingPart[];
}

/**
 * Leaf buckets in display order, each with a colour and the name of its parent group (if any).
 * Colours continue the palette after the reserves (`offset`), so every slice has its own.
 */
export function leafBuckets(buckets: RebalancingBucket[], offset = 0): (RebalancingBucket & SliceExtras)[] {
  const result: (RebalancingBucket & SliceExtras)[] = [];
  const walk = (items: RebalancingBucket[], parent: string | null) =>
    items.forEach((bucket) => {
      if (bucket.children.length) walk(bucket.children, bucket.name);
      else result.push({ ...bucket, parent, color: sliceColor(offset + result.length) });
    });
  walk(buckets, null);
  return result;
}

/** Reserves plus leaf buckets, as uniform "slices" of the money. */
export function allSlices(data: RebalancingPayload): Slice[] {
  const reserves = data.reserves.map((reserve, index) => ({
    ...reserve,
    parent: null,
    color: sliceColor(index),
    isReserve: true,
  }));
  return [...reserves, ...leafBuckets(data.buckets, reserves.length)];
}

/** Inverse view: each holding with the slices its value was assigned to. */
export function holdingsBreakdown(
  slices: Slice[],
  excluded: RebalancingHolding[],
  unassigned: RebalancingHolding[],
): HoldingBreakdown[] {
  const byId = new Map<string, HoldingBreakdown>();
  const add = (holding: RebalancingHolding, part: Omit<HoldingPart, 'amount'>) => {
    let entry = byId.get(holding.id);
    if (!entry) {
      entry = { ...holding, amount: 0, parts: [] };
      byId.set(holding.id, entry);
    }
    entry.amount += holding.amount;
    entry.parts.push({ ...part, amount: holding.amount });
  };
  slices.forEach((slice) => slice.holdings.forEach((h) => add(h, { name: slice.name, color: slice.color })));
  unassigned.forEach((h) => add(h, { name: 'Unassigned', color: UNASSIGNED_COLOR }));
  excluded.forEach((h) => add(h, { name: 'Excluded', color: NEUTRAL_COLOR }));
  return [...byId.values()].sort((a, b) => b.amount - a.amount);
}
