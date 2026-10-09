#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)"

DEPLOY_MODE="${YUANCE_DEPLOY_MODE:-}"
BUILD_MODE="${YUANCE_DEPLOY_BUILD_MODE:-}"
LOCAL_WSL_ROOT="${YUANCE_LOCAL_WSL_ROOT:-/srv/yuance}"
LOCAL_BACKEND_DIR="$LOCAL_WSL_ROOT/backend"
LOCAL_RELEASE_DIR="$LOCAL_WSL_ROOT/releases"

REMOTE_HOST="${YUANCE_DEPLOY_HOST:-}"
REMOTE_ROOT="${YUANCE_DEPLOY_ROOT:-/srv/yuance}"
# 远程正式环境直接使用 /srv/yuance/backend；发布流程只使用 SSH/SCP + Docker Compose。
REMOTE_BACKEND_DIR="${YUANCE_DEPLOY_BACKEND_DIR:-$REMOTE_ROOT/backend}"
REMOTE_GATEWAY_DIR="${YUANCE_DEPLOY_GATEWAY_DIR:-$REMOTE_ROOT/gateway}"
REMOTE_RELEASE_DIR="$REMOTE_ROOT/releases"
REMOTE_BUILD_ROOT="${YUANCE_BUILD_ROOT:-$REMOTE_ROOT/build}"

IMAGE="${YUANCE_API_IMAGE:-yuance-api:latest}"
IMAGE_TAR="${YUANCE_API_IMAGE_TAR:-dist/yuance-api-linux-amd64.tar}"
REMOTE_IMAGE_TAR=""
KEEP_RELEASE_BACKUPS="${YUANCE_KEEP_RELEASE_BACKUPS:-1}"
PRUNE_DANGLING_IMAGES="${YUANCE_PRUNE_DANGLING_IMAGES:-0}"
SSE_DRAIN_TIMEOUT="${YUANCE_SSE_DRAIN_TIMEOUT:-30s}"
STOP_GRACE_PERIOD="${YUANCE_STOP_GRACE_PERIOD:-45s}"
MAX_RELEASE_WINDOW="${YUANCE_MAX_RELEASE_WINDOW:-10m}"
SKIP_BUILD="${YUANCE_SKIP_LOCAL_BUILD:-0}"
SOURCE_COMMIT=""
REMOTE_BUILD_DIR=""
REMOTE_BUILD_TAR=""
SOURCE_ARCHIVE=""

fail() {
  echo "$1" >&2
  exit 1
}

validate_absolute_path() {
  name="$1"
  value="$2"
  case "$value" in
    /*) ;;
    *) fail "$name 必须是绝对路径：$value" ;;
  esac
  case "$value" in
    *[!A-Za-z0-9._/-]*) fail "$name 含有不支持的字符：$value" ;;
  esac
  case "$value" in
    *//*) fail "$name 不得包含重复斜杠：$value" ;;
  esac
  case "/$value/" in
    */../*|*/./*) fail "$name 不得包含 . 或 .. 路径段：$value" ;;
  esac
  case "$value" in
    /|*/) fail "$name 不得是根目录或以斜杠结尾：$value" ;;
  esac
}

