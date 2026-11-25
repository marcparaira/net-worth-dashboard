# Net Worth Dashboard

A React + Python dashboard built from dated YAML records of your assets and liabilities.

## Your data

The app stores its data in PostgreSQL. You load it by importing a data directory of YAML
records:

```
<data directory>/
├── records/            one YAML file per dated snapshot
└── rebalancing.json    rebalancing targets (optional)
```

`sample-data/` is a fictitious data directory committed with the code. Keep your own
data **outside the repository** and point `NET_WORTH_DATA_DIR` at it:

```bash
cp .env.example .env   # then edit NET_WORTH_DATA_DIR
```

Import it once the database is running (see **Run locally**):

```bash
podman compose exec api python -m backend.importer             # imports NET_WORTH_DATA_DIR
podman compose exec api python -m backend.importer --replace   # deletes your data and re-imports
```

The import runs in one transaction and refuses data it cannot store faithfully: a
holding whose name, category or liquidity changes between records, two records with the
same date, or amounts with more than two decimals. The YAML ids are not kept: imported holdings get database ids, and the
rebalancing settings are translated to them. Never commit personal data: `.env`
and the old data locations are ignored, and gitleaks checks every commit (see below).

## Features

- Current liquid assets, non-liquid assets, liabilities, net worth and disposable net value
- Historical balance sheet and individual holdings
- Current asset allocation
- Average monthly movement
- Historical disposable-growth selector: recent 12 months or all-time average

## Run locally

### With Podman (recommended)

Requires Podman and podman-compose (`sudo apt install podman podman-compose`).

```bash
cp .env.example .env        # once; set NET_WORTH_DATA_DIR to use your own data
podman compose up --build   # add -d to run in the background
```

| Service | URL | Notes |
|---|---|---|
| Web app | http://localhost:5173 | Vite dev server, hot reload; reinstalls dependencies on start when `package-lock.json` changed |
| API | http://localhost:8000 | uvicorn with `--reload`; data mounted read-only at `/data` |
| PostgreSQL | localhost:5432 | The API's storage; user, password and database: `networth`. The API applies migrations on start |

Ports bind to localhost only; change them with `WEB_PORT`, `API_PORT` and `DB_PORT` in
`.env`. Other useful commands:

```bash
podman compose ps                 # status and health
podman compose logs -f api        # follow one service's logs
podman compose down               # stop (add -v to also delete the database volume)
```

After changing a Containerfile or dependencies, recreate the whole stack with
`podman compose down && podman compose up -d --build`. podman-compose 1.0.6 links the
containers to each other, so rebuilding a single service (`up --build api`) cannot replace
its container and silently restarts the old one.

### On the host

Requires Python 3.13 and Node.js 24.

```bash
python3.13 -m venv .venv
.venv/bin/pip install -r backend/requirements-dev.txt
npm --prefix frontend install
podman compose up -d db           # PostgreSQL, on DB_PORT from .env (default 5432)
./run-dev.sh                      # migrations, then API on :8000 and web app on :5173; Ctrl+C stops both
.venv/bin/python -m backend.importer   # once: import NET_WORTH_DATA_DIR
```

`run-dev.sh` loads `.env`, uses `backend/.venv` or `.venv`, and stops both servers when either exits.
On the host, the API connects to `localhost:$DB_PORT`; set `DATABASE_URL` to use another database.

## API

- `GET /api/dashboard?rate_basis=last_year`: balance sheet summary, history,
  allocation and holdings from the snapshots in the database.
  `rate_basis` (`last_year` or `overall`) selects the historical monthly
  disposable-growth metric.

- `GET /api/rebalancing`: target allocation of the latest snapshot, from the
  rebalancing settings, edited on the Rebalancing page or imported from `rebalancing.json` (see below).

Both return 404 with an explanation when there are no snapshots yet.

Data entry, used by the snapshot form (which also manages holdings and liabilities). Amounts are exact, with at most
two decimals and never negative (debts are liabilities); errors come back as
`{"detail": "..."}` with 404, 409 (conflict, such as a duplicate date), or 422 (invalid).

- `GET /api/snapshots`, `POST /api/snapshots`: list (newest first, with net worth and
  change) and create.
- `GET|PUT|DELETE /api/snapshots/{id}`: one snapshot with the previous one for
  comparison; replace its date and values; delete it.
- `GET|POST /api/holdings`, `PUT|DELETE /api/holdings/{id}`: holdings with their latest
  value; rename, recategorise, close. Only holdings without history can be deleted.
- `GET|POST /api/liabilities`, `PUT|DELETE /api/liabilities/{id}`: liabilities; set
  `holding_id` to make one the mortgage of a property.
- `GET|POST /api/categories`, `PUT|DELETE /api/categories/{id}`: categories with how many
  holdings use them and whether they are left out of the disposable net value or the
  rebalancing; rename, delete when unused. `POST /api/categories/{id}/merge` moves its
  holdings and rebalancing references to another category.
- `GET|PUT /api/rebalancing/settings`: read or replace all rebalancing settings at once
  (same shape as `rebalancing.json`, with buckets naming holdings by id). Nothing is saved
  unless all of it is valid.
- `POST /api/rebalancing/preview`: the rebalancing that unsaved settings would give.

## Rebalancing

The **Rebalancing** page compares where your money is with where you want it. The targets
are edited on the same page (**Edit targets**), with figures that update as you type; `rebalancing.json`
is only read by the import command. The settings are:

