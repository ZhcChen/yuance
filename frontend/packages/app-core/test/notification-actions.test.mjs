import assert from 'node:assert/strict';
import test from 'node:test';

import { createNotificationActionCoordinator } from '../src/notification-actions.js';

test('read-all locks duplicate submissions and refreshes only after commit', async () => {
  const calls = [];
  /** @type {((value?: unknown) => void) | undefined} */
  let commit;
  const coordinator = fixture({
    markAllRead: () => new Promise((resolve) => {
      calls.push('mark-all');
      commit = resolve;
    }),
    refresh: async () => { calls.push('refresh'); },
  });

  const first = coordinator.markAll();
  const duplicate = coordinator.markAll();
  assert.equal(first, duplicate);
  assert.deepEqual(calls, ['mark-all']);
  assert.equal(coordinator.snapshot().readAllPending, true);

  commit?.();
  await first;
  assert.deepEqual(calls, ['mark-all', 'refresh']);
  assert.equal(coordinator.snapshot().readAllPending, false);
});

test('unread target uses canonical read response and switches project before navigation', async () => {
  const calls = [];
  const coordinator = fixture({
    currentProjectKey: () => 'OPS',
    markRead: async (id) => {
      calls.push(['read', id]);
      return { target: target() };
    },
    setCurrentProject: async (key) => { calls.push(['project', key]); },
    navigate: (path) => calls.push(['navigate', path]),
  });

  await coordinator.open({ id: 7, read: false });

  assert.deepEqual(calls, [
    ['read', 7],
    ['project', 'YCE'],
    ['navigate', '/web/app/work-items/YCE-TASK-7#comment-9'],
  ]);
});

test('read target is re-resolved, same-project navigation skips project mutation', async () => {
  const calls = [];
  const coordinator = fixture({
    getTarget: async (id) => {
      calls.push(['target', id]);
      return { target: target({ comment_id: null }) };
    },
    navigate: (path) => calls.push(['navigate', path]),
  });

  await coordinator.open({ id: 8, read: true });

  assert.deepEqual(calls, [
    ['target', 8],
    ['navigate', '/web/app/work-items/YCE-TASK-7'],
  ]);
});

test('missing or revoked target remains on messages and refreshes final read state', async () => {
  const calls = [];
  const coordinator = fixture({
    markRead: async () => ({ target: null }),
    refresh: async () => { calls.push('refresh'); },
    navigate: (path) => calls.push(['navigate', path]),
  });

  await assert.rejects(
    coordinator.open({ id: 9, read: false }),
    /消息目标已不存在或你已无权访问/,
  );
  assert.deepEqual(calls, ['refresh']);
  assert.equal(coordinator.snapshot().openingId, null);
});

test('opening is locked while canonical target resolution is pending', async () => {
  /** @type {((value: { target: ReturnType<typeof target> }) => void) | undefined} */
  let resolveTarget;
  const coordinator = fixture({
    getTarget: () => new Promise((resolve) => { resolveTarget = resolve; }),
  });

  const first = coordinator.open({ id: 10, read: true });
  const duplicate = coordinator.open({ id: 11, read: true });
  assert.equal(first, duplicate);
  assert.equal(coordinator.snapshot().openingId, 10);
  resolveTarget?.({ target: target() });
  await first;
});

function fixture(overrides = {}) {
  return createNotificationActionCoordinator({
    markAllRead: async () => {},
    markRead: async () => ({ target: target() }),
    getTarget: async () => ({ target: target() }),
    setCurrentProject: async () => {},
    currentProjectKey: () => 'YCE',
    refresh: async () => {},
    navigate: () => {},
    targetPath: (value) => `/web/app/work-items/${value.work_item_key}${value.comment_id ? `#comment-${value.comment_id}` : ''}`,
    ...overrides,
  });
}

/** @param {Partial<{ kind: 'work_item', project_key: string, work_item_key: string, comment_id: number | null }>} [overrides]
 * @returns {{ kind: 'work_item', project_key: string, work_item_key: string, comment_id: number | null }}
 */
function target(overrides = {}) {
  return { kind: 'work_item', project_key: 'YCE', work_item_key: 'YCE-TASK-7', comment_id: 9, ...overrides };
}
