#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALLER="$ROOT_DIR/scripts/install-codex-skill.sh"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/yuance-agent-installer-test.XXXXXX")"
RELEASE_DIR="$TEMP_DIR/release fixture"
INSTALL_DIR="$TEMP_DIR/install root/yuance-agent"
TOKEN_SENTINEL="yuance_pat_must_not_be_printed"
LEGACY_CODEX_HOME="$TEMP_DIR/legacy codex"

cleanup() {
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT
trap 'exit 130' HUP INT TERM

fail() {
  printf '测试失败：%s\n' "$1" >&2
  exit 1
}

assert_eq() {
  [[ "$1" == "$2" ]] || fail "期望 '$2'，实际 '$1'"
}

sha256_file() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    sha256sum "$1" | awk '{print $1}'
  fi
}

actual_target() {
  "$INSTALLER" --detect-only
}

create_release() {
  local version="$1"
  local marker="$2"
  local mode="${3:-ok}"
  local target asset build package binary
  target="$(actual_target)"
  asset="yuance-agent-v${version}-${target}.tar.gz"
  build="$TEMP_DIR/build-$version-$marker-$mode"
  package="$build/yuance-agent"
  binary="$package/scripts/yuance-agent"
  rm -rf "$build" "$RELEASE_DIR"
  mkdir -p "$package/agents" "$package/references" "$package/scripts" "$RELEASE_DIR"
  cp "$ROOT_DIR/skills/yuance-agent/SKILL.md" "$package/SKILL.md"
  cp "$ROOT_DIR/skills/yuance-agent/agents/openai.yaml" "$package/agents/openai.yaml"
  cp "$ROOT_DIR/skills/yuance-agent/references/"*.md "$package/references/"
  printf '%s\n' "$marker" >"$package/fixture-marker.txt"
  if [[ "$mode" != "missing-binary" ]]; then
    cat >"$binary" <<EOF
#!/usr/bin/env bash
if [[ "\${1:-}" == "doctor" && "\${2:-}" == "--installation" ]]; then
  printf '{"data":{"status":"installed","version":"$version"}}\\n'
  exit $([[ "$mode" == "self-check-fails" ]] && printf 7 || printf 0)
fi
exit 2
EOF
    chmod +x "$binary"
  fi
  tar -czf "$RELEASE_DIR/$asset" -C "$build" yuance-agent
  printf '%s  %s\n' "$(sha256_file "$RELEASE_DIR/$asset")" "$asset" >"$RELEASE_DIR/SHA256SUMS"
}

for mapping in \
  "Darwin x86_64 x86_64-apple-darwin" \
  "Darwin arm64 aarch64-apple-darwin" \
  "Linux x86_64 x86_64-unknown-linux-musl" \
  "Linux aarch64 aarch64-unknown-linux-musl"; do
  read -r test_os test_arch expected <<<"$mapping"
  detected="$(YUANCE_AGENT_TEST_OS="$test_os" YUANCE_AGENT_TEST_ARCH="$test_arch" "$INSTALLER" --detect-only)"
  assert_eq "$detected" "$expected"
done

create_release "0.1.0" "initial"
mkdir -p "$LEGACY_CODEX_HOME"
printf '[mcp_servers.yuance]\ncommand = "node"\n\n[mcp_servers.other]\ncommand = "other"\n' >"$LEGACY_CODEX_HOME/config.toml"
output="$(CODEX_HOME="$LEGACY_CODEX_HOME" YUANCE_API_TOKEN="$TOKEN_SENTINEL" "$INSTALLER" --release-dir "$RELEASE_DIR" --install-dir "$INSTALL_DIR" 2>&1)"
[[ -f "$INSTALL_DIR/SKILL.md" ]] || fail "首次安装缺少 SKILL.md"
[[ -x "$INSTALL_DIR/scripts/yuance-agent" ]] || fail "首次安装缺少可执行 CLI"
assert_eq "$(cat "$INSTALL_DIR/fixture-marker.txt")" "initial"
[[ "$output" != *"$TOKEN_SENTINEL"* ]] || fail "安装输出泄露 Token"
[[ "$output" == *"YUANCE_API_TOKEN"* ]] || fail "安装输出缺少后续配置说明"
[[ "$output" == *"检测到旧版元策接入"* ]] || fail "安装输出缺少旧版迁移提示"
grep -q '^\[mcp_servers.other\]' "$LEGACY_CODEX_HOME/config.toml" || fail "安装器修改了其他旧配置"

create_release "0.1.1" "upgraded"
YUANCE_AGENT_VERSION="0.1.1" YUANCE_AGENT_RELEASE_DIR="$RELEASE_DIR" \
  YUANCE_AGENT_INSTALL_DIR="$INSTALL_DIR" "$INSTALLER" >/dev/null 2>&1
assert_eq "$(cat "$INSTALL_DIR/fixture-marker.txt")" "upgraded"

create_release "0.1.1" "checksum-failure"
printf 'tampered' >>"$RELEASE_DIR/yuance-agent-v0.1.1-$(actual_target).tar.gz"
if "$INSTALLER" --version 0.1.1 --release-dir "$RELEASE_DIR" --install-dir "$INSTALL_DIR" >/dev/null 2>&1; then
  fail "校验和错误时安装器意外成功"
fi
assert_eq "$(cat "$INSTALL_DIR/fixture-marker.txt")" "upgraded"

create_release "0.1.1" "missing" "missing-binary"
if "$INSTALLER" --version 0.1.1 --release-dir "$RELEASE_DIR" --install-dir "$INSTALL_DIR" >/dev/null 2>&1; then
  fail "发布包缺文件时安装器意外成功"
fi
assert_eq "$(cat "$INSTALL_DIR/fixture-marker.txt")" "upgraded"

create_release "0.1.1" "self-check" "self-check-fails"
if "$INSTALLER" --version 0.1.1 --release-dir "$RELEASE_DIR" --install-dir "$INSTALL_DIR" >/dev/null 2>&1; then
  fail "离线自检失败时安装器意外成功"
fi
assert_eq "$(cat "$INSTALL_DIR/fixture-marker.txt")" "upgraded"

printf 'Bash 安装器测试通过。\n'
