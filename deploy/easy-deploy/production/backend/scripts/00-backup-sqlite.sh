#!/usr/bin/env sh
set -eu
umask 077

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
APP_DIR="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"

if [ -n "${YUANCE_SQLITE_PATH:-}" ]; then
  DB_BASE="$YUANCE_SQLITE_PATH"
elif [ "${YUANCE_BACKUP_REQUIRED:-0}" = "1" ]; then
  DB_BASE="$APP_DIR/data/yuance.sqlite3"
elif [ -d "/data" ] && [ ! -d "$APP_DIR/data" ]; then
  DB_BASE="/data/yuance.sqlite3"
else
  DB_BASE="$APP_DIR/data/yuance.sqlite3"
fi

if [ -n "${YUANCE_BACKUP_DIR:-}" ]; then
  BACKUP_ROOT="$YUANCE_BACKUP_DIR"
elif [ "$DB_BASE" = "/data/yuance.sqlite3" ]; then
  BACKUP_ROOT="/backups"
else
  BACKUP_ROOT="$APP_DIR/backups"
fi

if [ -n "${YUANCE_BACKUP_DATA_DIR:-}" ]; then
  DATA_DIR="$YUANCE_BACKUP_DATA_DIR"
elif [ "$DB_BASE" = "/data/yuance.sqlite3" ]; then
  DATA_DIR="/data"
else
  DATA_DIR="$APP_DIR/data"
fi
CONFIG_FILE="${YUANCE_BACKUP_ENV_FILE:-$APP_DIR/.env}"

fail() {
  echo "$1" >&2
  exit 1
}

if [ ! -f "$DB_BASE" ]; then
  if [ "${YUANCE_BACKUP_REQUIRED:-0}" = "1" ]; then
    fail "未发现要求备份的 SQLite 数据库：$DB_BASE"
  fi
  echo "未发现 SQLite 数据库 ${DB_BASE}，首次部署跳过备份。"
  exit 0
fi

if [ "${YUANCE_BACKUP_REQUIRED:-0}" = "1" ]; then
  sh "$SCRIPT_DIR/validate-production-database.sh" "$CONFIG_FILE"
  case "$DB_BASE" in
    "$APP_DIR/data/yuance.sqlite3") ;;
    *) fail "正式部署快照路径必须对应 Compose 的 /data/yuance.sqlite3：$DB_BASE" ;;
  esac
fi

if [ -L "$DB_BASE" ]; then
  fail "拒绝备份符号链接 SQLite 数据库：$DB_BASE"
fi
case "$BACKUP_ROOT" in
  /*) ;;
  *) fail "备份目录必须是绝对路径：$BACKUP_ROOT" ;;
esac
case "$BACKUP_ROOT" in
  /|/tmp|/tmp/*|/var/tmp|/var/tmp/*)
    fail "拒绝使用系统根目录或临时目录作为备份根目录：$BACKUP_ROOT"
    ;;
  *//*|*/../*|*/./*|*/..|*/.)
    fail "备份目录不得包含重复斜杠或 .、.. 路径段：$BACKUP_ROOT"
    ;;
esac
backup_path_cursor="${BACKUP_ROOT#/}"
backup_path_current=""
while [ -n "$backup_path_cursor" ]; do
  case "$backup_path_cursor" in
    */*)
      backup_path_component="${backup_path_cursor%%/*}"
      backup_path_cursor="${backup_path_cursor#*/}"
      ;;
    *)
      backup_path_component="$backup_path_cursor"
      backup_path_cursor=""
      ;;
  esac
  backup_path_current="$backup_path_current/$backup_path_component"
  if [ -L "$backup_path_current" ]; then
    fail "拒绝通过符号链接路径使用备份目录：$backup_path_current"
  fi
done

canonicalize_missing_path() {
  candidate="$1"
  suffix=""
  while [ ! -d "$candidate" ]; do
    if [ -L "$candidate" ] || [ -e "$candidate" ]; then
      return 1
    fi
    component="${candidate##*/}"
    candidate="${candidate%/*}"
    [ -n "$candidate" ] || candidate="/"
    suffix="/$component$suffix"
  done
  canonical="$(CDPATH= cd -P -- "$candidate" && pwd -P)" || return 1
  [ "$canonical" != "/" ] || canonical=""
  printf '%s%s\n' "$canonical" "$suffix"
}