validate_docker_image_reference() {
  if ! printf '%s\n' "$IMAGE" | awk '
    function valid_component(value) {
      return value ~ /^[a-z0-9]+(([._]|__|-+)[a-z0-9]+)*$/
    }
    function valid_domain(value, parts, count, host, port, suffix, closing, i) {
      if (substr(value, 1, 1) == "[") {
        closing = index(value, "]")
        if (!closing) return 0
        host = substr(value, 2, closing - 2)
        if (host !~ /^[[:xdigit:]:]+$/ || index(host, ":") == 0) return 0
        suffix = substr(value, closing + 1)
        if (suffix == "") return 1
        if (substr(suffix, 1, 1) != ":") return 0
        port = substr(suffix, 2)
        return port ~ /^[0-9]+$/
      }
      count = split(value, parts, ":")
      if (count > 2) return 0
      host = parts[1]
      if (count == 2) {
        port = parts[2]
        if (port !~ /^[0-9]+$/) return 0
      }
      if (host !~ /^[A-Za-z0-9.-]+$/ || host ~ /\.\.|^-|-$|\.-|\.\-/) return 0
      count = split(host, parts, ".")
      for (i = 1; i <= count; i++) {
        if (parts[i] !~ /^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?$/) return 0
      }
      return 1
    }
    function valid_reference(reference, i, last_slash, last_colon, name, tag, component_count, components, first, first_path_component, path) {
      if (length(reference) == 0 || reference ~ /@/) return 0

      last_slash = 0
      for (i = 1; i <= length(reference); i++) {
        if (substr(reference, i, 1) == "/") last_slash = i
      }
      last_colon = 0
      for (i = last_slash + 1; i <= length(reference); i++) {
        if (substr(reference, i, 1) == ":") last_colon = i
      }
      name = reference
      if (last_colon) {
        name = substr(reference, 1, last_colon - 1)
        tag = substr(reference, last_colon + 1)
        if (length(tag) > 128 || tag !~ /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/) return 0
      }
      if (name == "" || name ~ /^\// || name ~ /\/$/ || name ~ /\/\//) return 0
      if (length(name) > 255) return 0

      component_count = split(name, components, "/")
      if (component_count > 1) {
        first = components[1]
        if (first ~ /[.:]/ || first == "localhost" || first ~ /^\[/) {
          if (!valid_domain(first)) return 0
          first_path_component = 2
        } else {
          first_path_component = 1
        }
      } else {
        first_path_component = 1
      }
      if (first_path_component > component_count) return 0
      path = name
      if (first_path_component == 2) path = substr(name, index(name, "/") + 1)
      if (length(path) > 255) return 0
      for (i = first_path_component; i <= component_count; i++) {
        if (!valid_component(components[i])) return 0
      }
      return 1
    }
    {
      if (NR > 1 || !valid_reference($0)) invalid = 1
    }
    END {
      if (NR != 1 || invalid) exit 1
      exit 0
    }
  '; then
    fail "YUANCE_API_IMAGE 不是有效的 Docker 镜像名称与标签：$IMAGE"
  fi
}

validate_duration() {
  name="$1"
  value="$2"
  case "$value" in
    *s) amount="${value%s}"; maximum=86400 ;;
    *m) amount="${value%m}"; maximum=1440 ;;
    *h) amount="${value%h}"; maximum=24 ;;
    *) fail "$name 必须使用正整数加 s、m 或 h，且不超过 24 小时：$value" ;;
  esac
  case "$amount" in
    ''|0|0*|*[!0-9]*) fail "$name 必须使用规范的正整数时长：$value" ;;
  esac
  if [ "${#amount}" -gt 5 ] || [ "$amount" -gt "$maximum" ]; then
    fail "$name 不得超过 24 小时：$value"
  fi
}

validate_image_tar_path() {
  case "$IMAGE_TAR" in
    /*|*[!A-Za-z0-9._/-]*) fail "YUANCE_API_IMAGE_TAR 必须是仓库内的 .tar 相对路径：$IMAGE_TAR" ;;
  esac
  case "/$IMAGE_TAR/" in
    */../*|*/./*) fail "YUANCE_API_IMAGE_TAR 不得包含 . 或 .. 路径段：$IMAGE_TAR" ;;
  esac
  case "$IMAGE_TAR" in
    *.tar) ;;
    *) fail "YUANCE_API_IMAGE_TAR 必须以 .tar 结尾：$IMAGE_TAR" ;;
  esac

  candidate="$ROOT_DIR"
  remaining="$IMAGE_TAR"
  while [ -n "$remaining" ]; do
    component="${remaining%%/*}"
    if [ "$component" = "$remaining" ]; then
      remaining=""
    else
      remaining="${remaining#*/}"
    fi
    candidate="$candidate/$component"
    if [ -L "$candidate" ]; then
      fail "YUANCE_API_IMAGE_TAR 路径不得包含符号链接：$IMAGE_TAR"
    fi
  done
}

