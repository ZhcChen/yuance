// @ts-check

const businessTimeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});

/** @param {string | null | undefined} value @param {{ compact?: boolean, seconds?: boolean }} options */
export function formatBusinessTimestamp(value, { compact = false, seconds = !compact } = {}) {
  if (!value) return '';
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/iu.exec(value.trim());
  if (!match) return value;
  const [, day, time, fraction = '', offset = 'Z'] = match;
  // SQLite datetime('now') 返回不带偏移的 UTC 字符串。
  const calendar = new Date(`${day}T${time}${fraction}Z`);
  if (Number.isNaN(calendar.getTime()) || calendar.toISOString().slice(0, 19) !== `${day}T${time}`) return value;
  const date = new Date(`${day}T${time}${fraction}${offset.toUpperCase()}`);
  if (Number.isNaN(date.getTime())) return value;
  const parts = Object.fromEntries(businessTimeFormatter.formatToParts(date).map((part) => [part.type, part.value]));
  const dateText = compact ? `${parts.month}/${parts.day}` : `${parts.year}-${parts.month}-${parts.day}`;
  return `${dateText} ${parts.hour}:${parts.minute}${seconds ? `:${parts.second}` : ''}`;
}

/** @param {number} byteSize */
export function formatByteSize(byteSize) {
  if (!Number.isFinite(byteSize) || byteSize <= 0) return '大小未知';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = byteSize;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 || unitIndex === 0 ? Math.round(value) : value.toFixed(1)} ${units[unitIndex]}`;
}

/** @param {string} status */
export function attachmentStatusLabel(status) {
  switch (status) {
    case 'uploaded': return '已上传';
    case 'pending': return '待上传';
    case 'failed': return '上传失败';
    case 'deleted': return '已归档';
    default: return status || '未知状态';
  }
}

/** @param {{ status?: string }} attachment */
export function attachmentIsUploaded(attachment) {
  return attachment.status === 'uploaded';
}
