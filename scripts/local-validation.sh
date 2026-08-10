#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
STATE_DIR="${YUANCE_VALIDATION_STATE_DIR:-$ROOT_DIR/.local/validation}"
DATA_DIR="$STATE_DIR/data"
BACKUP_DIR="$STATE_DIR/backups"
RUNTIME_ENV="$STATE_DIR/runtime.env"
DATABASE_PATH="$DATA_DIR/yuance.sqlite3"
API_ORIGIN="${YUANCE_VALIDATION_API_ORIGIN:-http://127.0.0.1:33133}"
WEB_ORIGIN="${YUANCE_VALIDATION_WEB_ORIGIN:-http://127.0.0.1:33134}"
DESKTOP_RENDERER_ORIGIN="${YUANCE_VALIDATION_DESKTOP_RENDERER_ORIGIN:-http://127.0.0.1:33135}"

fail() {
  printf '错误：%s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "缺少命令：$1"
}

prepare_state() {
  require_command openssl
  mkdir -p "$DATA_DIR" "$BACKUP_DIR"
  chmod 700 "$STATE_DIR" "$DATA_DIR" "$BACKUP_DIR"
  if [ ! -f "$RUNTIME_ENV" ]; then
    umask 077
    {
      printf 'YUANCE_SESSION_SECRET=%s\n' "$(openssl rand -hex 32)"
      printf 'YUANCE_SECURITY_MASTER_KEY=%s\n' "$(openssl rand -hex 32)"
    } > "$RUNTIME_ENV"
  fi
  chmod 600 "$RUNTIME_ENV"
}

load_runtime() {
  prepare_state
  # shellcheck disable=SC1090
  source "$RUNTIME_ENV"
  export YUANCE_SESSION_SECRET YUANCE_SECURITY_MASTER_KEY
  export YUANCE_ENV=development
  export YUANCE_HTTP_ADDR="${API_ORIGIN#http://}"
  export YUANCE_DATABASE_URL="sqlite://$DATABASE_PATH"
  export YUANCE_DATA_DIR="$DATA_DIR"
  export YUANCE_SERVER_INSTANCE_ID=yuance-local-validation
}

assert_api_stopped() {
  local port="${API_ORIGIN##*:}"
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null | grep -q .; then
    fail "本地验收 API 仍在监听 $API_ORIGIN，请先停止后再导入数据库"
  fi
}

import_database() {
  [ "$#" -eq 1 ] || fail "用法：$0 import-db <正式环境 SQLite 快照>"
  local source_path="$1"
  [ -f "$source_path" ] || fail "数据库快照不存在：$source_path"
  require_command sqlite3
  assert_api_stopped
  prepare_state

  local integrity
  integrity="$(sqlite3 "$source_path" 'PRAGMA quick_check;' 2>&1)" || fail "源数据库检查失败：$integrity"
  [ "$integrity" = "ok" ] || fail "源数据库不完整：$integrity"

  local stamp incoming
  stamp="$(date -u +%Y%m%d%H%M%S)-$$-$RANDOM"
  incoming="$DATA_DIR/yuance-$stamp.incoming.sqlite3"
  sqlite3 "$source_path" ".backup '$incoming'"
  [ "$(sqlite3 "$incoming" 'PRAGMA quick_check;')" = "ok" ] || fail "导入副本完整性检查失败"

  if [ -f "$DATABASE_PATH" ]; then
    sqlite3 "$DATABASE_PATH" ".backup '$BACKUP_DIR/yuance-before-import-$stamp.sqlite3'"
  fi
  for existing in "$DATABASE_PATH" "$DATABASE_PATH-wal" "$DATABASE_PATH-shm"; do
    if [ -f "$existing" ]; then
      mv "$existing" "$BACKUP_DIR/$(basename "$existing").before-$stamp"
    fi
  done
  mv "$incoming" "$DATABASE_PATH"
  chmod 600 "$DATABASE_PATH"
  printf '数据库已导入：%s\n' "$DATABASE_PATH"
  printf '下一步：%s api\n' "$0"
}

run_api() {
  load_runtime
  cd "$ROOT_DIR"
  cargo run -p yuance-api -- migrate up
  exec cargo run -p yuance-api -- serve
}

run_web() {
  prepare_state
  cd "$ROOT_DIR"
  export YUANCE_WEB_PROXY_TARGET="$API_ORIGIN"
  exec npm --prefix web run dev -- --base / --host 127.0.0.1 --port "${WEB_ORIGIN##*:}" --strictPort
}

run_desktop() {
  prepare_state
  cd "$ROOT_DIR"
  export YUANCE_DESKTOP_WEB_URL="$API_ORIGIN/web"
  export YUANCE_DESKTOP_RENDERER_URL="$DESKTOP_RENDERER_ORIGIN"
  exec npm --prefix desktop run dev
}

show_status() {
  prepare_state
  printf '状态目录：%s\n' "$STATE_DIR"
  printf '数据库：%s (%s)\n' "$DATABASE_PATH" "$([ -f "$DATABASE_PATH" ] && printf '已就绪' || printf '未导入')"
  printf 'API：%s\n' "$API_ORIGIN"
  printf 'Web：%s/web\n' "$WEB_ORIGIN"
  printf 'Desktop renderer：%s\n' "$DESKTOP_RENDERER_ORIGIN"
  if curl --max-time 2 --fail --silent "$API_ORIGIN/api/healthz" >/dev/null 2>&1; then
    printf 'API 状态：运行中\n'
  else
    printf 'API 状态：未运行\n'
  fi
}

case "${1:-}" in
  prepare)
    prepare_state
    show_status
    ;;
  import-db)
    shift
    import_database "$@"
    ;;
  api)
    run_api
    ;;
  web)
    run_web
    ;;
  desktop)
    run_desktop
    ;;
  status)
    show_status
    ;;
  *)
    printf '用法：%s {prepare|import-db <sqlite快照>|api|web|desktop|status}\n' "$0" >&2
    exit 2
    ;;
esac
