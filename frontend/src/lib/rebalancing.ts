import type { RebalancingBucket, RebalancingHolding, RebalancingPayload, RebalancingReserve } from '../api/types';
import { PALETTE } from './theme';

// Reserves (fixed amounts) use warm colours, buckets use the rest of the palette.
const RESERVE_COLORS = ['#f59e0b', '#f472b6', '#a3e635'];
const BUCKET_COLORS = PALETTE.filter((color) => !RESERVE_COLORS.includes(color));

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

/** Leaf buckets in display order, each with a colour and the name of its parent group (if any). */
export function leafBuckets(buckets: RebalancingBucket[]): (RebalancingBucket & SliceExtras)[] {
  const result: (RebalancingBucket & SliceExtras)[] = [];
  const walk = (items: RebalancingBucket[], parent: string | null) =>
    items.forEach((bucket) => {
      if (bucket.children.length) walk(bucket.children, bucket.name);
      else result.push({ ...bucket, parent, color: BUCKET_COLORS[result.length % BUCKET_COLORS.length] });
    });
  walk(buckets, null);
  return result;
}

/** Reserves plus leaf buckets, as uniform "slices" of the money. */
export function allSlices(data: RebalancingPayload): Slice[] {
  const reserves = data.reserves.map((reserve, index) => ({
    ...reserve,
    parent: null,
    color: RESERVE_COLORS[index % RESERVE_COLORS.length],
    isReserve: true,
  }));
  return [...reserves, ...leafBuckets(data.buckets)];
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
  unassigned.forEach((h) => add(h, { name: 'Unassigned', color: '#fb7185' }));
  excluded.forEach((h) => add(h, { name: 'Excluded', color: '#4b5a75' }));
  return [...byId.values()].sort((a, b) => b.amount - a.amount);
}
