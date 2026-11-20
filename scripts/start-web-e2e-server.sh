#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH='' cd -- "${SCRIPT_DIR}/.." && pwd)"
cd "$REPO_ROOT"

PORT="${YUANCE_WEB_E2E_PORT:-33036}"
HOST="${YUANCE_WEB_E2E_HOST:-127.0.0.1}"
ROOT="${YUANCE_WEB_E2E_ROOT:-${REPO_ROOT}/.artifacts/web-e2e}"
DB_PATH="${ROOT}/yuance.sqlite3"
DB_URL="sqlite://${DB_PATH}"
SECURITY_KEY="${YUANCE_SECURITY_MASTER_KEY:-test-master-key-that-is-long-enough}"
WEB_DIST_DIR="${YUANCE_WEB_DIST_DIR:-${REPO_ROOT}/web/dist}"

command -v cargo >/dev/null 2>&1 || {
  echo "[web-e2e] 未找到 cargo" >&2
  exit 1
}
command -v sqlite3 >/dev/null 2>&1 || {
  echo "[web-e2e] 未找到 sqlite3" >&2
  exit 1
}

rm -rf "$ROOT"
mkdir -p "$ROOT"

npm --prefix web run build

export YUANCE_HTTP_ADDR="${HOST}:${PORT}"
export YUANCE_DATABASE_URL="$DB_URL"
export YUANCE_DATA_DIR="$ROOT"
export YUANCE_ENV="test"
export YUANCE_SECURITY_MASTER_KEY="$SECURITY_KEY"
export YUANCE_LOG_LEVEL="off"
export YUANCE_WEB_DIST_DIR="$WEB_DIST_DIR"

cargo run -p yuance-api -- migrate up
cargo run -p yuance-api -- seed demo

sqlite3 "$DB_PATH" < "${REPO_ROOT}/scripts/e2e/seed-notifications.sql"
sqlite3 "$DB_PATH" < "${REPO_ROOT}/scripts/e2e/seed-current-project.sql"

exec cargo run -p yuance-api -- serve
