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

## Run the API

From the project folder:

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt
uvicorn backend.app:app --reload --reload-dir backend --port 8000
```

## Run the React app

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173.

## Run both together

```bash
./run-dev.sh
```

The script automatically uses `backend/.venv` or `.venv` (with backend dependencies installed), so no manual activation is needed. Install frontend dependencies with `npm --prefix frontend install` on first use.

The script starts the FastAPI backend on port 8000 and the Vite frontend on port 5173, and stops both when you exit.

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

Run the tests from the project root. They use `sample-data/`, never your own data:

```bash
.venv/bin/python -m unittest discover -s backend/tests
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

Backend (`backend/`):

- `app.py`: FastAPI app and routes (thin)
- `config.py`: data directory (`NET_WORTH_DATA_DIR`), CORS origins, category constants
- `models.py`: Pydantic schema of the YAML records
- `records.py`: loads and validates the YAML files
- `ledger.py`: per-record totals (`Totals`, `Snapshot`) and per-holding rows
- `timeseries.py`: month arithmetic, monthly interpolation, small numeric helpers
- `dashboard.py`: builds each section of the API payload
- `schemas.py`: typed shape of the API response

Frontend (`frontend/src/`):

- `App.jsx`: page layout
- `hooks/useDashboard.js`: fetches the API payload
- `lib/derive.js`: pure functions that turn the payload into chart data
- `lib/format.js`, `lib/theme.js`, `lib/constants.js`: formatters, colours, shared chart props, category names
- `components/`: one component per panel, plus shared pieces in `common.jsx`
