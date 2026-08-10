import assert from 'node:assert/strict';
import test from 'node:test';

import { createWorkItemEventCoordinator, createWorkItemTypingController } from '@yuance/frontend-app-core';

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

test('work item typing throttles renewals and stops after idle', () => {
  let timestamp = 1_000;
  let timerId = 0;
  const timers = new Map();
  const calls = [];
  const controller = createWorkItemTypingController({
    itemKey: 'YCE-TASK-2', clientId: 'web:session-1', send: (itemKey, payload) => { calls.push([itemKey, payload]); }, now: () => timestamp,
    schedule: (callback, delay) => { const id = ++timerId; timers.set(id, { callback, at: timestamp + delay }); return id; },
    cancel: (id) => timers.delete(id),
  });

  controller.start();
  controller.activity();
  timestamp += 4_999;
  controller.activity();
  timestamp += 1;
  controller.activity();
  assert.deepEqual(calls, [
    ['YCE-TASK-2', { clientId: 'web:session-1', active: true }],
    ['YCE-TASK-2', { clientId: 'web:session-1', active: true }],
  ]);

  timestamp += 10_000;
  const idle = [...timers.values()].find((timer) => timer.at <= timestamp);
  assert.ok(idle);
  idle.callback();
  assert.deepEqual(calls.at(-1), ['YCE-TASK-2', { clientId: 'web:session-1', active: false }]);
});

test('work item typing sends one best-effort stop on blur or dispose', () => {
  const calls = [];
  const controller = createWorkItemTypingController({ itemKey: 'YCE-TASK-2', clientId: 'web:session-1', send: (_itemKey, payload) => { calls.push(payload); } });
  controller.start();
  controller.stop();
  controller.stop();
  controller.start();
  controller.dispose();
  controller.start();
  assert.deepEqual(calls.map((call) => call.active), [true, false, true, false]);
});
