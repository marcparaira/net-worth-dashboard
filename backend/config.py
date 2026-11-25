"""Application-wide settings and domain constants."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Literal

BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent

# Fictitious data committed with the code, used by default and by the tests.
SAMPLE_DATA_DIR = PROJECT_DIR / "sample-data"

# YAML records to import (see backend/importer.py). Personal data lives outside the
# repository; point NET_WORTH_DATA_DIR at it.
DATA_DIR = Path(os.environ.get("NET_WORTH_DATA_DIR") or SAMPLE_DATA_DIR).expanduser()
RECORDS_DIR = DATA_DIR / "records"
REBALANCING_CONFIG = DATA_DIR / "rebalancing.json"

# PostgreSQL connection. Defaults to the compose database published on localhost (DB_PORT).
DATABASE_URL = (
    os.environ.get("DATABASE_URL")
    or f"postgresql+psycopg://networth:networth@localhost:{os.environ.get('DB_PORT') or 5432}/networth"
)
# "null" opens a connection per request and closes it afterwards (AWS Lambda), so idle
# connections never keep Aurora from pausing; "queue" keeps a small pool (long-running servers).
DATABASE_POOL: Literal["queue", "null"] = "null" if os.environ.get("DATABASE_POOL") == "null" else "queue"

# Until accounts exist (roadmap Phase 8), all data belongs to this single local user.
LOCAL_USER_SUBJECT = "local"

# Release version, set by the release workflow when it builds the image; "dev" otherwise.
APP_VERSION = os.environ.get("APP_VERSION") or "dev"

CORS_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]

# Holdings in this category are left out of the disposable net value.
EXCLUDED_CATEGORY = "Immobles"
# Synthetic category given to standalone liabilities when listed next to holdings.
LIABILITY_CATEGORY = "Liability"

RateBasis = Literal["last_year", "overall"]
