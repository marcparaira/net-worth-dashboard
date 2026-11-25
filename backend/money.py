"""Exact money amounts."""

from __future__ import annotations

from decimal import Decimal

CENT = Decimal("0.01")


def to_cents(value: float) -> Decimal:
    """The amount as an exact decimal; refuses values that need more than two decimals."""
    result = Decimal(repr(value))
    if result != result.quantize(CENT):
        raise ValueError(f"{value} has more than two decimals")
    return result.quantize(CENT)
