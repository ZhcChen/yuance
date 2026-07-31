#!/usr/bin/env bash
set -euo pipefail

DEFAULT_VERSION="0.1.0"
REPOSITORY="ZhcChen/yuance"

version="${YUANCE_AGENT_VERSION:-$DEFAULT_VERSION}"
install_dir="${YUANCE_AGENT_INSTALL_DIR:-}"
release_dir="${YUANCE_AGENT_RELEASE_DIR:-}"
detect_only=0

usage() {
  cat <<'EOF'
用法: install-codex-skill.sh [选项]

  --version <SEMVER>      安装指定版本，默认 0.1.0
  --install-dir <PATH>    覆盖 Skill 安装目录
  --release-dir <PATH>    从本地 Release fixture 安装（测试/开发通道）
  --detect-only           只输出当前平台对应的 Rust target
  --help                  显示帮助
EOF
}

fail() {
  printf '安装失败：%s\n' "$1" >&2
  exit 1
}

while (($# > 0)); do
  case "$1" in
    --version)
      (($# >= 2)) || fail "--version 缺少参数"
      version="$2"
      shift 2
      ;;
    --install-dir)
      (($# >= 2)) || fail "--install-dir 缺少参数"
      install_dir="$2"
      shift 2
      ;;
    --release-dir)
      (($# >= 2)) || fail "--release-dir 缺少参数"
      release_dir="$2"
      shift 2
      ;;
    --detect-only)
      detect_only=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *) fail "未知参数 $1" ;;
  esac
done

[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "版本必须是 MAJOR.MINOR.PATCH"

os="${YUANCE_AGENT_TEST_OS:-$(uname -s)}"
arch="${YUANCE_AGENT_TEST_ARCH:-$(uname -m)}"
case "$os" in
  Darwin) os_target="apple-darwin" ;;
  Linux) os_target="unknown-linux-musl" ;;
  *) fail "不支持的操作系统：$os" ;;
esac
case "$arch" in
  x86_64|amd64|AMD64) arch_target="x86_64" ;;
  arm64|aarch64|ARM64) arch_target="aarch64" ;;
  *) fail "不支持的 CPU 架构：$arch" ;;
esac
target="${arch_target}-${os_target}"

if ((detect_only == 1)); then
  printf '%s\n' "$target"
  exit 0
fi

for command_name in curl tar; do
  command -v "$command_name" >/dev/null 2>&1 || fail "缺少命令：$command_name"
done

if [[ -z "$install_dir" ]]; then
  if [[ -n "${CODEX_HOME:-}" ]]; then
    install_dir="$CODEX_HOME/skills/yuance-agent"
  else
    install_dir="$HOME/.agents/skills/yuance-agent"
  fi
fi
[[ "$install_dir" != "/" ]] || fail "安装目录不能是根目录"
[[ ! -L "$install_dir" ]] || fail "安装目录不能是符号链接"
if [[ -e "$install_dir" && ! -d "$install_dir" ]]; then
  fail "安装路径已存在且不是目录：$install_dir"
fi

asset="yuance-agent-v${version}-${target}.tar.gz"
tag="yuance-agent-v${version}"
download_base="https://github.com/${REPOSITORY}/releases/download/${tag}"
temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/yuance-agent-install.XXXXXX")"
staging_dir=""
backup_dir=""

cleanup() {
  if [[ -n "$backup_dir" && -d "$backup_dir" && ! -e "$install_dir" ]]; then
    mv "$backup_dir" "$install_dir" || true
  fi
  rm -rf "$temp_dir"
  [[ -z "$staging_dir" ]] || rm -rf "$staging_dir"
}
trap cleanup EXIT
trap 'exit 130' HUP INT TERM

archive="$temp_dir/$asset"
checksums="$temp_dir/SHA256SUMS"
if [[ -n "$release_dir" ]]; then
  printf '警告：正在使用本地测试/开发 Release：%s\n' "$release_dir" >&2
  cp "$release_dir/$asset" "$archive" || fail "本地 Release 缺少 $asset"
  cp "$release_dir/SHA256SUMS" "$checksums" || fail "本地 Release 缺少 SHA256SUMS"
else
  curl --fail --location --silent --show-error "$download_base/$asset" --output "$archive"
  curl --fail --location --silent --show-error "$download_base/SHA256SUMS" --output "$checksums"
fi

expected_sha="$(awk -v asset="$asset" '$2 == asset || $2 == "*" asset { print tolower($1) }' "$checksums")"
[[ "$expected_sha" =~ ^[0-9a-f]{64}$ ]] || fail "SHA256SUMS 中缺少 $asset 的有效校验和"
if command -v shasum >/dev/null 2>&1; then
  actual_sha="$(shasum -a 256 "$archive" | awk '{print tolower($1)}')"
elif command -v sha256sum >/dev/null 2>&1; then
  actual_sha="$(sha256sum "$archive" | awk '{print tolower($1)}')"
else
  fail "缺少 shasum 或 sha256sum，无法校验下载资产"
fi
[[ "$actual_sha" == "$expected_sha" ]] || fail "$asset 的 SHA-256 校验失败"

extract_dir="$temp_dir/extracted"
mkdir -p "$extract_dir"
tar -xzf "$archive" -C "$extract_dir"
package_dir="$extract_dir/yuance-agent"
binary="$package_dir/scripts/yuance-agent"
for required in \
  "$package_dir/SKILL.md" \
  "$package_dir/agents/openai.yaml" \
  "$package_dir/references/commands.md" \
  "$package_dir/references/workflows.md" \
  "$package_dir/references/errors.md" \
  "$binary"; do
  [[ -f "$required" ]] || fail "发布包缺少 ${required#"$package_dir/"}"
done
chmod +x "$binary"
"$binary" doctor --installation >/dev/null || fail "发布包离线自检失败"

install_parent="$(dirname "$install_dir")"
mkdir -p "$install_parent"
staging_dir="${install_dir}.new.$$"
backup_dir="${install_dir}.backup.$$"
[[ ! -e "$staging_dir" && ! -e "$backup_dir" ]] || fail "安装临时路径已存在，请稍后重试"
cp -R "$package_dir" "$staging_dir"

had_previous=0
if [[ -d "$install_dir" ]]; then
  mv "$install_dir" "$backup_dir"
  had_previous=1
fi
if ! mv "$staging_dir" "$install_dir"; then
  if ((had_previous == 1)); then
    mv "$backup_dir" "$install_dir" || true
  fi
  fail "替换安装目录失败，旧版本已恢复"
fi
staging_dir=""
if ((had_previous == 1)); then
  rm -rf "$backup_dir"
fi
backup_dir=""

printf '已安装 yuance-agent v%s 到 %s\n' "$version" "$install_dir"
printf '后续请在运行 Codex 的环境中配置 YUANCE_API_TOKEN；需要自定义服务时再配置 YUANCE_BASE_URL。\n'
