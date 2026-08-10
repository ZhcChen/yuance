import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createWorkItemComment,
  downloadWorkItemAttachment,
  handoffWorkItem,
  saveWorkItem,
  updateWorkItemComment,
  uploadWorkItemAttachment,
  uploadWorkItemCommentAttachment,
  uploadProjectAttachment,
} from '@yuance/frontend-app-core';

/** @typedef {import('@yuance/frontend-platform-contract').FileCapability} FileCapability */
/** @typedef {import('@yuance/frontend-platform-contract').SignedTransferCapability} SignedTransferCapability */

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

function attachmentPlatform(events) {
  return {
    files: {
      chooseFile: async () => null,
      uploadSignedRequest: async (transfer, file) => { events.push(['upload', transfer, file]); },
    },
    transfers: {
      authorizeSignedRequest: (request) => {
        events.push(['authorize', request]);
        return /** @type {SignedTransferCapability} */ (request);
      },
    },
    downloads: {
      downloadSignedRequest: async (transfer, filename) => { events.push(['download', transfer, filename]); },
    },
  };
}

test('work item attachment upload follows register sign upload confirm refresh order', async () => {
  const events = [];
  const created = { id: 9, status: 'pending' };
  const uploaded = { id: 9, status: 'uploaded' };
  const fileCapability = /** @type {FileCapability} */ ({});
  const request = {};
  const authorization = { request, purpose: 'upload', expiresInSeconds: 300 };

  const result = await uploadWorkItemAttachment({
    api: {
      createWorkItemAttachment: async (itemKey, payload) => {
        events.push(['create', itemKey, payload]);
        return created;
      },
      getWorkItemAttachmentUploadUrl: async (itemKey, attachmentId) => {
        events.push(['sign', itemKey, attachmentId]);
        return { request, expires_in_seconds: 300 };
      },
      markWorkItemAttachmentUploaded: async (itemKey, attachmentId) => {
        events.push(['confirm', itemKey, attachmentId]);
        return uploaded;
      },
    },
    platform: attachmentPlatform(events),
    itemKey: 'YCE-TASK-2',
    file: {
      capability: fileCapability,
      filename: 'design.txt',
      contentType: 'text/plain',
      byteSize: 7,
    },
    lifecycle: {
      isCurrent: () => true,
      onStage: (stage) => { events.push(['stage', stage]); },
      onCreated: (attachment) => { events.push(['created', attachment]); },
      onUploaded: (attachment) => { events.push(['uploaded', attachment]); },
      refresh: async () => { events.push(['refresh']); },
    },
  });

  assert.deepEqual(events, [
    ['stage', 'registering'],
    ['create', 'YCE-TASK-2', { originalFilename: 'design.txt', contentType: 'text/plain', byteSize: 7 }],
    ['created', created],
    ['stage', 'signing'],
    ['sign', 'YCE-TASK-2', 9],
    ['authorize', authorization],
    ['stage', 'uploading'],
    ['upload', authorization, fileCapability],
    ['stage', 'confirming'],
    ['confirm', 'YCE-TASK-2', 9],
    ['uploaded', uploaded],
    ['refresh'],
  ]);
  assert.equal(result.completed, true);
  assert.equal(result.uploaded, uploaded);
});

test('work item attachment retry skips registration and reuses the pending record', async () => {
  const events = [];
  const pending = { id: 9, status: 'pending' };
  const uploaded = { id: 9, status: 'uploaded' };
  await uploadWorkItemAttachment({
    api: {
      createWorkItemAttachment: async () => { throw new Error('retry must not register'); },
      getWorkItemAttachmentUploadUrl: async (itemKey, attachmentId) => { events.push(['sign', itemKey, attachmentId]); return { request: {}, expires_in_seconds: 300 }; },
      markWorkItemAttachmentUploaded: async (itemKey, attachmentId) => { events.push(['confirm', itemKey, attachmentId]); return uploaded; },
    },
    platform: attachmentPlatform(events), itemKey: 'YCE-TASK-2', existingAttachment: pending,
    file: { capability: /** @type {FileCapability} */ ({}), filename: 'report.txt', contentType: 'text/plain', byteSize: 12 },
    lifecycle: {
      isCurrent: () => true,
      onStage: (stage) => events.push(['stage', stage]),
      onCreated: () => { throw new Error('retry must not create UI state'); },
      onUploaded: (attachment) => events.push(['uploaded', attachment]),
    },
  });
  assert.equal(events.some((event) => event[1] === 'registering'), false);
  assert.deepEqual(events[0], ['stage', 'signing']);
  assert.deepEqual(events.at(-1), ['uploaded', uploaded]);
});

