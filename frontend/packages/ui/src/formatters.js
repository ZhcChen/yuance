// @ts-check

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
