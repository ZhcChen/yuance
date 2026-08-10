#!/usr/bin/env sh
set -eu

IMAGE="${YUANCE_API_IMAGE:-yuance-api:latest}"
PORT="${YUANCE_WEB_SMOKE_PORT:-33037}"
ROOT="${YUANCE_WEB_SMOKE_ROOT:-.artifacts/web-app-smoke}"
CONTAINER="yuance-web-app-smoke-${PORT}"
MIGRATE_CONTAINER="${CONTAINER}-migrate"
SEED_CONTAINER="${CONTAINER}-seed"
BASE_URL="http://127.0.0.1:${PORT}"
DB_URL="sqlite:///data/yuance.sqlite3"
SESSION_SECRET="${YUANCE_WEB_SMOKE_SESSION_SECRET:-web-smoke-session-secret}"
MASTER_KEY="${YUANCE_WEB_SMOKE_MASTER_KEY:-web-smoke-master-key-2026}"

cleanup() {
  docker logs "$CONTAINER" >"$ROOT/server.log" 2>&1 || true
  docker rm -f "$CONTAINER" "$MIGRATE_CONTAINER" "$SEED_CONTAINER" >/dev/null 2>&1 || true
}

trap cleanup EXIT HUP INT TERM

command -v docker >/dev/null 2>&1 || {
  echo "未找到 docker，无法执行镜像 smoke。" >&2
  exit 1
}
command -v curl >/dev/null 2>&1 || {
  echo "未找到 curl，无法执行镜像 smoke。" >&2
  exit 1
}

rm -rf "$ROOT"
mkdir -p "$ROOT/data"

docker rm -f "$CONTAINER" "$MIGRATE_CONTAINER" "$SEED_CONTAINER" >/dev/null 2>&1 || true

docker run --rm --name "$MIGRATE_CONTAINER" \
  -e YUANCE_DATABASE_URL="$DB_URL" \
  -e YUANCE_DATA_DIR=/data \
  -e YUANCE_ENV=test \
  -e YUANCE_SESSION_SECRET="$SESSION_SECRET" \
  -e YUANCE_SECURITY_MASTER_KEY="$MASTER_KEY" \
  -v "$ROOT/data:/data" \
  "$IMAGE" ./yuance-api migrate up

docker run --rm --name "$SEED_CONTAINER" \
  -e YUANCE_DATABASE_URL="$DB_URL" \
  -e YUANCE_DATA_DIR=/data \
  -e YUANCE_ENV=test \
  -e YUANCE_SESSION_SECRET="$SESSION_SECRET" \
  -e YUANCE_SECURITY_MASTER_KEY="$MASTER_KEY" \
  -v "$ROOT/data:/data" \
  "$IMAGE" ./yuance-api seed local-admin

docker run -d --name "$CONTAINER" \
  -p "127.0.0.1:${PORT}:33033" \
  -e YUANCE_DATABASE_URL="$DB_URL" \
  -e YUANCE_DATA_DIR=/data \
  -e YUANCE_ENV=test \
  -e YUANCE_SESSION_SECRET="$SESSION_SECRET" \
  -e YUANCE_SECURITY_MASTER_KEY="$MASTER_KEY" \
  -v "$ROOT/data:/data" \
  "$IMAGE" >/dev/null

for _ in $(seq 1 80); do
  if curl -fsS "$BASE_URL/api/healthz" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done
curl -fsS "$BASE_URL/api/healthz" >/dev/null

curl -fsSI "$BASE_URL/web/app/" >"$ROOT/index.headers"
INDEX_HTML="$(curl -fsS "$BASE_URL/web/app/")"
printf '%s' "$INDEX_HTML" >"$ROOT/index.html"

grep -qi 'cache-control: no-store, max-age=0, must-revalidate' "$ROOT/index.headers"
printf '%s' "$INDEX_HTML" | grep -q '/web/app/assets/'

ASSET_PATH="$(printf '%s' "$INDEX_HTML" | grep -o '/web/app/assets/[^\"]*' | head -n 1)"
if [ -z "$ASSET_PATH" ]; then
  echo "未在 /web/app/ 入口中找到静态资源路径。" >&2
  exit 1
fi

curl -fsSI "$BASE_URL$ASSET_PATH" >"$ROOT/asset.headers"
grep -qi 'cache-control: public, max-age=31536000, immutable' "$ROOT/asset.headers"

curl -fsSI "$BASE_URL/web/app/manifest.json" >"$ROOT/manifest.headers"
grep -qi 'cache-control: no-store, max-age=0, must-revalidate' "$ROOT/manifest.headers"

DEEP_LINK_HTML="$(curl -fsS "$BASE_URL/web/app/messages/inbox")"
printf '%s' "$DEEP_LINK_HTML" | grep -q '/web/app/assets/'

echo "Web App 镜像 smoke 通过：$IMAGE"
