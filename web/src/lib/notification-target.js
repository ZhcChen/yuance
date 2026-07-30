// @ts-check

import { buildMessagesPath, buildWorkItemDetailPath } from './routes.js';

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
 * @param {'app' | 'web'} [owner]
 */
export function notificationTargetPath(target, owner = 'web') {
  if (!target || target.kind !== 'work_item' || !target.work_item_key) {
    return buildMessagesPath({ owner });
  }

  return buildWorkItemDetailPath({
    owner,
    itemKey: target.work_item_key,
    commentId: target.comment_id,
  });
}