test('project attachment retry skips registration and reuses the pending record', async () => {
  const events = [];
  const pending = { id: 9, status: 'pending' };
  const uploaded = { id: 9, status: 'uploaded' };
  const fileCapability = /** @type {FileCapability} */ ({});
  await uploadProjectAttachment({
    api: {
      createProjectAttachment: async () => { throw new Error('retry must not register'); },
      getProjectAttachmentUploadUrl: async (projectKey, attachmentId) => { events.push(['sign', projectKey, attachmentId]); return { request: {}, expires_in_seconds: 300, checksum_sha256: 'a'.repeat(64) }; },
      markProjectAttachmentUploaded: async (projectKey, attachmentId) => { events.push(['confirm', projectKey, attachmentId]); return uploaded; },
    },
    platform: attachmentPlatform(events), projectKey: 'YCE', existingAttachment: pending,
    file: { capability: fileCapability, filename: 'report.txt', contentType: 'text/plain', byteSize: 12, checksumSha256: 'a'.repeat(64) },
    lifecycle: {
      isCurrent: () => true,
      onStage: (stage) => events.push(['stage', stage]),
      onCreated: () => { throw new Error('retry must not create UI state'); },
      onUploaded: (attachment) => events.push(['uploaded', attachment]),
    },
  });
  assert.equal(events.some((event) => event[1] === 'registering'), false);
  assert.deepEqual(events[0], ['stage', 'signing']);
  assert.deepEqual(events.at(-1), ['uploaded', uploaded]);
});

test('desktop delegated project upload publishes registration before a partial failure', async () => {
  const events = [];
  const created = { id: 9, status: 'pending' };
  await assert.rejects(uploadProjectAttachment({
    api: {}, projectKey: 'YCE',
    platform: {
      ...attachmentPlatform(events),
      attachments: {
        uploadProjectAttachment: async (_input, onStage) => { onStage('registering'); onStage('signing', created); throw new Error('transfer failed'); },
      },
    },
    file: { capability: /** @type {FileCapability} */ ({}), filename: 'report.txt', contentType: 'text/plain', byteSize: 12 },
    lifecycle: {
      isCurrent: () => true,
      onStage: (stage) => events.push(['stage', stage]),
      onCreated: (attachment) => events.push(['created', attachment]),
      onUploaded: () => {},
    },
  }), /transfer failed/);
  assert.equal(events.filter(([kind]) => kind === 'created').length, 1);
  assert.deepEqual(events.at(-1), ['created', created]);
});

test('desktop delegated attachment upload preserves stages without exposing signed requests', async () => {
  const events = [];
  const created = { id: 9, status: 'pending' };
  const uploaded = { id: 9, status: 'uploaded' };
  const fileCapability = /** @type {FileCapability} */ ({});
  const result = await uploadWorkItemAttachment({
    api: {
      createWorkItemAttachment: async () => { throw new Error('renderer API must not register'); },
      getWorkItemAttachmentUploadUrl: async () => { throw new Error('renderer API must not sign'); },
      markWorkItemAttachmentUploaded: async () => { throw new Error('renderer API must not confirm'); },
    },
    platform: {
      ...attachmentPlatform(events),
      attachments: {
        uploadWorkItemAttachment: async (input, onStage) => {
          events.push(['delegate', input]);
          for (const stage of /** @type {const} */ (['registering', 'signing', 'uploading', 'confirming'])) onStage(stage);
          return { created, uploaded };
        },
        uploadWorkItemCommentAttachment: async () => ({ created, uploaded }),
        downloadWorkItemAttachment: async () => ({ status: 'completed' }),
        downloadWorkItemCommentAttachment: async () => ({ status: 'completed' }),
        uploadProjectAttachment: async () => ({ created, uploaded }),
        downloadProjectAttachment: async () => ({ status: 'completed' }),
        uploadProjectResourceAttachment: async () => ({ created, uploaded }),
        downloadProjectResourceAttachment: async () => ({ status: 'completed' }),
        openProjectAttachmentPreview: async () => { throw new Error('unused'); },
        openWorkItemAttachmentPreview: async () => { throw new Error('unused'); },
        openWorkItemCommentAttachmentPreview: async () => { throw new Error('unused'); },
        openProjectResourceAttachmentPreview: async () => { throw new Error('unused'); },
        releaseProjectAttachmentPreview: async () => ({ status: 'released' }),
        revealDownload: async () => ({ status: 'revealed' }),
      },
    },
    itemKey: 'YCE-TASK-2',
    file: { capability: fileCapability, filename: 'design.txt', contentType: 'text/plain', byteSize: 7 },
    lifecycle: {
      isCurrent: () => true,
      onStage: (stage) => events.push(['stage', stage]),
      onCreated: (attachment) => events.push(['created', attachment]),
      onUploaded: (attachment) => events.push(['uploaded', attachment]),
      refresh: async () => { events.push(['refresh']); },
    },
  });

  assert.deepEqual(events, [
    ['delegate', { itemKey: 'YCE-TASK-2', fileCapability }],
    ['stage', 'registering'],
    ['stage', 'signing'],
    ['stage', 'uploading'],
    ['stage', 'confirming'],
    ['created', created],
    ['uploaded', uploaded],
    ['refresh'],
  ]);
  assert.equal(result.completed, true);
});

