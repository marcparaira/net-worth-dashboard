# Net Worth Dashboard

A React + Python dashboard built from the supplied YAML records.

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
  allocation and holdings from the YAML records in `backend/records/`.
  `rate_basis` (`last_year` or `overall`) selects the historical monthly
  disposable-growth metric.

Run checks with `.venv/bin/python -m unittest discover -s backend/tests`
from the project root.
