#!/usr/bin/env sh
set -eu

env_file="${1:?用法：validate-production-database.sh <env-file>}"

fail() {
  echo "$1" >&2
  exit 1
}

read_env_value() {
  target="$1"
  awk -v target="$target" '
  {
    line = $0
    sub(/\r$/, "", line)
    sub(/^[[:space:]]+/, "", line)
    sub(/^[[:space:]]*export[[:space:]]+/, "", line)
    sub(/^[[:space:]]+/, "", line)
    if (line ~ /^#/ || line ~ /^$/) next
    delimiter = index(line, "=")
    colon_delimiter = index(line, ":")
    if (!delimiter || (colon_delimiter && colon_delimiter < delimiter)) delimiter = colon_delimiter
    if (!delimiter) next
    name = substr(line, 1, delimiter - 1)
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", name)
    if (name != target) next
    value = substr(line, delimiter + 1)
    sub(/^[[:space:]]*/, "", value)
    quote = substr(value, 1, 1)
    if (quote == "\047" || quote == "\"") {
      rest = substr(value, 2)
      closing = index(rest, quote)
      if (!closing) { invalid = 1; next }
      trailing = substr(rest, closing + 1)
      if (trailing !~ /^[[:space:]]*(#.*)?$/) { invalid = 1; next }
      value = substr(rest, 1, closing - 1)
    } else {
      sub(/[[:space:]]+#.*$/, "", value)
    }
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
    if (value ~ /[\\$]/ || found) { invalid = 1; next }
    configured = value
    found = 1
  }
  END { if (invalid) exit 2; if (found) print configured }
' "$env_file"
}

database_url="$(read_env_value YUANCE_DATABASE_URL)" || fail "无法安全解析 $env_file 中的 YUANCE_DATABASE_URL。"
data_dir="$(read_env_value YUANCE_DATA_DIR)" || fail "无法安全解析 $env_file 中的 YUANCE_DATA_DIR。"

case "$database_url" in
  ""|sqlite:///data/yuance.sqlite3) ;;
  *) fail "正式部署仅支持 sqlite:///data/yuance.sqlite3；请先统一 Compose 迁移目标与数据目录。" ;;
esac

case "$data_dir" in
  ""|/data) ;;
  *) fail "正式部署仅支持 YUANCE_DATA_DIR=/data；请先统一 Compose 数据目录与数据库路径。" ;;
esac

case "${YUANCE_DATA_DIR:-}" in
  ""|/data) ;;
  *) fail "发布进程的 YUANCE_DATA_DIR 必须为空或 /data。" ;;
esac
