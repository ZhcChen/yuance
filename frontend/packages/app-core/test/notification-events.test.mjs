import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createNotificationEventCoordinator,
  createNotificationEventState,
  reduceNotificationEvent,
} from '../src/notification-events.js';

test('相同事件序列产生稳定快照并丢弃连接内重复和乱序事实', () => {
  const events = [
    event('stream-connected', 'browser-1', 1),
    event('release-version', 'browser-1', 2, { version: '1.2.3' }),
    event('topbar-invalidated', 'browser-1', 3),
    event('topbar-invalidated', 'browser-1', 3),
    event('topbar-invalidated', 'browser-1', 2),
  ];

  const browser = events.reduce(reduceNotificationEvent, createNotificationEventState());
  const replay = events.reduce(reduceNotificationEvent, createNotificationEventState());

  assert.deepEqual(browser, replay);
  assert.deepEqual(browser, {
    connectionId: 'browser-1',
    connected: true,
    lastSequence: 3,
    refreshRevision: 1,
    releaseVersion: '1.2.3',
    targetPath: '',
    targetRevision: 0,
  });
});

test('新连接重置序号并强制一次全量恢复', () => {
  const first = reduceNotificationEvent(createNotificationEventState(), event('topbar-invalidated', 'stream-a', 9));
  const reconnected = reduceNotificationEvent(first, event('stream-connected', 'stream-b', 1));

  assert.equal(reconnected.connectionId, 'stream-b');
  assert.equal(reconnected.lastSequence, 1);
  assert.equal(reconnected.refreshRevision, 2);
});

test('首次连接不触发全量刷新，同一连接或新连接重连时补拉一次', () => {
  // 服务端先推送版本号、再推送连接事件：首次连接仍不刷新。
  const versioned = reduceNotificationEvent(createNotificationEventState(), event('release-version', 'topbar', 1, { version: '1.0.0' }));
  const connected = reduceNotificationEvent(versioned, event('stream-connected', 'topbar', 2));
  assert.equal(connected.refreshRevision, 0);
  const sameReconnected = reduceNotificationEvent(connected, event('stream-connected', 'topbar', 3));
  assert.equal(sameReconnected.refreshRevision, 1);
  const newReconnected = reduceNotificationEvent(sameReconnected, event('stream-connected', 'topbar-2', 1));
  assert.equal(newReconnected.refreshRevision, 2);
});

test('刷新中的重复失效事实合并为一次后续刷新', async () => {
  const releases = [];
  const navigations = [];
  const refreshes = [];
  /** @type {(() => void) | undefined} */
  let finishRefresh;
  const coordinator = createNotificationEventCoordinator({
    refresh: () => new Promise((resolve) => {
      refreshes.push(refreshes.length + 1);
      finishRefresh = resolve;
    }),
    onReleaseVersion: (version) => releases.push(version),
    onNavigate: (path) => navigations.push(path),
  });

  coordinator.handle(event('stream-connected', 'stream-a', 1));
  coordinator.handle(event('topbar-invalidated', 'stream-a', 2));
  coordinator.handle(event('topbar-invalidated', 'stream-a', 3));
  coordinator.handle(event('release-version', 'stream-a', 4, { version: '2.0.0' }));
  coordinator.handle({ type: 'notification-target', path: '/web/app/work-items/YCE-TASK-1#comment-2' });
  assert.deepEqual(refreshes, [1]);
  assert.equal(coordinator.snapshot().pendingRefresh, true);

  finishRefresh?.();
  await waitFor(() => refreshes.length === 2);
  finishRefresh?.();
  await waitFor(() => coordinator.snapshot().refreshing === false);

  assert.deepEqual(refreshes, [1, 2]);
  assert.deepEqual(releases, ['2.0.0']);
  assert.deepEqual(navigations, ['/web/app/work-items/YCE-TASK-1#comment-2']);
});

test('显式校准与 SSE 失效共享刷新合并逻辑', async () => {
  const refreshes = [];
  /** @type {(() => void) | undefined} */
  let finishRefresh;
  const coordinator = createNotificationEventCoordinator({
    refresh: () => new Promise((resolve) => { refreshes.push(refreshes.length + 1); finishRefresh = resolve; }),
  });

  coordinator.invalidate();
  coordinator.invalidate();
  coordinator.handle(event('topbar-invalidated', 'stream-a', 1));
  assert.deepEqual(refreshes, [1]);
  assert.equal(coordinator.snapshot().pendingRefresh, true);

  finishRefresh?.();
  await waitFor(() => refreshes.length === 2);
  finishRefresh?.();
  await waitFor(() => coordinator.snapshot().refreshing === false);
  coordinator.dispose();
  coordinator.invalidate();
  assert.deepEqual(refreshes, [1, 2]);
});

function event(type, connectionId, sequence, extra = {}) {
  return Object.freeze({ type, connectionId, sequence, ...extra });
}

async function waitFor(predicate) {
  for (let index = 0; index < 100; index += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error('condition not reached');
}
