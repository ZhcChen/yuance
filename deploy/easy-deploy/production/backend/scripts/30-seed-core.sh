#!/usr/bin/env sh
set -eu

if [ -x "./yuance-api" ]; then
  exec ./yuance-api seed core
fi

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
APP_DIR="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"

cd "$APP_DIR"
docker compose --env-file "${YUANCE_ENV_FILE:-.env}" -f "${YUANCE_COMPOSE_FILE:-compose.yaml}" run --rm --no-deps api ./yuance-api seed core