validate_release_parameters() {
  if [ -z "$DEPLOY_MODE" ]; then
    fail "必须显式设置 YUANCE_DEPLOY_MODE=remote 或 YUANCE_DEPLOY_MODE=local-wsl。"
  fi
  if [ -z "$BUILD_MODE" ]; then
    fail "必须显式设置 YUANCE_DEPLOY_BUILD_MODE=remote 或 YUANCE_DEPLOY_BUILD_MODE=local。"
  fi

  case "$DEPLOY_MODE" in
    local-wsl)
      if [ "${YUANCE_DEPLOY_HOST+x}" = "x" ]; then
        fail "local-wsl 模式不接受 YUANCE_DEPLOY_HOST，请移除该变量。"
      fi
      if [ "$BUILD_MODE" = "remote" ]; then
        fail "local-wsl 模式只支持 YUANCE_DEPLOY_BUILD_MODE=local。"
      fi
      ;;
    remote)
      if [ -z "$REMOTE_HOST" ]; then
        fail "remote 模式必须显式设置 YUANCE_DEPLOY_HOST。"
      fi
      case "$REMOTE_HOST" in
        -*|*[!A-Za-z0-9._@-]*) fail "YUANCE_DEPLOY_HOST 含有不支持的字符：$REMOTE_HOST" ;;
      esac
      ;;
    *) fail "YUANCE_DEPLOY_MODE 仅支持 local-wsl 或 remote：$DEPLOY_MODE" ;;
  esac

  case "$BUILD_MODE" in
    local|remote) ;;
    *) fail "YUANCE_DEPLOY_BUILD_MODE 仅支持 local 或 remote：$BUILD_MODE" ;;
  esac

  for setting in "$SKIP_BUILD" "$PRUNE_DANGLING_IMAGES" "${YUANCE_ALLOW_DIRTY_LOCAL_CONFIG:-0}"; do
    case "$setting" in
      0|1) ;;
      *) fail "YUANCE_SKIP_LOCAL_BUILD、YUANCE_PRUNE_DANGLING_IMAGES 和 YUANCE_ALLOW_DIRTY_LOCAL_CONFIG 只支持 0 或 1。" ;;
    esac
  done
  if [ "$BUILD_MODE" = "remote" ] && [ "$SKIP_BUILD" = "1" ]; then
    fail "remote 构建模式不支持 YUANCE_SKIP_LOCAL_BUILD=1，请让目标机从源码构建。"
  fi

  case "$KEEP_RELEASE_BACKUPS" in
    ''|*[!0-9]*|0[0-9]*) fail "YUANCE_KEEP_RELEASE_BACKUPS 必须是 0 到 100 的规范非负整数：$KEEP_RELEASE_BACKUPS" ;;
  esac
  if [ "${#KEEP_RELEASE_BACKUPS}" -gt 3 ] || [ "$KEEP_RELEASE_BACKUPS" -gt 100 ]; then
    fail "YUANCE_KEEP_RELEASE_BACKUPS 不得超过 100：$KEEP_RELEASE_BACKUPS"
  fi

  validate_duration YUANCE_SSE_DRAIN_TIMEOUT "$SSE_DRAIN_TIMEOUT"
  validate_duration YUANCE_STOP_GRACE_PERIOD "$STOP_GRACE_PERIOD"
  validate_duration YUANCE_MAX_RELEASE_WINDOW "$MAX_RELEASE_WINDOW"
  validate_absolute_path YUANCE_LOCAL_WSL_ROOT "$LOCAL_WSL_ROOT"
  validate_absolute_path YUANCE_DEPLOY_ROOT "$REMOTE_ROOT"
  validate_absolute_path YUANCE_DEPLOY_BACKEND_DIR "$REMOTE_BACKEND_DIR"
  validate_absolute_path YUANCE_DEPLOY_GATEWAY_DIR "$REMOTE_GATEWAY_DIR"
  validate_absolute_path YUANCE_BUILD_ROOT "$REMOTE_BUILD_ROOT"
  case "$REMOTE_BUILD_ROOT" in
    "$REMOTE_BACKEND_DIR"|"$REMOTE_BACKEND_DIR"/*)
      fail "YUANCE_BUILD_ROOT 不得位于正式运行目录：$REMOTE_BUILD_ROOT"
      ;;
  esac

  validate_docker_image_reference
  validate_image_tar_path
  case "${YUANCE_RELEASE_VERSION:-}" in
    *[!A-Za-z0-9._+-]*) fail "YUANCE_RELEASE_VERSION 含有不支持的字符。" ;;
  esac

  REMOTE_IMAGE_TAR="$REMOTE_RELEASE_DIR/$(basename "$IMAGE_TAR")"
}

validate_release_parameters

validate_local_wsl_target() {
  if ! grep -qi microsoft /proc/sys/kernel/osrelease 2>/dev/null; then
    fail "local-wsl 模式只能在 WSL 内执行。"
  fi
  if [ "$(command -v docker 2>/dev/null || true)" != "/usr/bin/docker" ]; then
    fail "local-wsl 模式必须使用 WSL 原生 /usr/bin/docker。"
  fi
  for command_name in docker timeout sha256sum install sqlite3; do
    if ! command -v "$command_name" >/dev/null 2>&1; then
      fail "WSL 缺少命令：$command_name"
    fi
  done
  if ! docker compose version >/dev/null 2>&1; then
    fail "WSL 缺少 Docker Compose 插件。"
  fi
  if [ ! -s "$LOCAL_BACKEND_DIR/.env" ]; then
    fail "WSL 缺少 $LOCAL_BACKEND_DIR/.env，拒绝部署。"
  fi
}

preflight_remote_target() {
  target_check="set -eu; for command_name in docker timeout sha256sum sqlite3; do command -v \"\$command_name\" >/dev/null 2>&1 || { echo \"服务器缺少命令：\$command_name\" >&2; exit 1; }; done; docker compose version >/dev/null 2>&1 || { echo '服务器缺少 Docker Compose 插件。' >&2; exit 1; }; test -s '$REMOTE_BACKEND_DIR/.env' || { echo '服务器缺少后端 .env，拒绝部署。' >&2; exit 1; }"
  if [ "$BUILD_MODE" = "remote" ]; then
    target_check="$target_check; for command_name in node npm tar; do command -v \"\$command_name\" >/dev/null 2>&1 || { echo \"服务器缺少构建命令：\$command_name\" >&2; exit 1; }; done; canonicalize_missing() { candidate=\"\$1\"; suffix=\"\"; while [ ! -d \"\$candidate\" ]; do if [ -L \"\$candidate\" ] || [ -e \"\$candidate\" ]; then return 1; fi; component=\"\${candidate##*/}\"; candidate=\"\${candidate%/*}\"; [ -n \"\$candidate\" ] || candidate=/; suffix=\"/\$component\$suffix\"; done; canonical=\$(CDPATH= cd -P \"\$candidate\" && pwd -P) || return 1; [ \"\$canonical\" != / ] || canonical=\"\"; printf '%s%s\\n' \"\$canonical\" \"\$suffix\"; }; backend_real=\$(CDPATH= cd -P '$REMOTE_BACKEND_DIR' && pwd -P) || { echo '无法解析后端运行目录。' >&2; exit 1; }; build_real=\$(canonicalize_missing '$REMOTE_BUILD_ROOT') || { echo '无法解析远程构建目录。' >&2; exit 1; }; case \"\$build_real\" in \"\$backend_real\"|\"\$backend_real\"/*) echo '构建目录真实路径落入后端运行目录。' >&2; exit 1 ;; esac; docker buildx version >/dev/null 2>&1; docker buildx inspect --bootstrap >/dev/null 2>&1 || { echo '服务器 Buildx builder 无法初始化。' >&2; exit 1; }"
  fi
  run ssh "$REMOTE_HOST" "$target_check"
}

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
  dirty="$(git -C "$ROOT_DIR" status --porcelain --untracked-files=all)"
  if [ -n "$dirty" ]; then
    if [ "${YUANCE_ALLOW_DIRTY_LOCAL_CONFIG:-0}" != "1" ]; then
      echo "正式环境部署前工作区必须干净，请先提交或还原本地改动。" >&2
      exit 1
    fi
    unexpected_dirty="$(printf '%s\n' "$dirty" | awk 'length($0) > 0 && substr($0, 4) != ".compound-engineering/config.yaml"')"
    if [ -n "$unexpected_dirty" ]; then
      echo "仅允许保留未提交的 .compound-engineering/config.yaml，发现其他本地改动：" >&2
      printf '%s\n' "$unexpected_dirty" >&2
      exit 1
    fi
    echo "已按显式开关保留本地配置改动，不会将其纳入发布源码。" >&2
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

