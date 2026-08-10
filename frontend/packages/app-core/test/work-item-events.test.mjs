import assert from 'node:assert/strict';
import test from 'node:test';

import { createWorkItemEventCoordinator } from '@yuance/frontend-app-core';

const event = (type, sequence, extra = {}) => ({ type, itemKey: 'YCE-TASK-2', connectionId: 'work-item:YCE-TASK-2', sequence, ...extra });

test('work item events isolate item keys and reject duplicate or stale sequences', async () => {
  let refreshes = 0;
  const typing = [];
  const coordinator = createWorkItemEventCoordinator({ itemKey: 'YCE-TASK-2', refresh: () => { refreshes += 1; }, onTyping: (users) => typing.push(users) });

  coordinator.handle({ ...event('work-item-discussion-invalidated', 1), itemKey: 'OTHER' });
  coordinator.handle(event('work-item-typing', 2, { users: [{ userId: 7, displayName: 'Alice' }] }));
  coordinator.handle(event('work-item-typing', 2, { users: [] }));
  coordinator.handle(event('work-item-discussion-invalidated', 1));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(refreshes, 0);
  assert.deepEqual(typing, [[{ userId: 7, displayName: 'Alice' }]]);
});

test('work item events merge concurrent invalidations into one trailing refresh', async () => {
  const refreshResolvers = /** @type {Array<() => void>} */ ([]);
  let refreshes = 0;
  const coordinator = createWorkItemEventCoordinator({
    itemKey: 'YCE-TASK-2',
    refresh: () => { refreshes += 1; return new Promise((resolve) => { refreshResolvers.push(resolve); }); },
  });
  coordinator.handle(event('work-item-discussion-invalidated', 1));
  coordinator.handle(event('work-item-discussion-invalidated', 2));
  coordinator.handle(event('work-item-discussion-invalidated', 3));
  assert.equal(refreshes, 1);
  const resolveFirst = refreshResolvers.shift();
  assert.ok(resolveFirst);
  resolveFirst();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(refreshes, 2);
  coordinator.dispose();
  const resolveSecond = refreshResolvers.shift();
  assert.ok(resolveSecond);
  resolveSecond();
});
