#!/usr/bin/env bash
# Build le front e2e puis joue la suite Playwright (stack SQLite locale).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
echo "[1/3] Build front e2e (build-e2e)…"
( cd "$ROOT/client/src/frontend" && BUILD_PATH=build-e2e REACT_APP_API_URL=/api CI=false npm run build )
echo "[2/3] Install Playwright…"
( cd "$ROOT/e2e" && npm ci )
echo "[3/3] Tests E2E…"
( cd "$ROOT/e2e" && npx playwright test "$@" )
