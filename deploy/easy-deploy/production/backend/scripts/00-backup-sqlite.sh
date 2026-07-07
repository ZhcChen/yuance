#!/usr/bin/env sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
APP_DIR="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"

if [ -n "${YUANCE_SQLITE_PATH:-}" ]; then
  DB_BASE="$YUANCE_SQLITE_PATH"
elif [ -d "/data" ] && [ ! -d "$APP_DIR/data" ]; then
  DB_BASE="/data/yuance.sqlite3"
else
  DB_BASE="$APP_DIR/data/yuance.sqlite3"
fi

if [ -n "${YUANCE_BACKUP_DIR:-}" ]; then
  BACKUP_ROOT="$YUANCE_BACKUP_DIR"
elif [ "$DB_BASE" = "/data/yuance.sqlite3" ]; then
  BACKUP_ROOT="/backups"
else
  BACKUP_ROOT="$APP_DIR/backups"
fi

if [ ! -f "$DB_BASE" ]; then
  echo "未发现 SQLite 数据库 $DB_BASE，首次部署跳过备份。"
  exit 0
fi

STAMP="$(date -u +%Y%m%d%H%M%S)"
DEST="$BACKUP_ROOT/$STAMP"
mkdir -p "$DEST"

COPIED=0
for file in "$DB_BASE" "$DB_BASE-wal" "$DB_BASE-shm"; do
  if [ -f "$file" ]; then
    cp -p "$file" "$DEST/"
    COPIED=$((COPIED + 1))
  fi
done

echo "SQLite 备份完成：$DEST，文件数：$COPIED"
