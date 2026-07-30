import test from 'node:test';
import assert from 'node:assert/strict';

import { notificationTargetPath } from '../src/lib/notification-target.js';

test('notificationTargetPath maps work item comment targets to anchors', () => {
  assert.equal(
    notificationTargetPath({
      kind: 'work_item',
      project_key: 'YCE',
      work_item_key: 'YCE-TASK-1',
      comment_id: 42,
    }),
    '/web/work-items/YCE-TASK-1#comment-42',
  );
});

test('notificationTargetPath falls back to work item detail without comment', () => {
  assert.equal(
    notificationTargetPath({
      kind: 'work_item',
      project_key: 'YCE',
      work_item_key: 'YCE-TASK-1',
      comment_id: null,
    }),
    '/web/work-items/YCE-TASK-1',
  );
});

test('notificationTargetPath falls back to messages when target is missing', () => {
  assert.equal(notificationTargetPath(null), '/web/messages');
});
