#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)"
PRODUCTION_DIR="$ROOT_DIR/deploy/easy-deploy/production"
BACKEND_DIR="$PRODUCTION_DIR/backend"
GATEWAY_DIR="$PRODUCTION_DIR/gateway"
COMPOSE_FILE="$BACKEND_DIR/compose.yaml.example"
PRODUCTION_README="$PRODUCTION_DIR/README.md"
APP_METADATA="$BACKEND_DIR/app.yaml.example"

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
require_file "deploy/easy-deploy/production/gateway/nginx-yuance.example.conf"
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

for file in "$BACKEND_DIR/.env.example" "$COMPOSE_FILE"; do
  if ! grep -q 'YUANCE_DEVICE_TRUSTED_PROXY_CIDRS' "$file"; then
    echo "部署模板缺少 YUANCE_DEVICE_TRUSTED_PROXY_CIDRS: $file" >&2
    exit 1
  fi
done

if ! grep -q '127.0.0.1.*33033' "$GATEWAY_DIR/Caddyfile.yuance.example"; then
  echo "旧环境回滚用 Caddy 模板必须反代到 127.0.0.1:33033。" >&2
  exit 1
fi

for directive in \
  'proxy_intercept_errors on' \
  'error_page 502 503 504 =200' \
  'Cache-Control "no-store' \
  'Retry-After "5"' \
  '系统正在更新中'
do
  if ! grep -q "$directive" "$GATEWAY_DIR/nginx-yuance.example.conf"; then
    echo "Nginx 维护页模板缺少关键配置: $directive" >&2
    exit 1
  fi
done

if ! grep -q 'server_name yuance.quanxinfu.com' "$GATEWAY_DIR/nginx-yuance.example.conf" \
  || ! grep -q '127.0.0.1:40000' "$GATEWAY_DIR/nginx-yuance.example.conf"; then
  echo "Nginx Yuance 模板必须指向 yuance.quanxinfu.com -> 127.0.0.1:40000。" >&2
  exit 1
fi

if ! grep -q 'DEPLOY_MODE="${YUANCE_DEPLOY_MODE:-}"' "$ROOT_DIR/scripts/deploy-production.sh"; then
  echo "正式部署模式必须由调用者显式指定。" >&2
  exit 1
fi

if ! grep -q 'BUILD_MODE="${YUANCE_DEPLOY_BUILD_MODE:-}"' "$ROOT_DIR/scripts/deploy-production.sh"; then
  echo "正式构建模式必须由调用者显式指定。" >&2
  exit 1
fi

if grep -q 'YUANCE_DEPLOY_HOST:-qfy-sc-test' "$ROOT_DIR/scripts/deploy-production.sh"; then
  echo "正式部署禁止隐式回退到旧服务器 qfy-sc-test。" >&2
  exit 1
fi

for file in "$PRODUCTION_README" "$APP_METADATA"; do
  if ! grep -q '/srv/yuance/backend' "$file"; then
    echo "正式部署说明必须声明 WSL 运行目录 /srv/yuance/backend: $file" >&2
    exit 1
  fi
done

if grep -Eq '(当前部署机器|部署服务器当前).*qfy-sc-test' "$PRODUCTION_README" "$APP_METADATA"; then
  echo "正式部署说明不得把 qfy-sc-test 描述为当前应用运行节点。" >&2
  exit 1
fi

if ! grep -q 'remote 模式必须显式设置 YUANCE_DEPLOY_HOST' "$ROOT_DIR/scripts/deploy-production.sh"; then
  echo "remote 模式必须校验显式目标主机。" >&2
  exit 1
fi