if [ "$DEPLOY_MODE" = "local-wsl" ]; then
  validate_local_wsl_target
fi

require_clean_main

SOURCE_COMMIT="$(git -C "$ROOT_DIR" rev-parse HEAD)"

if [ "$DEPLOY_MODE" = "remote" ]; then
  preflight_remote_target
fi

if [ "$DEPLOY_MODE" = "remote" ] && [ "$BUILD_MODE" = "remote" ]; then
  SOURCE_ARCHIVE="$(mktemp "${TMPDIR:-/tmp}/yuance-source.XXXXXX")"
  trap 'rm -f "$SOURCE_ARCHIVE"' EXIT HUP INT TERM
  run git -C "$ROOT_DIR" archive --format=tar.gz --output="$SOURCE_ARCHIVE" HEAD
  REMOTE_BUILD_DIR="$REMOTE_BUILD_ROOT/$SOURCE_COMMIT"
  REMOTE_BUILD_TAR="$REMOTE_BUILD_DIR/dist/$(basename "$IMAGE_TAR")"
  run ssh "$REMOTE_HOST" "set -eu; mkdir -p '$REMOTE_BUILD_ROOT'; rm -rf '$REMOTE_BUILD_DIR.incoming'; mkdir -p '$REMOTE_BUILD_DIR.incoming'"
  run scp "$SOURCE_ARCHIVE" "$REMOTE_HOST:$REMOTE_BUILD_ROOT/source-$SOURCE_COMMIT.tar.gz"
  run ssh "$REMOTE_HOST" "set -eu; tar -xzf '$REMOTE_BUILD_ROOT/source-$SOURCE_COMMIT.tar.gz' -C '$REMOTE_BUILD_DIR.incoming'; printf '%s\\n' '$SOURCE_COMMIT' > '$REMOTE_BUILD_DIR.incoming/.yuance-source-commit'; rm -rf '$REMOTE_BUILD_DIR'; mv '$REMOTE_BUILD_DIR.incoming' '$REMOTE_BUILD_DIR'; rm -f '$REMOTE_BUILD_ROOT/source-$SOURCE_COMMIT.tar.gz'; cd '$REMOTE_BUILD_DIR'; test \"\$(cat .yuance-source-commit)\" = '$SOURCE_COMMIT'; npm --prefix frontend ci; npm --prefix web ci; ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm --prefix desktop ci; YUANCE_LOCAL_DOCKER=0 YUANCE_API_IMAGE='$IMAGE' YUANCE_API_IMAGE_TAR='$REMOTE_BUILD_TAR' YUANCE_RELEASE_VERSION='${YUANCE_RELEASE_VERSION:-}' sh scripts/build-api-image-amd64.sh; sha256sum '$REMOTE_BUILD_TAR'"
  rm -f "$SOURCE_ARCHIVE"
  trap - EXIT HUP INT TERM