BACKUP_REAL_ROOT="$(canonicalize_missing_path "$BACKUP_ROOT")" || fail "无法解析备份目录的物理路径：$BACKUP_ROOT"
for temporary_root in /tmp /var/tmp; do
  if [ -d "$temporary_root" ]; then
    TEMPORARY_REAL_ROOT="$(CDPATH= cd -P -- "$temporary_root" && pwd -P)"
    case "$BACKUP_REAL_ROOT" in
      "$TEMPORARY_REAL_ROOT"|"$TEMPORARY_REAL_ROOT"/*)
        fail "拒绝使用系统根目录或临时目录作为备份根目录：$BACKUP_ROOT"
        ;;
    esac
  fi
done

if [ -d "$DATA_DIR" ]; then
  DATA_REAL_DIR="$(CDPATH= cd -P -- "$DATA_DIR" && pwd)"
else
  DATA_REAL_DIR="$DATA_DIR"
fi
case "$BACKUP_REAL_ROOT" in
  "$DATA_REAL_DIR"|"$DATA_REAL_DIR"/*)
    fail "备份目录不得位于应用数据目录内：$BACKUP_ROOT"
    ;;
esac
if [ -d "$DATA_REAL_DIR" ]; then
  backup_path_cursor="$BACKUP_REAL_ROOT"
  while [ "$backup_path_cursor" != "/" ]; do
    if [ -d "$backup_path_cursor" ] && [ "$backup_path_cursor" -ef "$DATA_REAL_DIR" ]; then
      fail "备份目录不得位于应用数据目录内：$BACKUP_ROOT"
    fi
    backup_path_cursor="${backup_path_cursor%/*}"
    [ -n "$backup_path_cursor" ] || backup_path_cursor="/"
  done
fi
if ! command -v sqlite3 >/dev/null 2>&1; then
  fail "目标机缺少 sqlite3，无法生成一致性数据库快照。"
fi

file_master_key_source() {
  if [ "${YUANCE_FILE_MASTER_KEY+x}" = "x" ]; then
    configured="$(printf '%s' "$YUANCE_FILE_MASTER_KEY" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    if [ -n "$configured" ]; then
      configured_length="$(LC_ALL=C printf '%s' "$configured" | wc -c | tr -d '[:space:]')"
      if [ "$configured_length" -lt 16 ]; then
        printf '%s\n' invalid
        return 0
      fi
      printf '%s\n' environment
    else
      printf '%s\n' data-file
    fi
    return 0
  fi

  if [ ! -f "$CONFIG_FILE" ]; then
    printf '%s\n' data-file
    return 0
  fi

  LC_ALL=C awk '
    /^[[:space:]]*#/ { next }
    {
      line = $0
      sub(/\r$/, "", line)
      sub(/^[[:space:]]*export[[:space:]]+/, "", line)
      delimiter = index(line, "=")
      colon_delimiter = index(line, ":")
      if (!delimiter || (colon_delimiter && colon_delimiter < delimiter)) delimiter = colon_delimiter
      if (!delimiter) next
      name = substr(line, 1, delimiter - 1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", name)
      if (name != "YUANCE_FILE_MASTER_KEY") next

      value = substr(line, delimiter + 1)
      sub(/^[[:space:]]*/, "", value)
      sub(/[[:space:]]*$/, "", value)
      quote = substr(value, 1, 1)
      if (quote == "\047" || quote == "\"") {
        rest = substr(value, 2)
        closing = index(rest, quote)
        if (!closing || rest ~ /\\/) {
          state = "unsupported"
          next
        }
        trailing = substr(rest, closing + 1)
        if (trailing !~ /^[[:space:]]*(#.*)?$/) {
          state = "unsupported"
          next
        }
        value = substr(rest, 1, closing - 1)
        if (quote == "\"" && value ~ /[$]/) {
          state = "unsupported"
          next
        }
      } else {
        sub(/[[:space:]]+#.*$/, "", value)
        if (value ~ /[$]/) {
          state = "unsupported"
          next
        }
      }
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
      if (value == "") {
        state = "data-file"
      } else if (length(value) < 16) {
        state = "invalid"
      } else {
        state = "environment"
      }
    }
    END { print (state == "" ? "data-file" : state) }
  ' "$CONFIG_FILE"
}

