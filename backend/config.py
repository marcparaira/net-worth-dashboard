"""Application-wide settings and domain constants."""
from __future__ import annotations

from pathlib import Path
from typing import Literal

BASE_DIR = Path(__file__).resolve().parent
RECORDS_DIR = BASE_DIR / "records"
REBALANCING_CONFIG = BASE_DIR / "rebalancing.json"

CORS_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]

# Holdings in this category are left out of the disposable net value.
EXCLUDED_CATEGORY = "Immobles"
# Synthetic category given to standalone liabilities when listed next to holdings.
LIABILITY_CATEGORY = "Liability"

RateBasis = Literal["last_year", "overall"]
