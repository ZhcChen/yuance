#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"

REMOTE_HOST="${YUANCE_DEPLOY_HOST:-qfy-sc-test}"
REMOTE_ROOT="${YUANCE_DEPLOY_ROOT:-/srv/yuance}"
# 服务器目录名沿用首次部署路径；发布流程只使用 SSH/SCP + Docker Compose，不调用 easy-deploy 平台。
REMOTE_BACKEND_DIR="$REMOTE_ROOT/easy-deploy/production/backend"
REMOTE_GATEWAY_DIR="$REMOTE_ROOT/easy-deploy/production/gateway"
REMOTE_RELEASE_DIR="$REMOTE_ROOT/releases"

IMAGE="${YUANCE_API_IMAGE:-yuance-api:latest}"
IMAGE_TAR="${YUANCE_API_IMAGE_TAR:-dist/yuance-api-linux-amd64.tar}"
REMOTE_IMAGE_TAR="$REMOTE_RELEASE_DIR/$(basename "$IMAGE_TAR")"
KEEP_RELEASE_BACKUPS="${YUANCE_KEEP_RELEASE_BACKUPS:-1}"
PRUNE_DANGLING_IMAGES="${YUANCE_PRUNE_DANGLING_IMAGES:-0}"
SKIP_BUILD="${YUANCE_SKIP_LOCAL_BUILD:-0}"

require_file() {
  if [ ! -f "$ROOT_DIR/$1" ]; then
    echo "缺少文件: $1" >&2
    exit 1
  fi
}

run() {
  echo "==> $*"
  "$@"
}

require_clean_main() {
  branch="$(git -C "$ROOT_DIR" branch --show-current)"
  if [ "$branch" != "main" ]; then
    echo "正式环境部署必须在 main 分支执行，当前分支：$branch" >&2
    exit 1
  fi
  if [ -n "$(git -C "$ROOT_DIR" status --porcelain --untracked-files=all)" ]; then
    echo "正式环境部署前工作区必须干净，请先提交或还原本地改动。" >&2
    exit 1
  fi
  git -C "$ROOT_DIR" fetch --quiet origin main
  local_head="$(git -C "$ROOT_DIR" rev-parse HEAD)"
  origin_head="$(git -C "$ROOT_DIR" rev-parse origin/main)"
  if [ "$local_head" != "$origin_head" ]; then
    echo "正式环境部署前 main 必须与 origin/main 一致。" >&2
    echo "local:  $local_head" >&2
    echo "origin: $origin_head" >&2
    exit 1
  fi
}

local_sha256() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    echo "当前系统缺少 shasum/sha256sum，无法校验镜像 tar。" >&2
    exit 1
  fi
}

require_file "scripts/build-api-image-amd64.sh"
require_file "deploy/easy-deploy/production/backend/app.yaml.example"
require_file "deploy/easy-deploy/production/backend/compose.yaml.example"
require_file "deploy/easy-deploy/production/backend/.env.example"
require_file "deploy/easy-deploy/production/gateway/Caddyfile.yuance.example"

require_clean_main

if [ "$SKIP_BUILD" != "1" ]; then
  run "$ROOT_DIR/scripts/build-api-image-amd64.sh"
fi

if [ ! -f "$ROOT_DIR/$IMAGE_TAR" ]; then
  echo "缺少镜像 tar: $IMAGE_TAR" >&2
  exit 1
fi

LOCAL_SHA="$(local_sha256 "$ROOT_DIR/$IMAGE_TAR")"
echo "本地镜像 tar: $IMAGE_TAR"
echo "本地 SHA256: $LOCAL_SHA"

run ssh "$REMOTE_HOST" "set -eu; mkdir -p '$REMOTE_RELEASE_DIR' '$REMOTE_BACKEND_DIR' '$REMOTE_GATEWAY_DIR'; if [ -f '$REMOTE_IMAGE_TAR' ]; then ts=\$(date +%Y%m%d%H%M%S); backup='${REMOTE_IMAGE_TAR%.tar}.before-'\$ts'.tar'; cp '$REMOTE_IMAGE_TAR' \"\$backup\"; echo \"已备份当前镜像 tar: \$(basename \"\$backup\")\"; fi"

run scp "$ROOT_DIR/$IMAGE_TAR" "$REMOTE_HOST:$REMOTE_IMAGE_TAR"
run scp "$ROOT_DIR/deploy/easy-deploy/production/backend/app.yaml.example" "$REMOTE_HOST:$REMOTE_BACKEND_DIR/app.yaml"
run scp "$ROOT_DIR/deploy/easy-deploy/production/backend/compose.yaml.example" "$REMOTE_HOST:$REMOTE_BACKEND_DIR/compose.yaml"
run scp "$ROOT_DIR/deploy/easy-deploy/production/backend/.env.example" "$REMOTE_HOST:$REMOTE_BACKEND_DIR/.env.example"
run scp -r "$ROOT_DIR/deploy/easy-deploy/production/backend/scripts" "$REMOTE_HOST:$REMOTE_BACKEND_DIR/"
run scp "$ROOT_DIR/deploy/easy-deploy/production/gateway/Caddyfile.yuance.example" "$REMOTE_HOST:$REMOTE_GATEWAY_DIR/Caddyfile.yuance"