for contract in \
  '必须显式设置 YUANCE_DEPLOY_MODE' \
  '必须显式设置 YUANCE_DEPLOY_BUILD_MODE' \
  'validate_release_parameters' \
  'preflight_remote_target' \
  'canonicalize_missing' \
  '构建目录真实路径落入后端运行目录' \
  'sqlite3' \
  'YUANCE_BUILD_ROOT' \
  'YUANCE_BUILD_ROOT 不得位于正式运行目录' \
  'validate_docker_image_reference' \
  'if (length(name) > 255)' \
  'for command_name in node npm tar' \
  'docker buildx inspect --bootstrap' \
  'YUANCE_ALLOW_DIRTY_LOCAL_CONFIG' \
  'YUANCE_REMOTE_BUILD_DIR' \
  'npm --prefix frontend ci' \
  'npm --prefix web ci' \
  'ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm --prefix desktop ci'
do
  if ! grep -q "$contract" "$ROOT_DIR/scripts/deploy-production.sh"; then
    echo "正式部署脚本缺少同机编译安全契约: $contract" >&2
    exit 1
  fi
done

for contract in \
  '.backup' \
  'PRAGMA integrity_check;' \
  'file_master_key_source=%s' \
  'required_external_configuration=YUANCE_FILE_MASTER_KEY' \
  'trap cleanup EXIT' \
  "trap 'exit 1' HUP INT TERM" \
  'backup_path_cursor=' \
  '拒绝通过符号链接路径使用备份目录' \
  'BACKUP_REAL_ROOT=' \
  'TEMPORARY_REAL_ROOT=' \
  'canonicalize_missing_path()' \
  'DATA_REAL_DIR=' \
  '"$backup_path_cursor" -ef "$DATA_REAL_DIR"' \
  'chmod 700 "$DEST"' \
  'chmod 600 "$SNAPSHOT"'
do
  if ! grep -Fq "$contract" "$BACKEND_DIR/scripts/00-backup-sqlite.sh"; then
    echo "SQLite 备份脚本缺少一致性或密钥恢复契约: $contract" >&2
    exit 1
  fi
done

if grep -Fq 'chmod 700 "$BACKUP_ROOT"' "$BACKEND_DIR/scripts/00-backup-sqlite.sh"; then
  echo "SQLite 备份脚本不得改写任意备份根目录权限。" >&2
  exit 1
fi

if grep -q '\$DB_BASE-wal\|\$DB_BASE-shm' "$BACKEND_DIR/scripts/00-backup-sqlite.sh"; then
  echo "SQLite 备份必须生成单文件一致性快照，禁止并发复制 WAL/SHM。" >&2
  exit 1
fi

if ! grep -q 'archive --format=tar.gz' "$ROOT_DIR/scripts/deploy-production.sh"; then
  echo "远程编译必须从提交归档同步源码，禁止直接同步工作区。" >&2
  exit 1
fi

for file in "$PRODUCTION_README" "$ROOT_DIR/docs/runbooks/production-deployment.md"; do
  if ! grep -q 'YUANCE_DEPLOY_BUILD_MODE=remote' "$file"; then
    echo "正式部署说明缺少显式远程构建模式：$file" >&2
    exit 1
  fi
done

if ! grep -q 'file_master_key_source' "$ROOT_DIR/docs/runbooks/production-deployment.md"; then
  echo "正式部署手册缺少备份 manifest 和密钥来源说明。" >&2
  exit 1
fi

if ! grep -q 'PRAGMA integrity_check' "$ROOT_DIR/docs/runbooks/api-migrations.md"; then
  echo "迁移手册缺少 SQLite 快照完整性检查。" >&2
  exit 1
fi

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  (
    cd "$BACKEND_DIR"
    YUANCE_SESSION_SECRET="validate-session-secret-change-before-deploy" \
    YUANCE_SECURITY_MASTER_KEY="validate-security-master-key-change-before-deploy" \
    YUANCE_SERVER_INSTANCE_ID="validate-production-instance" \
      docker compose --env-file .env.example -f compose.yaml.example config >/dev/null
  )
else
  echo "跳过 docker compose config：当前环境没有可用 Docker Compose。"
fi

echo "部署模板校验通过。"