test('desktop delegated attachment download avoids renderer signing and honors cancellation', async () => {
  let signed = false;
  const platform = {
    ...attachmentPlatform([]),
    attachments: {
      uploadWorkItemAttachment: async () => { throw new Error('unused'); },
      uploadWorkItemCommentAttachment: async () => { throw new Error('unused'); },
      downloadWorkItemAttachment: async (input) => {
        assert.deepEqual(input, { itemKey: 'YCE-TASK-2', attachmentId: 9, suggestedFilename: 'design.txt' });
        return { status: /** @type {const} */ ('cancelled') };
      },
      downloadWorkItemCommentAttachment: async () => ({ status: /** @type {const} */ ('completed') }),
      uploadProjectAttachment: async () => { throw new Error('unused'); },
      downloadProjectAttachment: async () => ({ status: /** @type {const} */ ('completed') }),
      uploadProjectResourceAttachment: async () => { throw new Error('unused'); },
      downloadProjectResourceAttachment: async () => ({ status: /** @type {const} */ ('completed') }),
      openProjectAttachmentPreview: async () => { throw new Error('unused'); },
      openWorkItemAttachmentPreview: async () => { throw new Error('unused'); },
      openWorkItemCommentAttachmentPreview: async () => { throw new Error('unused'); },
      openProjectResourceAttachmentPreview: async () => { throw new Error('unused'); },
      releaseProjectAttachmentPreview: async () => ({ status: /** @type {const} */ ('released') }),
      revealDownload: async () => ({ status: /** @type {const} */ ('revealed') }),
    },
  };
  const result = await downloadWorkItemAttachment({
    api: { getWorkItemAttachmentDownloadUrl: async () => { signed = true; return { request: {}, expires_in_seconds: 30 }; } },
    platform,
    itemKey: 'YCE-TASK-2',
    attachmentId: 9,
    suggestedFilename: 'design.txt',
    isCurrent: () => true,
  });

  assert.deepEqual(result, { completed: false, revealCapability: null });
  assert.equal(signed, false);
});

test('attachment upload keeps the confirmed result when refresh fails', async () => {
  const refreshFailure = new Error('refresh failed');
  const uploaded = { id: 9, status: 'uploaded' };

  const result = await uploadWorkItemAttachment({
    api: {
      createWorkItemAttachment: async () => ({ id: 9, status: 'pending' }),
      getWorkItemAttachmentUploadUrl: async () => ({ request: {}, expires_in_seconds: 300 }),
      markWorkItemAttachmentUploaded: async () => uploaded,
    },
    platform: attachmentPlatform([]),
    itemKey: 'YCE-TASK-2',
    file: {
      capability: /** @type {FileCapability} */ ({}),
      filename: 'design.txt',
      contentType: 'text/plain',
      byteSize: 7,
    },
    lifecycle: {
      isCurrent: () => true,
      onStage: () => {},
      onCreated: () => {},
      onUploaded: () => {},
      refresh: async () => { throw refreshFailure; },
    },
  });

  assert.equal(result.completed, true);
  assert.equal(result.uploaded, uploaded);
  assert.equal(result.refreshError, refreshFailure);
});

test('attachment upload becomes stale while refreshing', async () => {
  let current = true;

  const result = await uploadWorkItemAttachment({
    api: {
      createWorkItemAttachment: async () => ({ id: 9, status: 'pending' }),
      getWorkItemAttachmentUploadUrl: async () => ({ request: {}, expires_in_seconds: 300 }),
      markWorkItemAttachmentUploaded: async () => ({ id: 9, status: 'uploaded' }),
    },
    platform: attachmentPlatform([]),
    itemKey: 'YCE-TASK-2',
    file: {
      capability: /** @type {FileCapability} */ ({}),
      filename: 'design.txt',
      contentType: 'text/plain',
      byteSize: 7,
    },
    lifecycle: {
      isCurrent: () => current,
      onStage: () => {},
      onCreated: () => {},
      onUploaded: () => {},
      refresh: async () => { current = false; },
    },
  });

  assert.equal(result.completed, false);
  assert.equal(result.uploaded?.status, 'uploaded');
});

