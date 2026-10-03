"""Target allocation ("rebalancing") of the latest record, driven by ``rebalancing.json``.

Cash-like holdings can't be told apart by purpose, so each holding's equity is assigned on
paper to the reserves and buckets that may hold it:

1. Excluded categories are left out entirely.
2. Reserves have a fixed amount (an emergency fund, a down-payment goal). Buckets get a share of
   the *pool*, which is everything not excluded and not held by a reserve. Weights are relative
   among siblings, so 33/67 means a third and two thirds.
3. ``fill_order`` lists reserves, and optionally leaf buckets, in the order they get first pick
   of the money they accept, each taking up to its target and proportionally across holdings.
   Reserves not listed go last, in config order. A bucket that goes before a reserve changes
   the pool and with it its own target, so the pool is solved as a fixed point.
4. Whatever is left is shared among the remaining buckets that accept it, in proportion to their
   targets. A holding listed by id in a bucket goes only to that bucket and never to a reserve.
   Holdings nothing accepts are reported as unassigned.
"""
from __future__ import annotations

import json
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Self

from pydantic import Field, model_validator

from .config import REBALANCING_CONFIG
from .ledger import HoldingRow, process_records
from .models import Record, StrictModel
from .records import load_records
from .schemas import (
    RebalancingBucket,
    RebalancingHolding,
    RebalancingPayload,
    RebalancingReserve,
)

# Fixed-point tolerance (euros) and iteration cap for solving the pool.
POOL_TOLERANCE = 0.001
MAX_ITERATIONS = 500


class Reserve(StrictModel):
    name: str
    amount: float = Field(ge=0)
    categories: list[str]


class Bucket(StrictModel):
    name: str
    weight: float = Field(gt=0)
    categories: list[str] = []
    holding_ids: list[str] = []
    children: list[Bucket] = []

    @model_validator(mode="after")
    def _children_or_sources(self) -> Self:
        has_sources = bool(self.categories or self.holding_ids)
        if bool(self.children) == has_sources:
            raise ValueError(f"bucket '{self.name}' needs either children or categories/holding_ids, not both")
        return self


class RebalancingConfig(StrictModel):
    excluded_categories: list[str] = []
    reserves: list[Reserve] = []
    buckets: list[Bucket] = Field(min_length=1)
    fill_order: list[str] = []

    @model_validator(mode="after")
    def _consistent(self) -> Self:
        leaf_buckets = [leaf for leaf, _ in leaves(self.buckets, 1.0)]
        ids = [hid for leaf in leaf_buckets for hid in leaf.holding_ids]
        if len(ids) != len(set(ids)):
            raise ValueError("a holding id can only be listed in one bucket")
        names = [r.name for r in self.reserves] + [leaf.name for leaf in leaf_buckets]
        if len(names) != len(set(names)):
            raise ValueError("reserve and leaf bucket names must be unique")
        unknown = set(self.fill_order) - set(names)
        if unknown:
            raise ValueError(f"fill_order names unknown reserves or leaf buckets: {sorted(unknown)}")
        if len(self.fill_order) != len(set(self.fill_order)):
            raise ValueError("fill_order lists a name twice")
        return self

    def steps(self) -> list[Reserve | Bucket]:
        """Reserves and prioritised leaf buckets, in the order they get first pick."""
        by_name: dict[str, Reserve | Bucket] = {r.name: r for r in self.reserves}
        by_name.update({leaf.name: leaf for leaf, _ in leaves(self.buckets, 1.0)})
        ordered = [by_name[name] for name in self.fill_order]
        return ordered + [r for r in self.reserves if r.name not in self.fill_order]


def load_config(path: Path = REBALANCING_CONFIG) -> RebalancingConfig:
    with path.open("r", encoding="utf-8") as handle:
        return RebalancingConfig.model_validate(json.load(handle))


def leaves(buckets: list[Bucket], share: float) -> list[tuple[Bucket, float]]:
    """Leaf buckets with their share of the pool (product of normalised weights down the tree)."""
    total = sum(b.weight for b in buckets)
    result: list[tuple[Bucket, float]] = []
    for bucket in buckets:
        bucket_share = share * bucket.weight / total
        result.extend(leaves(bucket.children, bucket_share) if bucket.children else [(bucket, bucket_share)])
    return result


def money(value: float) -> float:
    return round(value, 2)


def holding_entry(row: HoldingRow, amount: float) -> RebalancingHolding:
    return {"id": row.id, "name": row.name, "category": row.category, "amount": money(amount)}


@dataclass
class Allocation:
    """Result of assigning holdings for a given pool size."""

    remaining: dict[str, float]
    taken: dict[str, dict[str, float]] = field(default_factory=lambda: defaultdict(dict))
    reserved: float = 0.0


def fill_steps(
    config: RebalancingConfig,
    amounts: dict[str, float],
    by_id: dict[str, HoldingRow],
    targets: dict[str, float],
) -> Allocation:
    """Let each step in ``fill_order`` take up to its target from the holdings it accepts."""
    pinned_ids = {hid for leaf, _ in leaves(config.buckets, 1.0) for hid in leaf.holding_ids}
    result = Allocation(remaining=dict(amounts))
    for step in config.steps():
        if isinstance(step, Reserve):
            target = step.amount
            eligible = [hid for hid in result.remaining
                        if hid not in pinned_ids and by_id[hid].category in step.categories]
        else:
            target = targets[step.name]
            eligible = [hid for hid in result.remaining if accepts(step, by_id[hid], pinned_ids)]
        eligible = [hid for hid in eligible if result.remaining[hid] > 0]
        available = sum(result.remaining[hid] for hid in eligible)
        filled = min(target, available)
        for hid in eligible:
            part = filled * result.remaining[hid] / available
            result.remaining[hid] -= part
            result.taken[step.name][hid] = part
        if isinstance(step, Reserve):
            result.reserved += filled
    return result


