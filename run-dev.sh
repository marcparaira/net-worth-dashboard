#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

# Load local settings, such as NET_WORTH_DATA_DIR, from .env if present.
if [[ -f "$ROOT_DIR/.env" ]]; then
    set -a
    # shellcheck source=/dev/null
    source "$ROOT_DIR/.env"
    set +a
fi
echo "Data directory: ${NET_WORTH_DATA_DIR:-$ROOT_DIR/sample-data (sample data)}"

for command in node npm; do
    if ! command -v "$command" >/dev/null 2>&1; then
        echo "$command is required. Install Node.js and npm first." >&2
        exit 1
    fi
done

PYTHON=""
for candidate in "$ROOT_DIR/backend/.venv/bin/python" "$ROOT_DIR/.venv/bin/python"; do
    if [[ -x "$candidate" ]] && "$candidate" -c 'import uvicorn, fastapi, pydantic, yaml' 2>/dev/null; then
        PYTHON="$candidate"
        break
    fi
done
if [[ -z "$PYTHON" ]]; then
    echo "Set up the backend first from the project folder:" >&2
    echo "python3 -m venv backend/.venv" >&2
    echo "backend/.venv/bin/pip install -r backend/requirements.txt" >&2
    exit 1
fi
if [[ ! -f "$ROOT_DIR/frontend/node_modules/vite/bin/vite.js" ]]; then
    echo "Install frontend dependencies first: npm --prefix frontend install" >&2
    exit 1
fi

backend_pid=""
frontend_pid=""
cleanup() {
    trap - EXIT INT TERM
    for pid in "$backend_pid" "$frontend_pid"; do
        if [[ -n "$pid" ]]; then
            kill "$pid" 2>/dev/null || true
        fi
    done
    wait 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

(
    cd "$ROOT_DIR"
    exec "$PYTHON" -m uvicorn backend.app:app --reload --reload-dir backend --port 8000
) &
backend_pid=$!

(
    cd "$ROOT_DIR/frontend"
    exec node node_modules/vite/bin/vite.js --port 5173 --strictPort
) &
frontend_pid=$!

printf 'Frontend: http://localhost:5173\nBackend:  http://localhost:8000\nPress Ctrl+C to stop both.\n'
# Stop the other service if either exits.
wait -n "$backend_pid" "$frontend_pid"
