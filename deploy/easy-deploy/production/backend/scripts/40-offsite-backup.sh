#!/usr/bin/env sh
# 每日在线备份并同步异地（体检 P0-3 / FR-012）。
#
# 流程：SQLite 在线一致性快照（00-backup-sqlite.sh，含文件主密钥）→ 连同 .env（含安全主密钥）
# 打包压缩 → age 公钥加密 → 上传到独立备份 Bucket 的 daily/ 前缀 → 本地按保留策略清理。
# 私钥离线保管，服务器只持有公钥，因此服务器被入侵也无法解密历史备份。
#
# 由 systemd timer（yuance-backup.timer）每日调用；也可手动执行。
# 结果写入 $BACKUP_ROOT/.offsite-status，发布前置检查据此提示最近一次异地备份是否成功。
set -eu
umask 077

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
APP_DIR="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
BACKUP_ROOT="${YUANCE_BACKUP_DIR:-$APP_DIR/backups}"
CONF_DIR="${YUANCE_OFFSITE_CONF_DIR:-/etc/yuance-backup}"
RCLONE_CONFIG="$CONF_DIR/rclone.conf"
AGE_RECIPIENT_FILE="$CONF_DIR/age-recipient.txt"
REMOTE="${YUANCE_OFFSITE_REMOTE:-yuance-backup:yuance-backup/daily}"
KEEP_DAILY="${YUANCE_BACKUP_KEEP_DAILY:-14}"
STATUS_FILE="$BACKUP_ROOT/.offsite-status"
LOCK_FILE="${YUANCE_BACKUP_LOCK:-/run/lock/yuance-backup.lock}"

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

write_status() {
  {
    printf 'result=%s\n' "$1"
    printf 'finished_at_utc=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf 'detail=%s\n' "$2"
  } > "$STATUS_FILE.tmp" && mv "$STATUS_FILE.tmp" "$STATUS_FILE"
}

fail() {
  log "失败：$1" >&2
  write_status failed "$1" || true
  exit 1
}

for tool in sqlite3 age rclone tar zstd flock sha256sum; do
  command -v "$tool" >/dev/null 2>&1 || fail "缺少命令：$tool"
done
[ -f "$RCLONE_CONFIG" ] || fail "缺少异地存储配置：$RCLONE_CONFIG"
[ -s "$AGE_RECIPIENT_FILE" ] || fail "缺少 age 公钥：$AGE_RECIPIENT_FILE"
case "$KEEP_DAILY" in ''|*[!0-9]*) fail "YUANCE_BACKUP_KEEP_DAILY 必须是非负整数" ;; esac

# 与发布流程互斥：发布期间不做备份，备份期间不发布（发布脚本使用同一把锁）。
exec 9>"$LOCK_FILE"
flock -w 600 9 || fail "等待部署/备份锁超时"

log "开始在线快照"
SNAPSHOT_OUTPUT="$("$SCRIPT_DIR/with-clean-backup-env.sh" "$SCRIPT_DIR/00-backup-sqlite.sh")" || fail "SQLite 在线快照失败"
SNAPSHOT_LINE="$(printf '%s\n' "$SNAPSHOT_OUTPUT" | tail -n 1)"
SNAPSHOT_DIR="${SNAPSHOT_LINE##*：}"
[ -d "$SNAPSHOT_DIR" ] || fail "无法确定快照目录：$SNAPSHOT_OUTPUT"
log "快照完成：$SNAPSHOT_DIR"

# .env 含安全主密钥（OSS Secret、Token 密文等依赖它），一并加密备份。
if [ -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/.env" "$SNAPSHOT_DIR/env.backup"
  chmod 600 "$SNAPSHOT_DIR/env.backup"
fi

STAMP="$(basename "$SNAPSHOT_DIR")"
WORK="$(mktemp -d "$BACKUP_ROOT/.offsite.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
ARCHIVE="$WORK/yuance-$STAMP.tar.zst.age"
tar -C "$SNAPSHOT_DIR" -cf - . | zstd -q -T0 -10 | age -R "$AGE_RECIPIENT_FILE" -o "$ARCHIVE" \
  || fail "打包或加密失败"
ARCHIVE_SHA="$(sha256sum "$ARCHIVE" | cut -d' ' -f1)"
ARCHIVE_SIZE="$(wc -c < "$ARCHIVE" | tr -d '[:space:]')"
printf '%s  %s\n' "$ARCHIVE_SHA" "$(basename "$ARCHIVE")" > "$ARCHIVE.sha256"

log "上传 $(basename "$ARCHIVE")（$ARCHIVE_SIZE 字节）"
RCLONE="rclone --config $RCLONE_CONFIG --s3-no-check-bucket --retries 5 --low-level-retries 10"
$RCLONE copyto "$ARCHIVE" "$REMOTE/$(basename "$ARCHIVE")" || fail "上传失败"
$RCLONE copyto "$ARCHIVE.sha256" "$REMOTE/$(basename "$ARCHIVE").sha256" || fail "上传校验文件失败"
REMOTE_SIZE="$($RCLONE size --json "$REMOTE/$(basename "$ARCHIVE")" | sed -n 's/.*"bytes":\([0-9]*\).*/\1/p')"
[ "$REMOTE_SIZE" = "$ARCHIVE_SIZE" ] || fail "远端大小与本地不一致：$REMOTE_SIZE != $ARCHIVE_SIZE"

# 本地保留：最近 KEEP_DAILY 份快照 + 每月最早一份；其余删除（异地由 Bucket 生命周期保留 90 天）。
# 目录名形如 20261124073504.AaJrLI 或早期的 20260807033032（UTC 时间戳开头），只处理这两种格式，其他目录不动。
log "清理本地旧快照（保留最近 $KEEP_DAILY 份与每月首份）"
ls -1 "$BACKUP_ROOT" | grep -E '^[0-9]{14}(\.[A-Za-z0-9]+)?$' | sort > "$WORK/all.txt"
tail -n "$KEEP_DAILY" "$WORK/all.txt" > "$WORK/keep.txt"
awk '{ month = substr($0, 1, 6); if (!(month in seen)) { seen[month] = 1; print } }' "$WORK/all.txt" >> "$WORK/keep.txt"
removed=0
while IFS= read -r entry; do
  if ! grep -qxF "$entry" "$WORK/keep.txt"; then
    rm -rf "${BACKUP_ROOT:?}/$entry"
    removed=$((removed + 1))
  fi
done < "$WORK/all.txt"

write_status ok "archive=$(basename "$ARCHIVE") sha256=$ARCHIVE_SHA bytes=$ARCHIVE_SIZE removed_local=$removed"
log "完成：$(basename "$ARCHIVE")，本地清理 $removed 份"
