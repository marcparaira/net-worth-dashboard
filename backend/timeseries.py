"""Calendar arithmetic and small numeric helpers over dated snapshots."""

from __future__ import annotations

import calendar
from datetime import date
from itertools import pairwise

from .ledger import Snapshot, Totals


def month_index(day: date) -> int:
    """Months since year 0, so consecutive calendar months differ by one."""
    return day.year * 12 + day.month - 1


def subtract_months(day: date, months: int) -> date:
    """Calendar month offset that clamps to the target month's last day."""
    year, month0 = divmod(month_index(day) - months, 12)
    month = month0 + 1
    return date(year, month, min(day.day, calendar.monthrange(year, month)[1]))


def monthly_summary(snapshots: list[Snapshot]) -> list[Totals]:
    """Last snapshot of each calendar month, linearly interpolating months without one.

    ``snapshots`` must be sorted by date.
    """
    if not snapshots:
        return []
    first = month_index(snapshots[0].date)
    last = month_index(snapshots[-1].date)
    # Later snapshots overwrite earlier ones, so each month keeps its last snapshot.
    by_month: dict[int, Totals] = {month_index(s.date) - first: s.totals for s in snapshots}
    known = sorted(by_month)

    monthly: list[Totals] = []
    for index in range(last - first + 1):
        totals = by_month.get(index)
        if totals is None:
            before = max(k for k in known if k < index)
            after = min(k for k in known if k > index)
            totals = by_month[before].lerp(by_month[after], (index - before) / (after - before))
        monthly.append(totals)
    return monthly


def baseline_before(snapshots: list[Snapshot], target: date) -> Snapshot | None:
    """Latest snapshot dated on or before ``target``."""
    candidates = [s for s in snapshots if s.date <= target]
    return candidates[-1] if candidates else None


def mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def diffs(values: list[float]) -> list[float]:
    return [b - a for a, b in pairwise(values)]