STAMP="$(date -u +%Y%m%d%H%M%S)"
if [ ! -d "$BACKUP_ROOT" ]; then
  mkdir -p "$(dirname "$BACKUP_ROOT")"
  if ! mkdir "$BACKUP_ROOT" 2>/dev/null && [ ! -d "$BACKUP_ROOT" ]; then
    fail "无法创建备份目录：$BACKUP_ROOT"
  fi
fi
DEST="$(mktemp -d "$BACKUP_ROOT/$STAMP.XXXXXX")"
SNAPSHOT="$DEST/yuance.sqlite3"
COMPLETE=0

cleanup() {
  if [ "$COMPLETE" != "1" ]; then
    rm -rf "$DEST"
  fi
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

case "$SNAPSHOT" in
  *"\""*|*"\\"*) fail "备份路径包含 SQLite CLI 不支持的引号或反斜杠字符。" ;;
esac

if ! sqlite3 "$DB_BASE" ".backup \"$SNAPSHOT\""; then
  fail "SQLite 在线快照创建失败。"
fi
chmod 600 "$SNAPSHOT"

INTEGRITY="$(sqlite3 "$SNAPSHOT" 'PRAGMA integrity_check;')"
if [ "$INTEGRITY" != "ok" ]; then
  fail "SQLite 快照完整性校验失败：$INTEGRITY"
fi

KEY_SOURCE="$(file_master_key_source)"
if [ "$KEY_SOURCE" = "unsupported" ]; then
  fail "无法安全解析 $CONFIG_FILE 中的 YUANCE_FILE_MASTER_KEY 插值或转义；请改用受控环境变量或字面量配置。"
fi
if [ "$KEY_SOURCE" = "invalid" ]; then
  fail "YUANCE_FILE_MASTER_KEY 长度无效；请从受控配置确认密钥至少包含 16 字节。"
fi
if [ "$KEY_SOURCE" = "data-file" ]; then
  KEY_FILE="$DATA_DIR/secrets/file_master_key"
  if [ ! -f "$KEY_FILE" ] || [ -L "$KEY_FILE" ]; then
    fail "未配置 YUANCE_FILE_MASTER_KEY，且文件主密钥缺失或无效：$KEY_FILE"
  fi
  if ! awk '
    {
      value = $0
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
      if (length(value) >= 16) valid = 1
    }
    END { exit (valid ? 0 : 1) }
  ' "$KEY_FILE"; then
    fail "文件主密钥内容无效：$KEY_FILE"
  fi
  mkdir -p "$DEST/secrets"
  chmod 700 "$DEST/secrets"
  cp "$KEY_FILE" "$DEST/secrets/file_master_key"
  chmod 600 "$DEST/secrets/file_master_key"
fi

CREATED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
{
  printf 'format=yuance-sqlite-backup-v1\n'
  printf 'created_at_utc=%s\n' "$CREATED_AT"
  printf 'database_snapshot=yuance.sqlite3\n'
  printf 'sqlite_integrity_check=ok\n'
  printf 'file_master_key_source=%s\n' "$KEY_SOURCE"
  if [ "$KEY_SOURCE" = "data-file" ]; then
    printf 'file_master_key_backup=secrets/file_master_key\n'
  else
    printf 'file_master_key_backup=external\n'
    printf 'required_external_configuration=YUANCE_FILE_MASTER_KEY\n'
  fi
} > "$DEST/manifest.txt"
chmod 600 "$DEST/manifest.txt"
chmod 700 "$DEST"

COMPLETE=1
trap - EXIT HUP INT TERM
echo "SQLite 一致性备份完成：$DEST"
