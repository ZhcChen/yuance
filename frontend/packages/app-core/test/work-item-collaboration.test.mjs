import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createWorkItemComment,
  handoffWorkItem,
  saveWorkItem,
  updateWorkItemComment,
} from '@yuance/frontend-app-core';

function lifecycle(events, current = true) {
  return {
    isCurrent: () => current,
    onCommitted: (value) => { events.push(['committed', value]); },
    refreshCompanion: async (value) => events.push(['refreshed', value]),
  };
}

test('saveWorkItem commits and refreshes after the API mutation', async () => {
  const events = [];
  const updated = { key: 'YCE-TASK-2', title: '已更新' };
  const api = {
    updateWorkItem: async (itemKey, payload) => {
      events.push(['api', itemKey, payload]);
      return updated;
    },
  };

  const result = await saveWorkItem({
    api,
    itemKey: 'YCE-TASK-2',
    payload: { title: '已更新' },
    lifecycle: lifecycle(events),
  });

  assert.deepEqual(events, [
    ['api', 'YCE-TASK-2', { title: '已更新' }],
    ['committed', updated],
    ['refreshed', updated],
  ]);
  assert.deepEqual(result, { applied: true, value: updated, refreshError: null });
});

test('stale mutations return without committing or refreshing host state', async () => {
  const events = [];
  const updated = { key: 'YCE-TASK-2' };

  const result = await handoffWorkItem({
    api: { handoffWorkItem: async () => updated },
    itemKey: 'YCE-TASK-2',
    payload: { status: 'in_progress', assigneeUsername: 'alice', body: '' },
    lifecycle: lifecycle(events, false),
  });

  assert.deepEqual(events, []);
  assert.deepEqual(result, { applied: false, value: updated, refreshError: null });
});

test('handoffWorkItem preserves payload and lifecycle order', async () => {
  const events = [];
  const updated = { key: 'YCE-TASK-2', status: 'in_progress' };
  const payload = { status: 'in_progress', assigneeUsername: 'alice', body: '开始处理' };

  await handoffWorkItem({
    api: {
      handoffWorkItem: async (itemKey, nextPayload) => {
        events.push(['api', itemKey, nextPayload]);
        return updated;
      },
    },
    itemKey: 'YCE-TASK-2',
    payload,
    lifecycle: lifecycle(events),
  });

  assert.deepEqual(events, [
    ['api', 'YCE-TASK-2', payload],
    ['committed', updated],
    ['refreshed', updated],
  ]);
});

test('comment use cases preserve plain text payloads and lifecycle order', async () => {
  const events = [];
  const created = { id: 7, body: 'new' };
  const updated = { id: 7, body: 'edited' };
  const api = {
    createWorkItemComment: async (itemKey, payload) => {
      events.push(['create', itemKey, payload]);
      return created;
    },
    updateWorkItemComment: async (itemKey, commentId, payload) => {
      events.push(['update', itemKey, commentId, payload]);
      return updated;
    },
  };

  await createWorkItemComment({
    api,
    itemKey: 'YCE-TASK-2',
    payload: { body: 'new', bodyFormat: 'plain' },
    lifecycle: lifecycle(events),
  });
  await updateWorkItemComment({
    api,
    itemKey: 'YCE-TASK-2',
    commentId: 7,
    payload: { body: 'edited', bodyFormat: 'plain' },
    lifecycle: lifecycle(events),
  });

  assert.deepEqual(events, [
    ['create', 'YCE-TASK-2', { body: 'new', bodyFormat: 'plain' }],
    ['committed', created],
    ['refreshed', created],
    ['update', 'YCE-TASK-2', 7, { body: 'edited', bodyFormat: 'plain' }],
    ['committed', updated],
    ['refreshed', updated],
  ]);
});

test('mutation errors propagate without host callbacks', async () => {
  const events = [];
  const failure = new Error('request failed');

  await assert.rejects(
    saveWorkItem({
      api: { updateWorkItem: async () => { throw failure; } },
      itemKey: 'YCE-TASK-2',
      payload: { title: '失败' },
      lifecycle: lifecycle(events),
    }),
    failure,
  );
  assert.deepEqual(events, []);
});

test('commit rejection or a stale commit skips companion refresh', async () => {
  const rejectedEvents = [];
  const staleEvents = [];
  let current = true;

  const rejected = await saveWorkItem({
    api: { updateWorkItem: async () => ({ key: 'YCE-TASK-2' }) },
    itemKey: 'YCE-TASK-2',
    payload: { title: '拒绝提交' },
    lifecycle: {
      isCurrent: () => true,
      onCommitted: () => false,
      refreshCompanion: async () => { rejectedEvents.push('refresh'); },
    },
  });
  const stale = await saveWorkItem({
    api: { updateWorkItem: async () => ({ key: 'YCE-TASK-2' }) },
    itemKey: 'YCE-TASK-2',
    payload: { title: '路由变化' },
    lifecycle: {
      isCurrent: () => current,
      onCommitted: () => { current = false; },
      refreshCompanion: async () => { staleEvents.push('refresh'); },
    },
  });

  assert.equal(rejected.applied, false);
  assert.equal(stale.applied, false);
  assert.deepEqual(rejectedEvents, []);
  assert.deepEqual(staleEvents, []);
});

test('companion refresh failure does not reject a committed mutation', async () => {
  const refreshFailure = new Error('refresh failed');
  const result = await saveWorkItem({
    api: { updateWorkItem: async () => ({ key: 'YCE-TASK-2' }) },
    itemKey: 'YCE-TASK-2',
    payload: { title: '已提交' },
    lifecycle: {
      isCurrent: () => true,
      onCommitted: () => {},
      refreshCompanion: async () => { throw refreshFailure; },
    },
  });

  assert.equal(result.applied, true);
  assert.equal(result.refreshError, refreshFailure);
});

test('synchronous host commit errors propagate without companion refresh', async () => {
  const commitFailure = new Error('commit failed');
  let refreshed = false;

  await assert.rejects(
    saveWorkItem({
      api: { updateWorkItem: async () => ({ key: 'YCE-TASK-2' }) },
      itemKey: 'YCE-TASK-2',
      payload: { title: '已提交' },
      lifecycle: {
        isCurrent: () => true,
        onCommitted: () => { throw commitFailure; },
        refreshCompanion: async () => { refreshed = true; },
      },
    }),
    commitFailure,
  );
  assert.equal(refreshed, false);
});
