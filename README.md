# Net Worth Dashboard

A React + Python dashboard built from dated YAML records of your assets and liabilities.

## Your data

The app reads its data from a data directory:

```
<data directory>/
├── records/            one YAML file per dated snapshot
└── rebalancing.json    rebalancing targets
```

By default it uses `sample-data/`, a fictitious dataset committed with the code. To use
your own data, keep it **outside the repository** and point `NET_WORTH_DATA_DIR` at it:

```bash
cp .env.example .env   # then edit NET_WORTH_DATA_DIR
```

`run-dev.sh` loads `.env` automatically; when running uvicorn yourself, export the
variable first. Never commit personal data: `.env` and the old data locations are
ignored, and gitleaks checks every commit (see below).

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
| Web app | http://localhost:5173 | Vite dev server, hot reload |
| API | http://localhost:8000 | uvicorn with `--reload`; data mounted read-only at `/data` |
| PostgreSQL | localhost:5432 | Used from Phase 3; user, password and database: `networth` |

Ports bind to localhost only; change them with `WEB_PORT`, `API_PORT` and `DB_PORT` in
`.env`. Other useful commands:

```bash
podman compose ps                 # status and health
podman compose logs -f api        # follow one service's logs
podman compose down               # stop (add -v to also delete the database volume)
```

### On the host

Requires Python 3.13 and Node.js 24.

```bash
python3.13 -m venv .venv
.venv/bin/pip install -r backend/requirements-dev.txt
npm --prefix frontend install
./run-dev.sh                      # API on :8000 and web app on :5173; Ctrl+C stops both
```

`run-dev.sh` loads `.env`, uses `backend/.venv` or `.venv`, and stops both servers when either exits.

## API

- `GET /api/dashboard?rate_basis=last_year`: balance sheet summary, history,
  allocation and holdings from the YAML records in `<data directory>/records/`.
  `rate_basis` (`last_year` or `overall`) selects the historical monthly
  disposable-growth metric.

- `GET /api/rebalancing`: target allocation of the latest record, configured in
  `<data directory>/rebalancing.json` (see below).

## Rebalancing

The **Rebalancing** tab compares where your money is with where you want it, using
`<data directory>/rebalancing.json`:

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
.venv/bin/pytest                  # tests

# Frontend
cd frontend
npm run check                     # lint, format check, type check and tests
npm run format                    # format
npm run build                     # production build
```

Secrets and personal data are blocked by [gitleaks](https://github.com/gitleaks/gitleaks),
configured in `.gitleaks.toml`: its default secret rules plus rules for record files
outside `sample-data/`, Spanish IBANs and cadastral references. It runs in CI on every
push and, once installed, before every commit:

```bash
sudo apt install pre-commit   # or: pipx install pre-commit
pre-commit install
```

## Code layout

- `compose.yaml`: local environment (web, API, PostgreSQL)
- `backend/Containerfile`, `frontend/Containerfile`: multi-stage images
- `sample-data/`: fictitious records and rebalancing settings

Backend (`backend/`):

- `app.py`: FastAPI app and routes (thin)
- `config.py`: data directory (`NET_WORTH_DATA_DIR`), CORS origins, category constants
- `models.py`: Pydantic schema of the YAML records
- `records.py`: loads and validates the YAML files
- `ledger.py`: per-record totals (`Totals`, `Snapshot`) and per-holding rows
- `timeseries.py`: month arithmetic, monthly interpolation, small numeric helpers
- `dashboard.py`: builds each section of the API payload
- `schemas.py`: typed shape of the API response
- `requirements.txt`, `requirements-dev.txt`: pinned runtime and development dependencies

Frontend (`frontend/src/`, TypeScript):

- `App.tsx`: page layout
- `api/types.ts`: API payload types, kept in sync with `backend/schemas.py`
- `hooks/useApi.ts`, `hooks/useDashboard.ts`: fetch the API payloads
- `lib/derive.ts`, `lib/rebalancing.ts`: pure functions that turn payloads into chart data (with tests)
- `lib/format.ts`, `lib/theme.ts`, `lib/constants.ts`: formatters, colours, shared chart props, category names
- `components/`: one component per panel, plus shared pieces in `common.tsx`
- `pages/`: Dashboard and Rebalancing pages
