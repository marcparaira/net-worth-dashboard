"""Storage in PostgreSQL: import, read-back, and the API served from the database."""

from __future__ import annotations

from decimal import Decimal

import pytest
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from fastapi.testclient import TestClient
from sqlalchemy import Engine, select, text
from sqlalchemy.orm import Session

from backend import repository
from backend.config import SAMPLE_DATA_DIR
from backend.dashboard import build_dashboard
from backend.db_models import Base, Category, SnapshotValue
from backend.importer import DataImportError, import_data
from backend.models import Assets, Holding, Liabilities, Record
from backend.rebalancing import Bucket, RebalancingConfig, build_rebalancing, load_config
from backend.records import load_records as load_yaml_records

pytestmark = pytest.mark.db


def relabel(records: list[Record], config: RebalancingConfig, ids: dict[str, str]):
    """The YAML records and settings with every id replaced by the database id it was imported as,
    so they can be compared with what the database gives back."""

    def bucket(b: Bucket) -> Bucket:
        return b.model_copy(
            update={"holding_ids": [ids[h] for h in b.holding_ids], "children": [bucket(c) for c in b.children]}
        )

    def holding(h: Holding) -> Holding:
        mortgage = h.mortgage.model_copy(update={"id": ids[h.mortgage.id]}) if h.mortgage else None
        return h.model_copy(update={"id": ids[h.id], "mortgage": mortgage})

    relabelled = [
        Record(
            date=r.date,
            assets=Assets(
                liquid=[holding(h) for h in r.assets.liquid], non_liquid=[holding(h) for h in r.assets.non_liquid]
            ),
            liabilities=Liabilities(
                non_liquid=[lb.model_copy(update={"id": ids[lb.id]}) for lb in r.liabilities.non_liquid]
            ),
        )
        for r in records
    ]
    return relabelled, config.model_copy(update={"buckets": [bucket(b) for b in config.buckets]})


@pytest.fixture(scope="module")
def sample() -> tuple[list[Record], RebalancingConfig]:
    return load_yaml_records(SAMPLE_DATA_DIR / "records"), load_config(SAMPLE_DATA_DIR / "rebalancing.json")


def test_migrations_match_the_models(db_engine: Engine) -> None:
    with db_engine.connect() as connection:
        assert compare_metadata(MigrationContext.configure(connection), Base.metadata) == []


def test_imported_data_gives_identical_results(db_session: Session, sample: tuple[list[Record], RebalancingConfig]):
    summary = import_data(db_session, *sample)
    assert (summary.snapshots, summary.rebalancing) == (len(sample[0]), True)
    # The database identifies holdings by its own ids; everything else must be identical.
    records, config = relabel(*sample, summary.ids)

    user = repository.find_user(db_session)
    assert user is not None
    stored_records = repository.load_records(db_session, user.id)
    stored_config = repository.load_rebalancing_config(db_session, user.id)

    assert stored_config == config
    for basis in ("last_year", "overall"):
        assert build_dashboard(stored_records, basis) == build_dashboard(records, basis)
    assert stored_config is not None
    assert build_rebalancing(stored_records, stored_config) == build_rebalancing(records, config)


def test_amounts_are_stored_as_exact_decimals(db_session: Session, sample: tuple[list[Record], RebalancingConfig]):
    records, _ = sample
    _ = import_data(db_session, records, None)
    query = (
        "SELECT data_type, numeric_precision, numeric_scale FROM information_schema.columns"
        + " WHERE table_name = 'snapshot_values' AND column_name = 'amount'"
    )
    column_type = db_session.execute(text(query)).one()
    assert tuple(column_type) == ("numeric", 14, 2)
    amounts = db_session.scalars(select(SnapshotValue.amount)).all()
    assert amounts and all(isinstance(amount, Decimal) for amount in amounts)


def test_import_refuses_existing_data_unless_replacing(
    db_session: Session, sample: tuple[list[Record], RebalancingConfig]
):
    records, config = sample
    _ = import_data(db_session, records, config)
    with pytest.raises(DataImportError, match="already has"):
        _ = import_data(db_session, records, config)

    summary = import_data(db_session, records[:3], None, replace=True)
    user = repository.find_user(db_session)
    assert user is not None
    assert summary.snapshots == 3
    assert len(repository.load_records(db_session, user.id)) == 3
    assert repository.load_rebalancing_config(db_session, user.id) is None


def test_categories_record_exclusions(db_session: Session, sample: tuple[list[Record], RebalancingConfig]):
    records, config = sample
    _ = import_data(db_session, records, config)
    flags = {
        c.name: (c.excluded_from_disposable, c.excluded_from_rebalancing) for c in db_session.scalars(select(Category))
    }
    assert flags["Immobles"] == (True, False)
    assert flags["Pensions"] == (False, True)
    assert flags["Accions"] == (False, False)


def test_users_only_see_their_own_data(db_session: Session, sample: tuple[list[Record], RebalancingConfig]):
    records, config = sample
    _ = import_data(db_session, records, config, subject="alice")
    _ = import_data(db_session, records[:2], None, subject="bob")
    alice = repository.find_user(db_session, "alice")
    bob = repository.find_user(db_session, "bob")
    assert alice is not None and bob is not None
    assert len(repository.load_records(db_session, alice.id)) == len(records)
    assert len(repository.load_records(db_session, bob.id)) == 2
    assert repository.load_rebalancing_config(db_session, bob.id) is None


def test_api_serves_the_imported_data(
    client: TestClient, db_session: Session, sample: tuple[list[Record], RebalancingConfig]
):
    summary = import_data(db_session, *sample)
    records, config = relabel(*sample, summary.ids)

    dashboard = client.get("/api/dashboard", params={"rate_basis": "overall"})
    assert dashboard.status_code == 200
    assert dashboard.json() == build_dashboard(records, "overall")

    rebalancing = client.get("/api/rebalancing")
    assert rebalancing.status_code == 200
    assert rebalancing.json() == build_rebalancing(records, config)


def test_api_explains_when_there_is_no_data(client: TestClient):
    response = client.get("/api/dashboard")
    assert response.status_code == 404
    assert "backend.importer" in response.json()["detail"]
