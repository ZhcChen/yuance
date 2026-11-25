#!/usr/bin/env bash
# 异地备份恢复演练（体检 P0-3 / FR-012）。
#
# 在持有 age 私钥的机器上执行：私钥经 SSH 标准输入传到目标机内存盘（/dev/shm，0600），
# 演练结束即删除，不落盘。目标机上：下载最近一份异地备份 → 校验 SHA-256 → 解密解压到临时目录 →
# SQLite integrity_check → 临时容器执行 migrate status 与 files audit-objects（验证安全主密钥能解密
# 存储配置并访问业务 Bucket，只读）→ 检查文件主密钥存在 → 清理临时目录。
#
# 用法：
#   scripts/ops/restore-drill.sh --identity ~/yuance-offline-keys/yuance-backup-age.key [--host qfy-test2] [--archive <文件名>]
# 输出可直接贴入 docs/reviews/ 的演练记录。
set -euo pipefail

HOST="qfy-test2"
IDENTITY=""
ARCHIVE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --host) HOST="$2"; shift 2 ;;
    --identity) IDENTITY="$2"; shift 2 ;;
    --archive) ARCHIVE="$2"; shift 2 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "未知参数：$1" >&2; exit 2 ;;
  esac
done
[ -n "$IDENTITY" ] || { echo "必须通过 --identity 指定 age 私钥文件" >&2; exit 2; }
[ -r "$IDENTITY" ] || { echo "无法读取私钥文件：$IDENTITY" >&2; exit 2; }
case "$ARCHIVE" in ''|yuance-[0-9]*.tar.zst.age) ;; *) echo "归档名格式不正确：$ARCHIVE" >&2; exit 2 ;; esac

# shellcheck disable=SC2016
REMOTE_SCRIPT='
set -euo pipefail
ARCHIVE_NAME="$1"
KEY="$(mktemp /dev/shm/yuance-drill-key.XXXXXX)"
DRILL="$(mktemp -d /srv/yuance/restore-drill.XXXXXX)"
CONTAINER_ID=""
cleanup() {
  rm -f "$KEY"
  rm -rf "$DRILL"
}
trap cleanup EXIT
trap "exit 1" HUP INT TERM
chmod 600 "$KEY"
cat > "$KEY"
RCLONE="rclone --config /etc/yuance-backup/rclone.conf --s3-no-check-bucket"
REMOTE="yuance-backup:yuance-backup/daily"
if [ -z "$ARCHIVE_NAME" ]; then
  ARCHIVE_NAME="$($RCLONE lsf "$REMOTE/" | grep -E "^yuance-[0-9]{14}\..*\.tar\.zst\.age$" | sort | tail -n 1)"
fi
[ -n "$ARCHIVE_NAME" ] || { echo "异地没有可用备份" >&2; exit 1; }
echo "archive=$ARCHIVE_NAME"
$RCLONE copyto "$REMOTE/$ARCHIVE_NAME" "$DRILL/$ARCHIVE_NAME"
$RCLONE copyto "$REMOTE/$ARCHIVE_NAME.sha256" "$DRILL/$ARCHIVE_NAME.sha256"
if ! (cd "$DRILL" && sha256sum -c "$ARCHIVE_NAME.sha256" >/dev/null); then echo "sha256=mismatch" >&2; exit 1; fi
echo "sha256=ok"
mkdir -p "$DRILL/restore"
age -d -i "$KEY" "$DRILL/$ARCHIVE_NAME" | zstd -d -q | tar -x -C "$DRILL/restore"
rm -f "$KEY"
echo "decrypt=ok"
echo "manifest:"; sed "s/^/  /" "$DRILL/restore/manifest.txt"
INTEGRITY="$(sqlite3 "$DRILL/restore/yuance.sqlite3" "PRAGMA integrity_check;")"
echo "integrity_check=$INTEGRITY"
[ "$INTEGRITY" = "ok" ] || { echo "数据库完整性检查失败" >&2; exit 1; }
echo "counts=users:$(sqlite3 "$DRILL/restore/yuance.sqlite3" "SELECT COUNT(*) FROM users") projects:$(sqlite3 "$DRILL/restore/yuance.sqlite3" "SELECT COUNT(*) FROM projects") work_items:$(sqlite3 "$DRILL/restore/yuance.sqlite3" "SELECT COUNT(*) FROM work_items") file_objects:$(sqlite3 "$DRILL/restore/yuance.sqlite3" "SELECT COUNT(*) FROM file_objects")"
if [ -f "$DRILL/restore/secrets/file_master_key" ]; then
  echo "file_master_key=present($(wc -c < "$DRILL/restore/secrets/file_master_key" | tr -d " ") bytes)"
else
  grep -q "^file_master_key_backup=external" "$DRILL/restore/manifest.txt" && echo "file_master_key=external(.env)"
fi
[ -f "$DRILL/restore/env.backup" ] && grep -q "^YUANCE_SECURITY_MASTER_KEY=." "$DRILL/restore/env.backup" && echo "security_master_key=present(.env)"
IMAGE="$(docker inspect -f "{{.Config.Image}}" yuance-api 2>/dev/null || echo yuance-api:latest)"
DATA="$DRILL/restore"
mkdir -p "$DATA/secrets"
run_app() {
  docker run --rm --env-file "$DATA/env.backup" \
    -e YUANCE_DATABASE_URL=sqlite:///data/yuance.sqlite3 -e YUANCE_DATA_DIR=/data -e YUANCE_LOG_LEVEL=warn \
    -v "$DATA:/data" "$IMAGE" ./yuance-api "$@"
}
MIGRATE_OUTPUT="$(run_app migrate status 2>&1)" || { echo "$MIGRATE_OUTPUT" >&2; echo "migrate status 失败" >&2; exit 1; }
echo "migrate_status:"; printf "%s\n" "$MIGRATE_OUTPUT" | tail -n 3 | sed "s/^/  /"
AUDIT_OUTPUT="$(run_app files audit-objects 2>&1)" || { echo "$AUDIT_OUTPUT" >&2; echo "files audit-objects 失败" >&2; exit 1; }
echo "files_audit:"; printf "%s\n" "$AUDIT_OUTPUT" | tail -n 5 | sed "s/^/  /"
echo "drill=ok"
'

echo "# 恢复演练 $(date '+%Y-%m-%d %H:%M:%S %Z') host=$HOST"
ssh -o BatchMode=yes "$HOST" "bash -c $(printf '%q' "$REMOTE_SCRIPT") restore-drill $(printf '%q' "$ARCHIVE")" < "$IDENTITY"
