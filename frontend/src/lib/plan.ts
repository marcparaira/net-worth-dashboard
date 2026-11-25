// Rows of the rebalancing plan table: the targets (as an editable draft) paired with the
// numbers the API computed for them (saved results, or a live preview while editing).
import type { RebalancingBucket, RebalancingPayload } from '../api/types';
import { isLeaf, type BucketDraft, type ReserveDraft, type SettingsDraft } from './rebalancingDraft';

export interface PlanNumbers {
  target: number;
  current: number;
  /** Positive: money to add; negative: over target. */
  gap: number;
}

export type PlanRow =
  | { kind: 'reserve'; key: string; depth: 0; reserve: ReserveDraft; members: string[]; numbers: PlanNumbers | null }
  | {
      kind: 'bucket';
      key: string;
      depth: number;
      bucket: BucketDraft;
      members: string[];
      numbers: PlanNumbers | null;
    };

const numbers = (
  item: { target: number; current: number; gap: number } | undefined,
  name: string,
  draftName: string,
) => (item && name === draftName.trim() ? { target: item.target, current: item.current, gap: item.gap } : null);

/**
 * Reserves first, then the bucket tree depth first. Numbers are matched by position and name,
 * so a preview computed for an older draft shows nothing rather than the wrong figures.
 */
export function planRows(
  draft: SettingsDraft,
  payload: RebalancingPayload | null,
  holdingName: (id: string) => string,
): PlanRow[] {
  const rows: PlanRow[] = draft.reserves.map((reserve, i) => ({
    kind: 'reserve',
    key: reserve.key,
    depth: 0,
    reserve,
    members: reserve.categories,
    numbers: numbers(payload?.reserves[i], payload?.reserves[i]?.name ?? '', reserve.name),
  }));
  const walk = (buckets: BucketDraft[], computed: RebalancingBucket[] | undefined, depth: number) =>
    buckets.forEach((bucket, i) => {
      const item = computed?.[i];
      rows.push({
        kind: 'bucket',
        key: bucket.key,
        depth,
        bucket,
        members: isLeaf(bucket) ? [...bucket.categories, ...bucket.holdingIds.map(holdingName)] : [],
        numbers: numbers(item, item?.name ?? '', bucket.name),
      });
      walk(bucket.children, item?.children, depth + 1);
    });
  walk(draft.buckets, payload?.buckets, 0);
  return rows;
}