- `excluded_categories`: left out entirely (e.g. Pensions, Vehicles).
- `reserves`: fixed amounts (e.g. emergency fund, down-payment goal), filled in order from
  the listed `categories` before the buckets.
- `fill_order` (optional): reserves and leaf buckets in the order they get first pick of
  the money they accept. A bucket listed before a reserve (e.g. short-term bonds before
  the down payment) is filled to its target first. Reserves not listed go last.
- `buckets`: the rest (the "pool") is split by `weight`. Weights are relative among
  siblings, so `33/33/33` means one third each. A bucket either has `children` (split
  further) or says which holdings it may hold, using `categories` and/or `holding_ids`.

Cash can't be told apart by purpose, so it is assigned on paper. A holding listed by
id goes only to that bucket. Otherwise it is shared among the buckets whose categories
include it, in proportion to their targets. Real estate counts at equity value.
Holdings no bucket accepts show up as a warning.

## Checks

The same checks run in CI (`.github/workflows/ci.yml`) on every push. Tests use
`sample-data/`, never your own data.

```bash
# Backend, from the project root
.venv/bin/ruff check .            # lint
.venv/bin/ruff format .           # format (use --check to only verify)
.venv/bin/basedpyright            # type check
.venv/bin/pytest                  # tests; database tests need TEST_DATABASE_URL (below)

# Frontend
cd frontend
npm run check                     # lint, format check, type check and tests
npm run format                    # format
npm run build                     # production build

# Design tokens, from the project root: contrast and colour-blind safety
python3 scripts/check_design_tokens.py
```

The visual design system (tokens, chart colours, number conventions) is documented in
[docs/design/visual-design.md](docs/design/visual-design.md).

Database tests run against a real PostgreSQL and are skipped unless `TEST_DATABASE_URL`
points at a database whose name ends in `_test` (it is created if missing and **wiped** on
every run). With the compose database:

```bash
export TEST_DATABASE_URL=postgresql+psycopg://networth:networth@localhost:5432/networth_test
.venv/bin/pytest
```

Schema changes: edit `backend/db_models.py`, then generate and review a migration:

```bash
.venv/bin/alembic -c backend/alembic.ini revision --autogenerate -m "describe the change"
.venv/bin/alembic -c backend/alembic.ini check    # models and migrations match
```

Secrets and personal data are blocked by [gitleaks](https://github.com/gitleaks/gitleaks),
configured in `.gitleaks.toml`: its default secret rules plus rules for record files
outside `sample-data/`, Spanish IBANs and cadastral references. It runs in CI on every
push and, once installed, before every commit:

```bash
sudo apt install pre-commit   # or: pipx install pre-commit
pre-commit install
```

## Contributing and releases

Work happens on short-lived branches merged into `main` through pull requests with
Conventional Commit titles; every merge publishes a versioned release. See
[CONTRIBUTING.md](CONTRIBUTING.md).

## Code layout

- `compose.yaml`: local environment (web, API, PostgreSQL)
- `backend/Containerfile`, `frontend/Containerfile`: multi-stage images
- `sample-data/`: fictitious records and rebalancing settings

Backend (`backend/`):

- `app.py`: FastAPI app and routes (thin)
- `config.py`: data directory (`NET_WORTH_DATA_DIR`), CORS origins, category constants
- `models.py`: Pydantic schema of the YAML records
- `records.py`: loads and validates the YAML files (used by the import command)
- `db_models.py`: database schema; `migrations/`: Alembic migrations generated from it
- `db.py`: engine and sessions (`DATABASE_URL`, `DATABASE_POOL`)
- `repository.py`: database reads, scoped to a user, rebuilding the analytics models
- `importer.py`: `python -m backend.importer`, YAML records into the database
- `migrate.py`: `python -m backend.migrate`, waits for the database and applies migrations
- `entries.py`, `entry_routes.py`: data entry (holdings, liabilities, snapshots): rules and API routes
- `settings.py`, `settings_routes.py`: categories and rebalancing settings, including the preview
- `money.py`: exact amounts (two decimals)
- `deps.py`: request dependencies (database session, current user)
- `ledger.py`: per-record totals (`Totals`, `Snapshot`) and per-holding rows
- `timeseries.py`: month arithmetic, monthly interpolation, small numeric helpers
- `dashboard.py`: builds each section of the API payload
- `schemas.py`: typed shape of the API response
- `requirements.txt`, `requirements-dev.txt`: pinned runtime and development dependencies

Frontend (`frontend/src/`, TypeScript):

- `App.tsx`: page layout
- `api/types.ts`: API payload types, kept in sync with `backend/schemas.py`
- `api/client.ts`, `hooks/useApi.ts`: API requests, with readable errors and reload
- `hooks/useHashRoute.ts`: routes in the URL hash (`#snapshots/new`)
- `lib/entries.ts`: snapshot form logic: amount parsing, rows, validation (with tests)
- `lib/rebalancingDraft.ts`: rebalancing settings editor logic: draft, shares, tree edits, validation (with tests)
- `lib/plan.ts`: rows of the rebalancing table, pairing targets with computed figures (with tests)
- `lib/derive.ts`, `lib/rebalancing.ts`: pure functions that turn payloads into chart data (with tests)
- `lib/format.ts`, `lib/theme.ts`, `lib/constants.ts`: formatters, colours, shared chart props, category names
- `components/`: one component per panel, plus shared pieces in `common.tsx`
- `pages/`: Dashboard, Rebalancing (the plan and editing its targets), and Snapshots (list, and the form that also manages holdings and liabilities)