REMOTE_SHA="$(ssh "$REMOTE_HOST" "sha256sum '$REMOTE_IMAGE_TAR' | awk '{print \$1}'")"
if [ "$LOCAL_SHA" != "$REMOTE_SHA" ]; then
  echo "远程镜像 tar SHA256 不一致：$REMOTE_SHA" >&2
  exit 1
fi
echo "远程 SHA256 校验通过。"

run ssh "$REMOTE_HOST" \
  "YUANCE_IMAGE='$IMAGE' YUANCE_REMOTE_IMAGE_TAR='$REMOTE_IMAGE_TAR' YUANCE_BACKEND_DIR='$REMOTE_BACKEND_DIR' YUANCE_KEEP_RELEASE_BACKUPS='$KEEP_RELEASE_BACKUPS' YUANCE_PRUNE_DANGLING_IMAGES='$PRUNE_DANGLING_IMAGES' sh -s" <<'REMOTE_SCRIPT'
set -eu

IMAGE="${YUANCE_IMAGE:-yuance-api:latest}"
IMAGE_TAR="${YUANCE_REMOTE_IMAGE_TAR:?set YUANCE_REMOTE_IMAGE_TAR}"
BACKEND_DIR="${YUANCE_BACKEND_DIR:?set YUANCE_BACKEND_DIR}"
KEEP_RELEASE_BACKUPS="${YUANCE_KEEP_RELEASE_BACKUPS:-1}"
PRUNE_DANGLING_IMAGES="${YUANCE_PRUNE_DANGLING_IMAGES:-0}"

cd "$BACKEND_DIR"

for command_name in docker timeout sha256sum; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "服务器缺少命令：$command_name" >&2
    exit 1
  fi
done

if [ ! -s ".env" ]; then
  echo "服务器缺少 $BACKEND_DIR/.env，拒绝部署。" >&2
  exit 1
fi

chmod 600 .env
chmod +x scripts/*.sh

cleanup_transient_containers() {
  for prefix in yuance-api-run- yuance-api-maintenance-; do
    ids="$(docker ps -aq --filter "name=$prefix" 2>/dev/null || true)"
    if [ -n "$ids" ]; then
      docker rm -f $ids >/dev/null 2>&1 || true
    fi
  done
}

cleanup_named_container() {
  name="$1"
  docker rm -f "$name" >/dev/null 2>&1 || true
}

run_timeout() {
  label="$1"
  seconds="$2"
  shift 2
  echo "==> $label"
  timeout -k 30s "${seconds}s" "$@"
}

run_compose_maintenance() {
  container_name="$1"
  cleanup_named_container "$container_name"
  run_timeout "执行迁移和基础 seed" 900 \
    docker compose --env-file .env -f compose.yaml run --rm --no-deps --name "$container_name" api sh -eu -c '
      ./yuance-api migrate status
      ./yuance-api migrate up
      ./yuance-api seed core
    '
  cleanup_named_container "$container_name"
}

cleanup() {
  cleanup_transient_containers
}

trap cleanup EXIT HUP INT TERM

cleanup_transient_containers

run_timeout "加载镜像 tar" 300 docker load -i "$IMAGE_TAR"

run_timeout "SQLite 发布前备份" 300 ./scripts/00-backup-sqlite.sh

stamp="$(date +%Y%m%d%H%M%S)"
run_compose_maintenance "yuance-api-maintenance-$stamp"

run_timeout "重建并启动 api 容器" 300 docker compose --env-file .env -f compose.yaml up -d --force-recreate --remove-orphans api
run_timeout "Compose 状态" 60 docker compose --env-file .env -f compose.yaml ps
run_timeout "健康检查" 120 ./scripts/90-healthcheck.sh

latest="$(docker image inspect "$IMAGE" --format '{{.Id}}')"
running="$(docker inspect yuance-api --format '{{.Image}}')"
if [ "$latest" != "$running" ]; then
  echo "运行容器镜像不是最新镜像：latest=$latest running=$running" >&2
  exit 1
fi

case "$KEEP_RELEASE_BACKUPS" in
  ''|*[!0-9]*)
    echo "YUANCE_KEEP_RELEASE_BACKUPS 必须是非负整数：$KEEP_RELEASE_BACKUPS" >&2
    exit 1
    ;;
esac

release_dir="$(dirname "$IMAGE_TAR")"
image_file="$(basename "$IMAGE_TAR")"
image_backup_prefix="${image_file%.tar}.before-"
old_backups="$(cd "$release_dir" && ls -1t "$image_backup_prefix"*.tar 2>/dev/null | tail -n +"$((KEEP_RELEASE_BACKUPS + 1))" || true)"
if [ -n "$old_backups" ]; then
  echo "$old_backups" | while IFS= read -r file; do
    rm -f "$release_dir/$file"
  done
fi

if [ "$PRUNE_DANGLING_IMAGES" = "1" ]; then
  run_timeout "清理 Docker dangling 镜像" 300 docker image prune -f
fi

echo "正式环境部署完成。"
REMOTE_SCRIPT

echo "正式环境部署完成：$REMOTE_HOST"