def accepts(leaf: Bucket, row: HoldingRow, pinned_ids: set[str]) -> bool:
    if row.id in pinned_ids:
        return row.id in leaf.holding_ids
    return row.category in leaf.categories


def build_rebalancing(records: list[Record], config: RebalancingConfig) -> RebalancingPayload:
    snapshots, rows = process_records(records)
    latest_date = snapshots[-1].date
    assets = [r for r in rows if r.date == latest_date and not r.is_liability]
    by_id = {r.id: r for r in assets}

    excluded = [r for r in assets if r.category in config.excluded_categories]
    amounts = {r.id: r.equity_value for r in assets if r.category not in config.excluded_categories}
    total = sum(amounts.values())
    leaf_shares = leaves(config.buckets, 1.0)
    shares = {leaf.name: share for leaf, share in leaf_shares}

    # 1. Solve pool = total - reserves(pool). Each pass converges by at least the prioritised buckets'
    #    combined share (< 1), so plain iteration is enough.
    pool = total
    for _ in range(MAX_ITERATIONS):
        targets = {name: pool * share for name, share in shares.items()}
        allocation = fill_steps(config, amounts, by_id, targets)
        next_pool = total - allocation.reserved
        converged = abs(next_pool - pool) < POOL_TOLERANCE
        pool = next_pool
        if converged:
            break
    targets = {name: pool * share for name, share in shares.items()}
    allocation = fill_steps(config, amounts, by_id, targets)

    # 2. Share what's left among the buckets that accept it, in proportion to their targets.
    #    Buckets that already had first pick only get leftovers nobody else accepts.
    pinned_ids = {hid for leaf, _ in leaf_shares for hid in leaf.holding_ids}
    prioritised = {step.name for step in config.steps() if isinstance(step, Bucket)}
    assigned: dict[str, dict[str, float]] = defaultdict(dict)
    for name, parts in allocation.taken.items():
        assigned[name].update(parts)
    unassigned: list[RebalancingHolding] = []
    for hid, amount in allocation.remaining.items():
        if amount <= POOL_TOLERANCE:
            continue
        row = by_id[hid]
        claimants = [leaf for leaf, _ in leaf_shares if accepts(leaf, row, pinned_ids)]
        claimants = [leaf for leaf in claimants if leaf.name not in prioritised] or claimants
        if not claimants:
            unassigned.append(holding_entry(row, amount))
            continue
        claimant_targets = sum(targets[leaf.name] for leaf in claimants)
        for leaf in claimants:
            part = amount * targets[leaf.name] / claimant_targets if claimant_targets else amount / len(claimants)
            assigned[leaf.name][hid] = assigned[leaf.name].get(hid, 0.0) + part

    def holdings_of(name: str) -> list[RebalancingHolding]:
        entries = [holding_entry(by_id[hid], amount) for hid, amount in assigned[name].items()
                   if money(amount)]
        return sorted(entries, key=lambda h: h["amount"], reverse=True)

    def bucket_item(bucket: Bucket, share: float, parent_share: float) -> RebalancingBucket:
        if bucket.children:
            total_weight = sum(c.weight for c in bucket.children)
            children = [bucket_item(c, share * c.weight / total_weight, share) for c in bucket.children]
            target = sum(c["target"] for c in children)
            current = sum(c["current"] for c in children)
            holdings: list[RebalancingHolding] = []
        else:
            children = []
            holdings = holdings_of(bucket.name)
            target = targets[bucket.name]
            current = sum(h["amount"] for h in holdings)
        return {
            "name": bucket.name,
            "share": round(share * 100, 2),
            "share_of_parent": round(share / parent_share * 100, 2) if parent_share else 0,
            "target": money(target),
            "current": money(current),
            "gap": money(target - current),
            "holdings": holdings,
            "children": children,
        }

    reserves: list[RebalancingReserve] = []
    for reserve in config.reserves:
        holdings = holdings_of(reserve.name)
        current = sum(h["amount"] for h in holdings)
        reserves.append({
            "name": reserve.name,
            "target": money(reserve.amount),
            "current": money(current),
            "gap": money(reserve.amount - current),
            "holdings": holdings,
        })

    top_weight = sum(b.weight for b in config.buckets)
    return {
        "latest_date": latest_date.isoformat(),
        "pool": money(pool),
        "fill_order": [step.name for step in config.steps()],
        "reserves": reserves,
        "buckets": [bucket_item(b, b.weight / top_weight, 1.0) for b in config.buckets],
        "excluded": [holding_entry(r, r.equity_value) for r in excluded],
        "unassigned": unassigned,
    }


def calculate_rebalancing() -> RebalancingPayload:
    """Rebalancing built from the records and config saved on disk."""
    return build_rebalancing(load_records(), load_config())
