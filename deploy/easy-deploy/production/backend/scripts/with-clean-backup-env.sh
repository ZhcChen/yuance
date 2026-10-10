#!/usr/bin/env sh
set -eu

if [ "$#" -eq 0 ]; then
  echo "必须提供 SQLite 快照命令。" >&2
  exit 2
fi

if [ "${YUANCE_FILE_MASTER_KEY+x}" = x ]; then
  exec env -i "PATH=${PATH:-/usr/bin:/bin}" YUANCE_BACKUP_REQUIRED=1 \
    "YUANCE_FILE_MASTER_KEY=$YUANCE_FILE_MASTER_KEY" "$@"
fi

exec env -i "PATH=${PATH:-/usr/bin:/bin}" YUANCE_BACKUP_REQUIRED=1 "$@"
