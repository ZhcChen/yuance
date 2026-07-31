#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tag="${1:-${RELEASE_TAG:-}}"
assets_dir="${2:-}"

fail() {
  printf 'Release 校验失败：%s\n' "$1" >&2
  exit 1
}

[[ "$tag" =~ ^yuance-agent-v([0-9]+\.[0-9]+\.[0-9]+)$ ]] || \
  fail "标签必须符合 yuance-agent-v<semver>，实际为 '${tag:-<empty>}'"
version="${BASH_REMATCH[1]}"

crate_version="$(awk '
  /^\[package\]$/ { in_package=1; next }
  /^\[/ { in_package=0 }
  in_package && /^version[[:space:]]*=/ {
    value=$0
    sub(/^[^=]*=[[:space:]]*"/, "", value)
    sub(/".*/, "", value)
    print value
    exit
  }
' "$ROOT_DIR/tools/yuance-agent-cli/Cargo.toml")"
bash_version="$(sed -n 's/^DEFAULT_VERSION="\([^"]*\)"$/\1/p' "$ROOT_DIR/scripts/install-codex-skill.sh")"
powershell_version="$(sed -n 's/^\$DefaultVersion = "\([^"]*\)"$/\1/p' "$ROOT_DIR/scripts/install-codex-skill.ps1")"

[[ "$crate_version" == "$version" ]] || fail "crate version 为 $crate_version，标签版本为 $version"
[[ "$bash_version" == "$version" ]] || fail "Bash 安装器默认版本为 $bash_version，标签版本为 $version"
[[ "$powershell_version" == "$version" ]] || fail "PowerShell 安装器默认版本为 $powershell_version，标签版本为 $version"

if [[ -z "$assets_dir" ]]; then
  printf '版本校验通过：yuance-agent v%s\n' "$version"
  exit 0
fi
[[ -d "$assets_dir" ]] || fail "资产目录不存在：$assets_dir"

targets=(
  x86_64-apple-darwin
  aarch64-apple-darwin
  x86_64-unknown-linux-musl
  aarch64-unknown-linux-musl
  x86_64-pc-windows-msvc
  aarch64-pc-windows-msvc
)

temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/yuance-agent-release-validate.XXXXXX")"
trap 'rm -rf "$temp_dir"' EXIT

for target in "${targets[@]}"; do
  if [[ "$target" == *windows* ]]; then
    extension="zip"
    binary_name="yuance-agent.exe"
  else
    extension="tar.gz"
    binary_name="yuance-agent"
  fi
  asset="yuance-agent-v${version}-${target}.${extension}"
  archive="$assets_dir/$asset"
  [[ -f "$archive" ]] || fail "缺少资产 $asset"

  extract_dir="$temp_dir/$target"
  mkdir -p "$extract_dir"
  if [[ "$extension" == "zip" ]]; then
    command -v unzip >/dev/null 2>&1 || fail "缺少 unzip，无法验证 Windows 资产"
    unzip -q "$archive" -d "$extract_dir"
  else
    tar -xzf "$archive" -C "$extract_dir"
  fi
  package="$extract_dir/yuance-agent"
  for required in \
    "$package/SKILL.md" \
    "$package/agents/openai.yaml" \
    "$package/references/commands.md" \
    "$package/references/workflows.md" \
    "$package/references/errors.md" \
    "$package/scripts/$binary_name"; do
    [[ -f "$required" ]] || fail "$asset 缺少 ${required#"$package/"}"
  done
  for relative in \
    SKILL.md \
    agents/openai.yaml \
    references/commands.md \
    references/workflows.md \
    references/errors.md; do
    cmp "$package/$relative" "$ROOT_DIR/skills/yuance-agent/$relative" >/dev/null || \
      fail "$asset 的 $relative 与标签源码不一致"
  done
  if [[ "$extension" == "tar.gz" ]]; then
    [[ -x "$package/scripts/$binary_name" ]] || fail "$asset 中的 CLI 不可执行"
  fi
done

asset_count="$(find "$assets_dir" -maxdepth 1 -type f \( -name "yuance-agent-v${version}-*.tar.gz" -o -name "yuance-agent-v${version}-*.zip" \) | wc -l | tr -d ' ')"
[[ "$asset_count" == "6" ]] || fail "正式压缩包必须恰好为 6 个，实际为 $asset_count"

printf '六平台 Release 资产校验通过：yuance-agent v%s\n' "$version"
