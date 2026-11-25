"""Import validation and schema rules that need no database."""

from __future__ import annotations

import pytest

from backend.db_models import Base
from backend.importer import DataImportError, check_consistency, exact
from backend.models import Record


def record(day: str, category: str = "Accions", name: str = "Broker") -> Record:
    return Record.model_validate(
        {"date": day, "assets": {"liquid": [{"id": "broker", "name": name, "value": 100, "category": category}]}}
    )


def test_amounts_keep_two_decimals_exactly():
    assert str(exact(1234.5, "x")) == "1234.50"
    with pytest.raises(DataImportError, match="more than two decimals"):
        _ = exact(10.125, "x")


def test_a_holding_must_not_change_between_records():
    check_consistency([record("2026-01-31"), record("2026-02-28")])
    with pytest.raises(DataImportError, match="holding 'broker'"):
        check_consistency([record("2026-01-31"), record("2026-02-28", category="Efectiu i bons CT")])
    with pytest.raises(DataImportError, match="holding 'broker'"):
        check_consistency([record("2026-01-31"), record("2026-02-28", name="Renamed")])


def test_two_records_cannot_share_a_date():
    with pytest.raises(DataImportError, match="same date"):
        check_consistency([record("2026-01-31"), record("2026-01-31")])


def test_every_table_has_an_owner():
    without_owner = [
        name for name, table in Base.metadata.tables.items() if name != "users" and "user_id" not in table.c
    ]
    assert without_owner == []
