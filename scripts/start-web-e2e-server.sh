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

sqlite3 "$DB_PATH" <<'SQL'
INSERT INTO notifications (
    recipient_user_id,
    actor_user_id,
    actor_display_name_snapshot,
    kind,
    work_item_id,
    comment_id,
    title,
    body
)
VALUES (
    (SELECT id FROM users WHERE username = 'yuance_admin'),
    (SELECT id FROM users WHERE username = 'yuance_admin'),
    '系统管理员',
    'comment_mentioned',
    (SELECT id FROM work_items WHERE item_key = 'YCE-TASK-2'),
    (
        SELECT id
        FROM work_item_comments
        WHERE work_item_id = (SELECT id FROM work_items WHERE item_key = 'YCE-TASK-2')
          AND deleted_at IS NULL
        ORDER BY id ASC
        LIMIT 1
    ),
    '请查看待处理讨论',
    '这是一条用于浏览器验收的未读通知'
);

INSERT INTO notifications (
    recipient_user_id,
    actor_user_id,
    actor_display_name_snapshot,
    kind,
    work_item_id,
    comment_id,
    title,
    body,
    read_at
)
VALUES (
    (SELECT id FROM users WHERE username = 'yuance_admin'),
    (SELECT id FROM users WHERE username = 'yuance_admin'),
    '系统管理员',
    'work_item_assigned',
    (SELECT id FROM work_items WHERE item_key = 'YCE-TASK-1'),
    NULL,
    '已读指派消息',
    '这是一条用于浏览器验收的已读通知',
    '2026-07-30T00:00:00Z'
);
SQL

exec cargo run -p yuance-api -- serve
