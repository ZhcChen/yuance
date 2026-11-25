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

# 新实例启动需要时间：在重试窗口内轮询，healthz 与 readyz 都成功才算通过。
ATTEMPTS="${YUANCE_HEALTH_ATTEMPTS:-30}"
INTERVAL="${YUANCE_HEALTH_INTERVAL_SECONDS:-2}"
attempt=1
while :; do
  if fetch "$BASE_URL/api/healthz" 2>/dev/null && fetch "$BASE_URL/api/readyz" 2>/dev/null; then
    break
  fi
  if [ "$attempt" -ge "$ATTEMPTS" ]; then
    echo "元策健康检查失败（已重试 $ATTEMPTS 次）：$BASE_URL" >&2
    fetch "$BASE_URL/api/readyz" || true
    exit 1
  fi
  attempt=$((attempt + 1))
  sleep "$INTERVAL"
done

echo "元策健康检查通过：$BASE_URL"
