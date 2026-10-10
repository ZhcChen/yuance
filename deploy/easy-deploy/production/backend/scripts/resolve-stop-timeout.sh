#!/usr/bin/env sh
set -eu

env_file="${1:?用法：resolve-stop-timeout.sh <env-file> <explicit:0|1> <requested-duration>}"
explicit="${2:?用法：resolve-stop-timeout.sh <env-file> <explicit:0|1> <requested-duration>}"
requested="${3:?用法：resolve-stop-timeout.sh <env-file> <explicit:0|1> <requested-duration>}"

fail() {
  echo "$1" >&2
  exit 1
}

parse_env_duration() {
  awk '
    {
      line = $0
      sub(/\r$/, "", line)
      sub(/^[[:space:]]+/, "", line)
      sub(/^[[:space:]]*export[[:space:]]+/, "", line)
      if (line ~ /^[[:space:]]*#/ || line ~ /^[[:space:]]*$/) next
      delimiter = index(line, "=")
      if (!delimiter) delimiter = index(line, ":")
      if (!delimiter) next
      name = substr(line, 1, delimiter - 1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", name)
      if (name != "YUANCE_STOP_GRACE_PERIOD") next
      value = substr(line, delimiter + 1)
      sub(/^[[:space:]]*/, "", value)
      sub(/[[:space:]]+#.*$/, "", value)
      sub(/[[:space:]]*$/, "", value)
      quote = substr(value, 1, 1)
      if (quote == "\047" || quote == "\"") {
        if (length(value) < 2 || substr(value, length(value), 1) != quote) { invalid = 1; next }
        value = substr(value, 2, length(value) - 2)
        if (value ~ /[\\$]/) { invalid = 1; next }
      }
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
      if (found) { invalid = 1; next }
      if (value == "") { configured = ""; found = 1; next }
      if (value !~ /^[1-9][0-9]*[smh]$/) { invalid = 1; next }
      configured = value
      found = 1
    }
    END { if (invalid) exit 2; if (found) print configured }
  ' "$env_file"
}

case "$explicit" in
  0|1) ;;
  *) fail "YUANCE_STOP_GRACE_PERIOD_EXPLICIT 只支持 0 或 1。" ;;
esac

if [ "$explicit" = "1" ]; then
  grace="$requested"
else
  configured="$(parse_env_duration)" || fail "无法安全解析 $env_file 中的 YUANCE_STOP_GRACE_PERIOD。"
  grace="${configured:-45s}"
fi

case "$grace" in
  *s) amount="${grace%s}"; multiplier=1; maximum=86400 ;;
  *m) amount="${grace%m}"; multiplier=60; maximum=1440 ;;
  *h) amount="${grace%h}"; multiplier=3600; maximum=24 ;;
  *) fail "YUANCE_STOP_GRACE_PERIOD 必须使用正整数加 s、m 或 h，且不超过 24 小时：$grace" ;;
esac
case "$amount" in
  ''|0|0*|*[!0-9]*) fail "YUANCE_STOP_GRACE_PERIOD 必须使用规范的正整数时长：$grace" ;;
esac
if [ "${#amount}" -gt 5 ] || [ "$amount" -gt "$maximum" ]; then
  fail "YUANCE_STOP_GRACE_PERIOD 不得超过 24 小时：$grace"
fi

grace_seconds="$((amount * multiplier))"
printf '%s %ss\n' "$grace" "$((grace_seconds + 60))"
