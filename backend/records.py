"""Loading and validating the YAML balance records."""

from __future__ import annotations

from pathlib import Path
from typing import cast

import yaml
from pydantic import ValidationError

from .config import RECORDS_DIR
from .models import Record


def load_records(directory: Path = RECORDS_DIR) -> list[Record]:
    """Parse every ``*.yaml``/``*.yml`` file in ``directory``, skipping empty ones."""
    records: list[Record] = []
    for path in sorted(directory.glob("*.y*ml")):
        with path.open("r", encoding="utf-8") as handle:
            data = cast(object, yaml.safe_load(handle))
        if data is None:
            continue
        try:
            records.append(Record.model_validate(data))
        except ValidationError as exc:
            raise ValueError(f"{path.name}: {exc}") from exc
    if not records:
        raise RuntimeError(f"No YAML records found in {directory}")
    return records
