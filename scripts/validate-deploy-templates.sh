#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
PRODUCTION_DIR="$ROOT_DIR/deploy/easy-deploy/production"
BACKEND_DIR="$PRODUCTION_DIR/backend"
GATEWAY_DIR="$PRODUCTION_DIR/gateway"
COMPOSE_FILE="$BACKEND_DIR/compose.yaml.example"

require_file() {
  if [ ! -f "$ROOT_DIR/$1" ]; then
    echo "缺少文件: $1" >&2
    exit 1
  fi
}

require_file "api/Dockerfile"
require_file "scripts/build-api-image-amd64.sh"
require_file "scripts/deploy-production.sh"
require_file "deploy/easy-deploy/production/README.md"
require_file "deploy/easy-deploy/production/backend/README.md"
require_file "deploy/easy-deploy/production/backend/app.yaml.example"
require_file "deploy/easy-deploy/production/backend/compose.yaml.example"
require_file "deploy/easy-deploy/production/backend/.env.example"
require_file "deploy/easy-deploy/production/backend/scripts/00-backup-sqlite.sh"
require_file "deploy/easy-deploy/production/backend/scripts/10-migrate-status.sh"
require_file "deploy/easy-deploy/production/backend/scripts/20-migrate-up.sh"
require_file "deploy/easy-deploy/production/backend/scripts/30-seed-core.sh"
require_file "deploy/easy-deploy/production/backend/scripts/80-files-audit.sh"
require_file "deploy/easy-deploy/production/backend/scripts/90-healthcheck.sh"
require_file "deploy/easy-deploy/production/gateway/README.md"
require_file "deploy/easy-deploy/production/gateway/Caddyfile.yuance.example"
require_file "docs/runbooks/production-deployment.md"

for script in \
  "scripts/build-api-image-amd64.sh" \
  "scripts/deploy-production.sh" \
  "scripts/validate-deploy-templates.sh" \
  "deploy/easy-deploy/production/backend/scripts/00-backup-sqlite.sh" \
  "deploy/easy-deploy/production/backend/scripts/10-migrate-status.sh" \
  "deploy/easy-deploy/production/backend/scripts/20-migrate-up.sh" \
  "deploy/easy-deploy/production/backend/scripts/30-seed-core.sh" \
  "deploy/easy-deploy/production/backend/scripts/80-files-audit.sh" \
  "deploy/easy-deploy/production/backend/scripts/90-healthcheck.sh"
do
  if [ ! -x "$ROOT_DIR/$script" ]; then
    echo "脚本缺少可执行权限: $script" >&2
    exit 1
  fi
done

if grep -n '^[[:space:]]*build:' "$COMPOSE_FILE"; then
  echo "正式环境 Compose 模板禁止包含 build 配置。" >&2
  exit 1
fi

if grep -RInE '(AKIA[0-9A-Z]{16}|LTAI[0-9A-Za-z]{12,}|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY)' "$PRODUCTION_DIR" "$ROOT_DIR/docs/runbooks/production-deployment.md"; then
  echo "部署模板疑似包含真实密钥材料。" >&2
  exit 1
fi

if grep -RIn 'docker compose .* run' \
  "$BACKEND_DIR/scripts/10-migrate-status.sh" \
  "$BACKEND_DIR/scripts/20-migrate-up.sh" \
  "$BACKEND_DIR/scripts/30-seed-core.sh"; then
  echo "迁移和基础 seed 脚本禁止回退为多个 docker compose run，请使用单次维护容器。" >&2
  exit 1
fi

if ! grep -q 'container_name: yuance-api' "$COMPOSE_FILE"; then
  echo "Compose 模板必须固定容器名 yuance-api。" >&2
  exit 1
fi

if ! grep -q '127.0.0.1.*33033' "$GATEWAY_DIR/Caddyfile.yuance.example"; then
  echo "Caddy 模板必须反代到 127.0.0.1:33033。" >&2
  exit 1
fi

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  (
    cd "$BACKEND_DIR"
    YUANCE_SESSION_SECRET="validate-session-secret-change-before-deploy" \
    YUANCE_SECURITY_MASTER_KEY="validate-security-master-key-change-before-deploy" \
      docker compose --env-file .env.example -f compose.yaml.example config >/dev/null
  )
else
  echo "跳过 docker compose config：当前环境没有可用 Docker Compose。"
fi

echo "部署模板校验通过。"
