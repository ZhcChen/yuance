// @ts-check

/**
 * @typedef {'work_item'} NotificationTargetKind
 */

/**
 * @typedef NotificationTarget
 * @property {NotificationTargetKind} kind
 * @property {string} project_key
 * @property {string} work_item_key
 * @property {number | null} comment_id
 */

/**
 * @param {NotificationTarget | null | undefined} target
 */
export function notificationTargetPath(target) {
  if (!target || target.kind !== 'work_item' || !target.work_item_key) {
    return '/web/messages';
  }

  if (target.comment_id && Number.isInteger(target.comment_id)) {
    return `/web/work-items/${target.work_item_key}#comment-${target.comment_id}`;
  }

  return `/web/work-items/${target.work_item_key}`;
}
