import { PALETTE } from './theme';

// Reserves (fixed amounts) use warm colours, buckets use the rest of the palette.
const RESERVE_COLORS = ['#f59e0b', '#f472b6', '#a3e635'];
const BUCKET_COLORS = PALETTE.filter(color => !RESERVE_COLORS.includes(color));

/** Leaf buckets in display order, each with a colour and the name of its parent group (if any). */
export function leafBuckets(buckets) {
  const result = [];
  const walk = (items, parent) => items.forEach(bucket => {
    if (bucket.children.length) walk(bucket.children, bucket.name);
    else result.push({ ...bucket, parent, color: BUCKET_COLORS[result.length % BUCKET_COLORS.length] });
  });
  walk(buckets, null);
  return result;
}

/** Reserves plus leaf buckets, as uniform "slices" of the money. */
export function allSlices(data) {
  const reserves = data.reserves.map((reserve, index) => ({
    ...reserve, parent: null, color: RESERVE_COLORS[index % RESERVE_COLORS.length], isReserve: true,
  }));
  return [...reserves, ...leafBuckets(data.buckets)];
}

/** Inverse view: each holding with the slices its value was assigned to. */
export function holdingsBreakdown(slices, excluded, unassigned) {
  const byId = new Map();
  const add = (holding, part) => {
    if (!byId.has(holding.id)) byId.set(holding.id, { ...holding, amount: 0, parts: [] });
    const entry = byId.get(holding.id);
    entry.amount += holding.amount;
    entry.parts.push({ ...part, amount: holding.amount });
  };
  slices.forEach(slice => slice.holdings.forEach(h => add(h, { name: slice.name, color: slice.color })));
  unassigned.forEach(h => add(h, { name: 'Unassigned', color: '#fb7185' }));
  excluded.forEach(h => add(h, { name: 'Excluded', color: '#4b5a75' }));
  return [...byId.values()].sort((a, b) => b.amount - a.amount);
}