test('attachment upload confirms persisted state after becoming stale', async () => {
  const events = [];
  let current = true;
  const platform = attachmentPlatform(events);
  platform.files.uploadSignedRequest = async (transfer, file) => {
    events.push(['upload', transfer, file]);
    current = false;
  };

  const result = await uploadWorkItemAttachment({
    api: {
      createWorkItemAttachment: async () => ({ id: 9, status: 'pending' }),
      getWorkItemAttachmentUploadUrl: async () => ({ request: {}, expires_in_seconds: 300 }),
      markWorkItemAttachmentUploaded: async () => {
        events.push(['confirm']);
        return { id: 9, status: 'uploaded' };
      },
    },
    platform,
    itemKey: 'YCE-TASK-2',
    file: {
      capability: /** @type {FileCapability} */ ({}),
      filename: 'design.txt',
      contentType: 'text/plain',
      byteSize: 7,
    },
    lifecycle: {
      isCurrent: () => current,
      onStage: (stage) => { events.push(['stage', stage]); },
      onCreated: () => {},
      onUploaded: () => { events.push(['uploaded']); },
      refresh: async () => { events.push(['refresh']); },
    },
  });

  assert.equal(result.completed, false);
  assert.equal(result.uploaded?.status, 'uploaded');
  assert.equal(events.some((event) => event[0] === 'confirm'), true);
  assert.equal(events.some((event) => event[0] === 'uploaded'), false);
  assert.equal(events.some((event) => event[0] === 'refresh'), false);
});

test('initially stale attachment upload performs no host or persistent actions', async () => {
  const events = [];

  const result = await uploadWorkItemAttachment({
    api: {
      createWorkItemAttachment: async () => {
        events.push(['create']);
        return { id: 9, status: 'pending' };
      },
      getWorkItemAttachmentUploadUrl: async () => ({ request: {}, expires_in_seconds: 300 }),
      markWorkItemAttachmentUploaded: async () => ({ id: 9, status: 'uploaded' }),
    },
    platform: attachmentPlatform(events),
    itemKey: 'YCE-TASK-2',
    file: {
      capability: /** @type {FileCapability} */ ({}),
      filename: 'design.txt',
      contentType: 'text/plain',
      byteSize: 7,
    },
    lifecycle: {
      isCurrent: () => false,
      onStage: (stage) => { events.push(['stage', stage]); },
      onCreated: () => {},
      onUploaded: () => {},
    },
  });

  assert.equal(result.completed, false);
  assert.equal(result.created, null);
  assert.deepEqual(events, []);
});

test('comment attachment signing failure does not upload or confirm', async () => {
  const events = [];
  const failure = new Error('sign failed');

  await assert.rejects(
    uploadWorkItemCommentAttachment({
      api: {
        createWorkItemCommentAttachment: async () => ({ id: 11, status: 'pending' }),
        getWorkItemCommentAttachmentUploadUrl: async () => { throw failure; },
        markWorkItemCommentAttachmentUploaded: async () => {
          events.push(['confirm']);
          return { id: 11, status: 'uploaded' };
        },
      },
      platform: attachmentPlatform(events),
      itemKey: 'YCE-TASK-2',
      commentId: 7,
      file: {
        capability: /** @type {FileCapability} */ ({}),
        filename: 'comment.txt',
        contentType: 'text/plain',
        byteSize: 3,
      },
      lifecycle: {
        isCurrent: () => true,
        onStage: () => {},
        onCreated: () => {},
        onUploaded: () => {},
      },
    }),
    failure,
  );
  assert.deepEqual(events, []);
});

test('stale attachment download does not invoke the platform', async () => {
  const events = [];
  const opened = await downloadWorkItemAttachment({
    api: { getWorkItemAttachmentDownloadUrl: async () => ({ request: {}, expires_in_seconds: 300 }) },
    platform: attachmentPlatform(events),
    itemKey: 'YCE-TASK-2',
    attachmentId: 9,
    suggestedFilename: 'design.txt',
    isCurrent: () => false,
  });

  assert.deepEqual(opened, { completed: false, revealCapability: null });
  assert.deepEqual(events, []);
});
