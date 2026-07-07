#!/usr/bin/env sh
set -eu

ARGS=""
if [ "${YUANCE_INCLUDE_DELETED_FILES:-0}" = "1" ]; then
  ARGS="--include-deleted"
fi

if [ -x "./yuance-api" ]; then
  exec ./yuance-api files audit-objects $ARGS
fi

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
APP_DIR="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"

cd "$APP_DIR"
docker compose --env-file "${YUANCE_ENV_FILE:-.env}" -f "${YUANCE_COMPOSE_FILE:-compose.yaml}" run --rm --no-deps api ./yuance-api files audit-objects $ARGS