else
  if [ "$SKIP_BUILD" != "1" ]; then
    run env YUANCE_LOCAL_DOCKER=0 "$ROOT_DIR/scripts/build-api-image-amd64.sh"
  fi
  if [ ! -f "$ROOT_DIR/$IMAGE_TAR" ]; then
    echo "缺少镜像 tar: $IMAGE_TAR" >&2
    exit 1
  fi
  LOCAL_SHA="$(local_sha256 "$ROOT_DIR/$IMAGE_TAR")"
  echo "本地镜像 tar: $IMAGE_TAR"
  echo "本地 SHA256: $LOCAL_SHA"
fi

if [ "$DEPLOY_MODE" = "local-wsl" ]; then
  run install -d -m 0750 "$LOCAL_BACKEND_DIR" "$LOCAL_BACKEND_DIR/backups" "$LOCAL_RELEASE_DIR"
  run install -m 0644 "$ROOT_DIR/deploy/easy-deploy/production/backend/app.yaml.example" "$LOCAL_BACKEND_DIR/app.yaml"
  run install -m 0644 "$ROOT_DIR/deploy/easy-deploy/production/backend/compose.yaml.example" "$LOCAL_BACKEND_DIR/compose.yaml"
  run install -d -m 0750 "$LOCAL_BACKEND_DIR/scripts"
  for script in "$ROOT_DIR"/deploy/easy-deploy/production/backend/scripts/*.sh; do
    run install -m 0750 "$script" "$LOCAL_BACKEND_DIR/scripts/$(basename "$script")"
  done
  chmod 600 "$LOCAL_BACKEND_DIR/.env"

  LOCAL_IMAGE_TAR="$LOCAL_RELEASE_DIR/$(basename "$IMAGE_TAR")"
  if [ -f "$LOCAL_IMAGE_TAR" ]; then
    stamp="$(date +%Y%m%d%H%M%S)"
    run cp "$LOCAL_IMAGE_TAR" "${LOCAL_IMAGE_TAR%.tar}.before-$stamp.tar"
  fi
  run cp "$ROOT_DIR/$IMAGE_TAR" "$LOCAL_IMAGE_TAR"
  WSL_SHA="$(sha256sum "$LOCAL_IMAGE_TAR" | awk '{print $1}')"
  if [ "$LOCAL_SHA" != "$WSL_SHA" ]; then
    echo "WSL 镜像 tar SHA256 不一致：$WSL_SHA" >&2
    exit 1
  fi

  cd "$LOCAL_BACKEND_DIR"
  run timeout -k 30s 300s docker load -i "$LOCAL_IMAGE_TAR"
  run timeout -k 30s 300s ./scripts/00-backup-sqlite.sh
  maintenance="yuance-api-maintenance-$(date +%Y%m%d%H%M%S)"
  trap 'docker rm -f "$maintenance" >/dev/null 2>&1 || true' EXIT HUP INT TERM
  run timeout -k 30s 900s docker compose --env-file .env -f compose.yaml run --rm --no-deps --name "$maintenance" api sh -eu -c '
    ./yuance-api migrate status
    ./yuance-api migrate up
    ./yuance-api seed core
  '
  docker rm -f "$maintenance" >/dev/null 2>&1 || true
  trap - EXIT HUP INT TERM
  run timeout -k 30s 300s docker compose --env-file .env -f compose.yaml up -d --force-recreate --remove-orphans api
  run timeout -k 30s 120s ./scripts/90-healthcheck.sh
  run timeout -k 30s 120s ./scripts/80-files-audit.sh

  latest="$(docker image inspect "$IMAGE" --format '{{.Id}}')"
  running="$(docker inspect yuance-api --format '{{.Image}}')"
  if [ "$latest" != "$running" ]; then
    echo "运行容器镜像不是最新镜像：latest=$latest running=$running" >&2
    exit 1
  fi

  image_file="$(basename "$LOCAL_IMAGE_TAR")"
  image_backup_prefix="${image_file%.tar}.before-"
  old_backups="$(
    cd "$LOCAL_RELEASE_DIR"
    # 文件名由本脚本固定生成，按 mtime 保留最近的回滚制品。
    # shellcheck disable=SC2012
    ls -1t "$image_backup_prefix"*.tar 2>/dev/null | tail -n "+$((KEEP_RELEASE_BACKUPS + 1))" || true
  )"
  if [ -n "$old_backups" ]; then
    echo "$old_backups" | while IFS= read -r file; do
      rm -f "$LOCAL_RELEASE_DIR/$file"
    done
  fi
  if [ "$PRUNE_DANGLING_IMAGES" = "1" ]; then
    run timeout -k 30s 300s docker image prune -f
  fi
  echo "正式环境部署完成：WSL $LOCAL_BACKEND_DIR"
  exit 0
fi

run ssh "$REMOTE_HOST" "set -eu; mkdir -p '$REMOTE_RELEASE_DIR' '$REMOTE_BACKEND_DIR' '$REMOTE_GATEWAY_DIR'; if [ -f '$REMOTE_IMAGE_TAR' ]; then ts=\$(date +%Y%m%d%H%M%S); backup='${REMOTE_IMAGE_TAR%.tar}.before-'\$ts'.tar'; cp '$REMOTE_IMAGE_TAR' \"\$backup\"; echo \"已备份当前镜像 tar: \$(basename \"\$backup\")\"; fi"

if [ "$BUILD_MODE" = "remote" ]; then
  REMOTE_SHA="$(ssh "$REMOTE_HOST" "sha256sum '$REMOTE_BUILD_TAR' | awk '{print \$1}'")"
  run ssh "$REMOTE_HOST" "set -eu; cp '$REMOTE_BUILD_TAR' '$REMOTE_IMAGE_TAR'"
  echo "qfy-test2 构建产物 SHA256: $REMOTE_SHA"
else
  run scp "$ROOT_DIR/$IMAGE_TAR" "$REMOTE_HOST:$REMOTE_IMAGE_TAR"
fi
run scp "$ROOT_DIR/deploy/easy-deploy/production/backend/app.yaml.example" "$REMOTE_HOST:$REMOTE_BACKEND_DIR/app.yaml"
run scp "$ROOT_DIR/deploy/easy-deploy/production/backend/compose.yaml.example" "$REMOTE_HOST:$REMOTE_BACKEND_DIR/compose.yaml"
run scp "$ROOT_DIR/deploy/easy-deploy/production/backend/.env.example" "$REMOTE_HOST:$REMOTE_BACKEND_DIR/.env.example"
run scp -r "$ROOT_DIR/deploy/easy-deploy/production/backend/scripts" "$REMOTE_HOST:$REMOTE_BACKEND_DIR/"
run scp "$ROOT_DIR/deploy/easy-deploy/production/gateway/Caddyfile.yuance.example" "$REMOTE_HOST:$REMOTE_GATEWAY_DIR/Caddyfile.yuance"

REMOTE_SHA="$(ssh "$REMOTE_HOST" "sha256sum '$REMOTE_IMAGE_TAR' | awk '{print \$1}'")"
if [ "$BUILD_MODE" = "remote" ]; then
  if [ "$REMOTE_SHA" != "$(ssh "$REMOTE_HOST" "sha256sum '$REMOTE_BUILD_TAR' | awk '{print \$1}'")" ]; then
    echo "qfy-test2 编译产物复制到 releases 后 SHA256 不一致：$REMOTE_SHA" >&2
    exit 1
  fi
elif [ "$LOCAL_SHA" != "$REMOTE_SHA" ]; then
  echo "远程镜像 tar SHA256 不一致：$REMOTE_SHA" >&2
  exit 1
fi
echo "远程 SHA256 校验通过。"

run ssh "$REMOTE_HOST" \
  "YUANCE_IMAGE='$IMAGE' YUANCE_REMOTE_IMAGE_TAR='$REMOTE_IMAGE_TAR' YUANCE_BACKEND_DIR='$REMOTE_BACKEND_DIR' YUANCE_KEEP_RELEASE_BACKUPS='$KEEP_RELEASE_BACKUPS' YUANCE_PRUNE_DANGLING_IMAGES='$PRUNE_DANGLING_IMAGES' YUANCE_SSE_DRAIN_TIMEOUT='$SSE_DRAIN_TIMEOUT' YUANCE_STOP_GRACE_PERIOD='$STOP_GRACE_PERIOD' YUANCE_MAX_RELEASE_WINDOW='$MAX_RELEASE_WINDOW' YUANCE_BUILD_MODE='$BUILD_MODE' YUANCE_REMOTE_BUILD_DIR='$REMOTE_BUILD_DIR' sh -s" <<'REMOTE_SCRIPT'
set -eu

IMAGE="${YUANCE_IMAGE:-yuance-api:latest}"
IMAGE_TAR="${YUANCE_REMOTE_IMAGE_TAR:?set YUANCE_REMOTE_IMAGE_TAR}"
BACKEND_DIR="${YUANCE_BACKEND_DIR:?set YUANCE_BACKEND_DIR}"
KEEP_RELEASE_BACKUPS="${YUANCE_KEEP_RELEASE_BACKUPS:-1}"
PRUNE_DANGLING_IMAGES="${YUANCE_PRUNE_DANGLING_IMAGES:-0}"
SSE_DRAIN_TIMEOUT="${YUANCE_SSE_DRAIN_TIMEOUT:-30s}"
STOP_GRACE_PERIOD="${YUANCE_STOP_GRACE_PERIOD:-45s}"
MAX_RELEASE_WINDOW="${YUANCE_MAX_RELEASE_WINDOW:-10m}"

cd "$BACKEND_DIR"

for command_name in docker timeout sha256sum sqlite3; do
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
  duration="$2"
  shift 2
  echo "==> $label"
  timeout -k 30s "$duration" "$@"
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

printf '发布约束: sse_drain_timeout=%s stop_grace_period=%s max_release_window=%s\n' \
  "$SSE_DRAIN_TIMEOUT" "$STOP_GRACE_PERIOD" "$MAX_RELEASE_WINDOW"

run_timeout "加载镜像 tar" 300 docker load -i "$IMAGE_TAR"

run_timeout "SQLite 发布前备份" 300 ./scripts/00-backup-sqlite.sh

stamp="$(date +%Y%m%d%H%M%S)"
run_compose_maintenance "yuance-api-maintenance-$stamp"

run_timeout "重建并启动 api 容器" 300 docker compose --env-file .env -f compose.yaml up -d --force-recreate --remove-orphans api
run_timeout "Compose 状态" 60 docker compose --env-file .env -f compose.yaml ps
run_timeout "健康检查" "$MAX_RELEASE_WINDOW" ./scripts/90-healthcheck.sh

latest="$(docker image inspect "$IMAGE" --format '{{.Id}}')"
running="$(docker inspect yuance-api --format '{{.Image}}')"
if [ "$latest" != "$running" ]; then
  echo "运行容器镜像不是最新镜像：latest=$latest running=$running" >&2
  exit 1
fi

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
if [ "${YUANCE_BUILD_MODE:-local}" = "remote" ]; then
  rm -rf "${YUANCE_REMOTE_BUILD_DIR:?}"
fi
REMOTE_SCRIPT

echo "正式环境部署完成：$REMOTE_HOST"
