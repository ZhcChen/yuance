#!/usr/bin/env sh
set -eu

BASE_URL="${YUANCE_HEALTH_URL:-http://127.0.0.1:33033}"

fetch() {
  url="$1"
  if command -v curl >/dev/null 2>&1; then
    curl -fsS "$url" >/dev/null
  else
    wget -qO- "$url" >/dev/null
  fi
}

fetch "$BASE_URL/api/healthz"
fetch "$BASE_URL/api/readyz"

echo "元策健康检查通过：$BASE_URL"
