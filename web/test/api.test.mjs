import test from 'node:test';
import assert from 'node:assert/strict';

import {
  batchUpdateWorkItems,
  createWorkItemAttachment,
  createWorkItemCommentAttachment,
  deleteWorkItemCommentAttachment,
  deleteWorkItemPrimaryPostAttachment,
  createWorkItemCommentDraft,
  createWorkItemComment,
  cancelWorkItemCommentDraft,
  createSystemApiToken,
  createProjectResource,
  createProjectResourceAttachment,
  deleteProjectResourceAttachment,
  deleteSystemApiToken,
  getWorkItemAttachmentUploadUrl,
  getProjectAttachmentPreview,
  getProjectResource,
  getProjectResourceAttachmentDownloadUrl,
  getProjectResourceAttachmentUploadUrl,
  getProjectResourceAttachmentPreview,
  getProjectResourceAttachments,
  getProjectResources,
  getSystemOpenApiView,
  getSystemDatabaseStats,
  getWorkItemCommentAttachmentDownloadUrl,
  getWorkItemCommentAttachmentUploadUrl,
  getWorkItemCommentAttachments,
  getWorkItemAttachmentDownloadUrl,
  getWorkItemAttachments,
  handoffWorkItem,
  markWorkItemAttachmentUploaded,
  markWorkItemCommentAttachmentUploaded,
  markProjectResourceAttachmentUploaded,
  publishWorkItemCommentDraft,
  archiveProjectResource,
  resetProjectResourcePassword,
  updateWorkItem,
  updateWorkItemComment,
  updateProjectResource,
  updateSystemApiToken,
  unlockProjectResource,
} from '../src/lib/api.js';

test('system OpenAPI token lifecycle is exposed through the bounded browser API adapter', async () => {
  await withFetchQueue([
    jsonResponse({ items: [], active_count: 0, token_limit: 100, can_manage_tokens: true }),
    jsonResponse({ refreshed_at: '2026-08-08T00:00:00Z', tables: [] }),
    jsonResponse({ csrf_token: 'csrf-openapi-create' }, { csrfToken: 'csrf-openapi-create' }),
    jsonResponse({ item: { id: 8 }, raw_token: 'yuance_sys_pat_once_only' }),
    jsonResponse({ csrf_token: 'csrf-openapi-update' }, { csrfToken: 'csrf-openapi-update' }),
    jsonResponse({ item: { id: 8 } }),
    jsonResponse({ csrf_token: 'csrf-openapi-delete' }, { csrfToken: 'csrf-openapi-delete' }),
    jsonResponse({ deleted: true }),
  ], async (calls) => {
    await getSystemOpenApiView();
    await getSystemDatabaseStats();
    await createSystemApiToken('Release robot', ['system_release:read']);
    await updateSystemApiToken(8, 'Release reader', ['system_release:read']);
    await deleteSystemApiToken(8);

    assert.deepEqual(calls.map(({ url, options }) => [url, options.method || 'GET']), [
      ['/api/v1/system/openapi-view', 'GET'],
      ['/api/v1/system/database-stats', 'GET'],
      ['/api/v1/auth/csrf', 'GET'],
      ['/api/v1/system/api-tokens', 'POST'],
      ['/api/v1/auth/csrf', 'GET'],
      ['/api/v1/system/api-tokens/8', 'PATCH'],
      ['/api/v1/auth/csrf', 'GET'],
      ['/api/v1/system/api-tokens/8', 'DELETE'],
    ]);
  });
});

test('batch work item updates are exposed through the bounded browser API adapter', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === '/api/v1/auth/csrf') return jsonResponse({ refreshed: true });
    return jsonResponse({ updated_count: 1, updated_item_keys: ['YCE-TASK-1'], failed_count: 0, failed_items: [] });
  };
  try {
    const result = await batchUpdateWorkItems({ projectKey: 'YCE', itemType: 'task', itemKeys: ['YCE-TASK-1'], action: 'priority', priority: 'P1' });
    assert.equal(result.updated_count, 1);
    assert.equal(calls.at(-1).url, '/api/v1/work-items/batch');
    assert.equal(calls.at(-1).options.method, 'POST');
    assert.equal(new Headers(calls.at(-1).options.headers).get('content-type'), 'application/json');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function jsonResponse(data, init = {}) {
  const body = init.error
    ? { error: init.error }
    : { data };
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: {
      'content-type': 'application/json',
      'x-yuance-csrf-token': init.csrfToken || 'csrf-test-token',
      ...(init.headers || {}),
    },
  });
}

function attachmentPayload(overrides = {}) {
  return {
    id: 7,
    file_object_id: 99,
    object_key: 'internal/object/key',
    filename: 'design.pdf',
    content_type: 'application/pdf',
    byte_size: 2048,
    status: 'uploaded',
    created_by: '系统管理员',
    created_at: '2026-07-30T12:00:00Z',
    ...overrides,
  };
}

function signedUrlPayload(overrides = {}) {
  return {
    attachment: attachmentPayload(overrides.attachment || {}),
    request: {
      method: 'GET',
      url: '/api/v1/test-storage/download?object_key=design.pdf',
      headers: [],
      ...(overrides.request || {}),
    },
    expires_in_seconds: 300,
  };
}

function resourcePayload(overrides = {}) {
  return {
    id: 9,
    project_key: 'YCE',
    title: '部署参数',
    category: 'integration',
    body: 'client_id=test',
    body_format: 'plain',
    summary: '联调所需参数',
    status: 'active',
    is_protected: false,
    tags: ['联调'],
    related_work_item: null,
    related_cycle: null,
    created_by: '系统管理员',
    updated_by: '系统管理员',
    created_at: '2026-08-07T08:00:00Z',
    updated_at: '2026-08-07T08:00:00Z',
    url: '/web/projects/YCE/resources/9',
    ...overrides,
  };
}

test('project resources are exposed through the bounded browser API adapter', async () => {
  await withFetchQueue([
    jsonResponse([resourcePayload({ body: '' })]),
    jsonResponse(resourcePayload()),
    jsonResponse({ csrf_token: 'csrf-resource-token' }, { csrfToken: 'csrf-resource-token' }),
    jsonResponse(resourcePayload({ is_protected: true })),
  ], async (calls) => {
    const resources = await getProjectResources('YCE', { q: 'client', tag: '联调' });
    const detail = await getProjectResource('YCE', 9);
    const unlocked = await unlockProjectResource('YCE', 9, 'safe-pass');

    assert.equal(resources[0].title, '部署参数');
    assert.equal(detail.body, 'client_id=test');
    assert.equal(unlocked.is_protected, true);
    assert.equal(calls[0].url, '/api/v1/projects/YCE/resources?q=client&tag=%E8%81%94%E8%B0%83');
    assert.equal(calls[1].url, '/api/v1/projects/YCE/resources/9');
    assert.equal(calls[3].url, '/api/v1/projects/YCE/resources/9/unlock');
    assert.equal(calls[3].options.method, 'POST');
    assert.equal(new Headers(calls[3].options.headers).get('x-yuance-csrf-token'), 'csrf-resource-token');
    assert.deepEqual(JSON.parse(String(calls[3].options.body)), { access_password: 'safe-pass' });
  });
});

test('project resource mutations share Browser JSON contracts', async () => {
  const resource = resourcePayload();
  await withFetchQueue([
    jsonResponse({ csrf_token: 'resource-write' }, { csrfToken: 'resource-write' }),
    jsonResponse(resource, { status: 201 }),
    jsonResponse({ csrf_token: 'resource-update' }, { csrfToken: 'resource-update' }),
    jsonResponse(resource),
    jsonResponse({ csrf_token: 'resource-archive' }, { csrfToken: 'resource-archive' }),
    jsonResponse({ ...resource, status: 'archived' }),
    jsonResponse({ csrf_token: 'resource-password-reset' }, { csrfToken: 'resource-password-reset' }),
    jsonResponse({ ...resource, is_protected: true }),
  ], async (calls) => {
    const payload = { title: '部署参数', category: 'integration', body: 'client_id=test', bodyFormat: 'plain', accessPassword: '', tags: ['联调'], relatedWorkItemKey: '', relatedCycleId: null };
    await createProjectResource('YCE', payload);
    await updateProjectResource('YCE', 9, { ...payload, accessPasswordAction: 'keep' });
    await archiveProjectResource('YCE', 9);
    await resetProjectResourcePassword('YCE', 9, { accessPasswordAction: 'set', accessPassword: 'new-pass' });
    assert.deepEqual(calls.filter(({ url }) => url.includes('/resources')).map(({ url, options }) => [url, options.method, options.body ? JSON.parse(String(options.body)) : undefined]), [
      ['/api/v1/projects/YCE/resources', 'POST', { title: '部署参数', category: 'integration', body: 'client_id=test', body_format: 'plain', access_password: '', tags: ['联调'], related_work_item_key: '', related_cycle_id: null }],
      ['/api/v1/projects/YCE/resources/9', 'PATCH', { title: '部署参数', category: 'integration', body: 'client_id=test', body_format: 'plain', access_password_action: 'keep', access_password: '', tags: ['联调'], related_work_item_key: '', related_cycle_id: null }],
      ['/api/v1/projects/YCE/resources/9', 'DELETE', undefined],
      ['/api/v1/projects/YCE/resources/9/password/reset', 'POST', { access_password_action: 'set', access_password: 'new-pass' }],
    ]);
    assert.deepEqual(calls.filter(({ url }) => url.includes('/resources')).map(({ options }) => new Headers(options.headers).get('x-yuance-csrf-token')), ['resource-write', 'resource-update', 'resource-archive', 'resource-password-reset']);
  });
});

test('project resource attachments use fixed Browser paths and access grants', async () => {
  const attachment = attachmentPayload({ id: 11, filename: 'notes.txt' });
  await withFetchQueue([
    jsonResponse([attachment]),
    jsonResponse({ csrf_token: 'resource-attachment-create' }, { csrfToken: 'resource-attachment-create' }),
    jsonResponse(attachment, { status: 201 }),
    jsonResponse(signedUrlPayload({ attachment })),
    jsonResponse({ csrf_token: 'resource-attachment-confirm' }, { csrfToken: 'resource-attachment-confirm' }),
    jsonResponse(attachment),
    jsonResponse(signedUrlPayload({ attachment })),
    jsonResponse({ attachment, preview: { kind: 'document', strategy: 'text', file_type: 'txt', kind_label: '文本', is_experimental: false, legacy_preview_enabled: false, content_enabled: true }, navigation: { position: 1, total: 1, previous: null, next: null }, content_url: '/api/v1/projects/YCE/resources/9/attachments/11/preview/content?access=grant+token', download_url: '/api/v1/projects/YCE/resources/9/attachments/11/download-url?access=grant+token' }),
    jsonResponse({ csrf_token: 'resource-attachment-delete' }, { csrfToken: 'resource-attachment-delete' }),
    jsonResponse({ ...attachment, status: 'deleted' }),
  ], async (calls) => {
    await getProjectResourceAttachments('YCE', 9, 'grant token');
    await createProjectResourceAttachment('YCE', 9, { originalFilename: 'notes.txt', contentType: 'text/plain', byteSize: 12, checksumSha256: 'a'.repeat(64) });
    await getProjectResourceAttachmentUploadUrl('YCE', 9, 11);
    await markProjectResourceAttachmentUploaded('YCE', 9, 11);
    await getProjectResourceAttachmentDownloadUrl('YCE', 9, 11, 'grant token');
    await getProjectResourceAttachmentPreview('YCE', 9, 11, 'grant token');
    await deleteProjectResourceAttachment('YCE', 9, 11);

    const businessCalls = calls.filter(({ url }) => url !== '/api/v1/auth/csrf');
    assert.deepEqual(businessCalls.map(({ url, options }) => [url, options.method]), [
      ['/api/v1/projects/YCE/resources/9/attachments?access=grant+token', undefined],
      ['/api/v1/projects/YCE/resources/9/attachments', 'POST'],
      ['/api/v1/projects/YCE/resources/9/attachments/11/upload-url', undefined],
      ['/api/v1/projects/YCE/resources/9/attachments/11/uploaded', 'POST'],
      ['/api/v1/projects/YCE/resources/9/attachments/11/download-url?access=grant+token', undefined],
      ['/api/v1/projects/YCE/resources/9/attachments/11/preview?access=grant+token', undefined],
      ['/api/v1/projects/YCE/resources/9/attachments/11', 'DELETE'],
    ]);
    assert.deepEqual(businessCalls.filter(({ options }) => options.method && options.method !== 'GET').map(({ options }) => new Headers(options.headers).get('x-yuance-csrf-token')), [
      'resource-attachment-create',
      'resource-attachment-confirm',
      'resource-attachment-delete',
    ]);
  });
});

test('project attachment preview is exposed through the bounded browser API adapter', async () => {
  await withFetchQueue([
    jsonResponse({
      attachment: attachmentPayload(),
      preview: { kind: 'document', strategy: 'pdf', file_type: 'pdf', kind_label: 'PDF', is_experimental: false, legacy_preview_enabled: false, content_enabled: true },
      navigation: { position: 1, total: 1, previous: null, next: null },
      content_url: '/api/v1/projects/YCE/attachments/7/preview/content',
      download_url: '/api/v1/projects/YCE/attachments/7/download-url',
    }),
  ], async (calls) => {
    const result = await getProjectAttachmentPreview('YCE', 7);
    assert.equal(result.preview.kind, 'document');
    assert.equal(calls[0].url, '/api/v1/projects/YCE/attachments/7/preview');
    assert.equal(calls[0].options.method, undefined);
  });
});

async function withFetchQueue(responses, callback) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    const nextResponse = responses.shift();
    assert.ok(nextResponse, `unexpected fetch call to ${url}`);
    if (typeof nextResponse === 'function') {
      return nextResponse(url, options);
    }
    return nextResponse;
  };

  try {
    await callback(calls);
    assert.equal(responses.length, 0, 'all queued fetch responses should be consumed');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('updateWorkItem refreshes CSRF and PATCHes the work item payload', async () => {
  await withFetchQueue([
    jsonResponse({ csrf_token: 'csrf-update-token' }, { csrfToken: 'csrf-update-token' }),
    jsonResponse({ key: 'YCE-TASK-2', title: '更新后的标题' }),
  ], async (calls) => {
    const result = await updateWorkItem('YCE-TASK-2', {
      title: '更新后的标题',
      priority: 'P1',
      description: '补充描述',
    });

    assert.equal(result.title, '更新后的标题');
    assert.equal(calls[0].url, '/api/v1/auth/csrf');
    assert.equal(calls[1].url, '/api/v1/work-items/YCE-TASK-2');
    assert.equal(calls[1].options.method, 'PATCH');
    const headers = new Headers(calls[1].options.headers);
    assert.equal(headers.get('content-type'), 'application/json');
    assert.equal(headers.get('x-yuance-csrf-token'), 'csrf-update-token');
    assert.deepEqual(JSON.parse(String(calls[1].options.body)), {
      title: '更新后的标题',
      priority: 'P1',
      description: '补充描述',
    });
  });
});

test('write clients retry once with a refreshed CSRF token after CSRF failure', async () => {
  await withFetchQueue([
    jsonResponse({ csrf_token: 'csrf-initial-token' }, { csrfToken: 'csrf-initial-token' }),
    jsonResponse(null, {
      status: 403,
      csrfToken: 'csrf-stale-token',
      error: { code: 'forbidden', message: 'CSRF token 校验失败。' },
    }),
    jsonResponse({ csrf_token: 'csrf-retry-token' }, { csrfToken: 'csrf-retry-token' }),
    jsonResponse({ key: 'YCE-TASK-2', title: '重试成功' }),
  ], async (calls) => {
    const result = await updateWorkItem('YCE-TASK-2', { title: '重试成功' });

    assert.equal(result.title, '重试成功');
    assert.equal(calls[1].url, '/api/v1/work-items/YCE-TASK-2');
    assert.equal(calls[3].url, '/api/v1/work-items/YCE-TASK-2');
    assert.equal(new Headers(calls[1].options.headers).get('x-yuance-csrf-token'), 'csrf-initial-token');
    assert.equal(new Headers(calls[3].options.headers).get('x-yuance-csrf-token'), 'csrf-retry-token');
  });
});

test('handoffWorkItem posts status, assignee and body to the encoded handoff path', async () => {
  await withFetchQueue([
    jsonResponse({ csrf_token: 'csrf-handoff-token' }, { csrfToken: 'csrf-handoff-token' }),
    jsonResponse({ key: 'YCE-TASK/2', status: 'pending_confirmation' }),
  ], async (calls) => {
    const result = await handoffWorkItem('YCE-TASK/2', {
      status: 'pending_confirmation',
      assigneeUsername: 'chen',
      body: '请确认这轮修改。',
    });

    assert.equal(result.status, 'pending_confirmation');
    assert.equal(calls[1].url, '/api/v1/work-items/YCE-TASK%2F2/handoff');
    assert.equal(calls[1].options.method, 'POST');
    const headers = new Headers(calls[1].options.headers);
    assert.equal(headers.get('content-type'), 'application/json');
    assert.equal(headers.get('x-yuance-csrf-token'), 'csrf-handoff-token');
    assert.deepEqual(JSON.parse(String(calls[1].options.body)), {
      status: 'pending_confirmation',
      assignee_username: 'chen',
      body: '请确认这轮修改。',
    });
  });
});

test('comment clients create and update plain text comments', async () => {
  await withFetchQueue([
    jsonResponse({ csrf_token: 'csrf-create-comment' }, { csrfToken: 'csrf-create-comment' }),
    jsonResponse({ id: 42, body: '新增评论', body_format: 'plain' }, { status: 201 }),
    jsonResponse({ csrf_token: 'csrf-update-comment' }, { csrfToken: 'csrf-update-comment' }),
    jsonResponse({ id: 42, body: '编辑后的评论', body_format: 'plain' }),
  ], async (calls) => {
    const created = await createWorkItemComment('YCE-TASK-2', { body: '新增评论' });
    const updated = await updateWorkItemComment('YCE-TASK-2', 42, { body: '编辑后的评论' });

    assert.equal(created.body_format, 'plain');
    assert.equal(updated.body, '编辑后的评论');
    assert.equal(calls[1].url, '/api/v1/work-items/YCE-TASK-2/comments');
    assert.equal(calls[1].options.method, 'POST');
    assert.equal(new Headers(calls[1].options.headers).get('x-yuance-csrf-token'), 'csrf-create-comment');
    assert.deepEqual(JSON.parse(String(calls[1].options.body)), {
      body: '新增评论',
      body_format: 'plain',
    });
    assert.equal(calls[3].url, '/api/v1/work-items/YCE-TASK-2/comments/42');
    assert.equal(calls[3].options.method, 'PATCH');
    assert.equal(new Headers(calls[3].options.headers).get('x-yuance-csrf-token'), 'csrf-update-comment');
    assert.deepEqual(JSON.parse(String(calls[3].options.body)), {
      body: '编辑后的评论',
      body_format: 'plain',
    });
  });
});

test('draft, publish and cancel comment clients use the expected paths and payloads', async () => {
  await withFetchQueue([
    jsonResponse({ csrf_token: 'csrf-draft-token' }, { csrfToken: 'csrf-draft-token' }),
    jsonResponse({ id: 50, body: '', body_format: 'plain', is_draft: true }, { status: 201 }),
    jsonResponse({ csrf_token: 'csrf-publish-token' }, { csrfToken: 'csrf-publish-token' }),
    jsonResponse({ id: 50, body: '发布草稿', body_format: 'html', is_draft: false }),
    jsonResponse({ csrf_token: 'csrf-cancel-token' }, { csrfToken: 'csrf-cancel-token' }),
    jsonResponse({ id: 51, body: '', body_format: 'html', is_draft: true }),
  ], async (calls) => {
    const draft = await createWorkItemCommentDraft('YCE-TASK-2', {
      body: '',
      parentCommentId: 42,
    });
    const published = await publishWorkItemCommentDraft('YCE-TASK-2', 50, {
      body: '<p>发布草稿</p>',
      bodyFormat: 'html',
    });
    const cancelled = await cancelWorkItemCommentDraft('YCE-TASK-2', 51);

    assert.equal(draft.is_draft, true);
    assert.equal(published.body_format, 'html');
    assert.equal(cancelled.is_draft, true);
    assert.equal(calls[1].url, '/api/v1/work-items/YCE-TASK-2/comments/draft');
    assert.equal(calls[1].options.method, 'POST');
    assert.deepEqual(JSON.parse(String(calls[1].options.body)), {
      body: '',
      body_format: 'plain',
      parent_comment_id: 42,
    });
    assert.equal(calls[3].url, '/api/v1/work-items/YCE-TASK-2/comments/50/publish');
    assert.equal(calls[3].options.method, 'POST');
    assert.deepEqual(JSON.parse(String(calls[3].options.body)), {
      body: '<p>发布草稿</p>',
      body_format: 'html',
    });
    assert.equal(calls[5].url, '/api/v1/work-items/YCE-TASK-2/comments/51/draft');
    assert.equal(calls[5].options.method, 'DELETE');
  });
});

test('attachment read clients use GET without CSRF refresh', async () => {
  await withFetchQueue([
    jsonResponse([attachmentPayload()]),
    jsonResponse(signedUrlPayload()),
  ], async (calls) => {
    const attachments = await getWorkItemAttachments('YCE-TASK-2');
    const download = await getWorkItemAttachmentDownloadUrl('YCE-TASK-2', 7);

    assert.equal(attachments[0].filename, 'design.pdf');
    assert.equal(Object.hasOwn(attachments[0], 'object_key'), false);
    assert.equal(Object.hasOwn(attachments[0], 'file_object_id'), false);
    assert.equal(download.request.method, 'GET');
    assert.equal(Object.hasOwn(download.attachment, 'object_key'), false);
    assert.equal(Object.hasOwn(download.attachment, 'file_object_id'), false);
    assert.equal(calls[0].url, '/api/v1/work-items/YCE-TASK-2/attachments');
    assert.equal(calls[0].options.method, undefined);
    assert.equal(calls[1].url, '/api/v1/work-items/YCE-TASK-2/attachments/7/download-url');
    assert.equal(calls.length, 2);
  });
});

test('work item attachment upload-url and uploaded clients handle query and CSRF', async () => {
  await withFetchQueue([
    jsonResponse(signedUrlPayload({ request: { method: 'PUT', url: '/upload' } })),
    jsonResponse({ csrf_token: 'csrf-uploaded-token' }, { csrfToken: 'csrf-uploaded-token' }),
    jsonResponse(attachmentPayload({ status: 'uploaded' })),
  ], async (calls) => {
    const signed = await getWorkItemAttachmentUploadUrl('YCE-TASK-2', 7, {
      expiresInSeconds: 120,
    });
    const uploaded = await markWorkItemAttachmentUploaded('YCE-TASK-2', 7);

    assert.equal(signed.request.method, 'PUT');
    assert.equal(uploaded.status, 'uploaded');
    assert.equal(calls[0].url, '/api/v1/work-items/YCE-TASK-2/attachments/7/upload-url?expires_in_seconds=120');
    assert.equal(calls[0].options.method, undefined);
    assert.equal(calls[2].url, '/api/v1/work-items/YCE-TASK-2/attachments/7/uploaded');
    assert.equal(calls[2].options.method, 'POST');
    assert.equal(new Headers(calls[2].options.headers).get('x-yuance-csrf-token'), 'csrf-uploaded-token');
  });
});

test('createWorkItemAttachment posts attachment metadata with CSRF', async () => {
  await withFetchQueue([
    jsonResponse({ csrf_token: 'csrf-attachment-token' }, { csrfToken: 'csrf-attachment-token' }),
    jsonResponse(attachmentPayload({ id: 9, filename: 'bug.png', status: 'pending' }), { status: 201 }),
  ], async (calls) => {
    const result = await createWorkItemAttachment('YCE-TASK-2', {
      originalFilename: 'bug.png',
      contentType: 'image/png',
      byteSize: 1024,
    });

    assert.equal(result.filename, 'bug.png');
    assert.equal(calls[1].url, '/api/v1/work-items/YCE-TASK-2/attachments');
    assert.equal(calls[1].options.method, 'POST');
    const headers = new Headers(calls[1].options.headers);
    assert.equal(headers.get('x-yuance-csrf-token'), 'csrf-attachment-token');
    assert.deepEqual(JSON.parse(String(calls[1].options.body)), {
      original_filename: 'bug.png',
      content_type: 'image/png',
      byte_size: 1024,
    });
  });
});

test('comment attachment clients cover list, create, delete, signed URLs and uploaded marker', async () => {
  await withFetchQueue([
    jsonResponse([attachmentPayload({ id: 11, filename: 'comment-log.txt' })]),
    jsonResponse({ csrf_token: 'csrf-comment-attachment' }, { csrfToken: 'csrf-comment-attachment' }),
    jsonResponse(attachmentPayload({ id: 12, filename: 'comment.png', status: 'pending' }), { status: 201 }),
    jsonResponse(signedUrlPayload({
      attachment: { id: 12, filename: 'comment.png' },
      request: { method: 'PUT', url: '/comment-upload' },
    })),
    jsonResponse({ csrf_token: 'csrf-comment-uploaded' }, { csrfToken: 'csrf-comment-uploaded' }),
    jsonResponse(attachmentPayload({ id: 12, filename: 'comment.png', status: 'uploaded' })),
    jsonResponse(signedUrlPayload({
      attachment: { id: 12, filename: 'comment.png' },
      request: { method: 'GET', url: '/comment-download' },
    })),
    jsonResponse({ csrf_token: 'csrf-comment-delete' }, { csrfToken: 'csrf-comment-delete' }),
    jsonResponse(attachmentPayload({ id: 12, filename: 'comment.png', status: 'deleted' })),
  ], async (calls) => {
    const attachments = await getWorkItemCommentAttachments('YCE-TASK/2', 42);
    const created = await createWorkItemCommentAttachment('YCE-TASK/2', 42, {
      originalFilename: 'comment.png',
      contentType: 'image/png',
      byteSize: 512,
    });
    const upload = await getWorkItemCommentAttachmentUploadUrl('YCE-TASK/2', 42, 12, {
      expiresInSeconds: 180,
    });
    const uploaded = await markWorkItemCommentAttachmentUploaded('YCE-TASK/2', 42, 12);
    const download = await getWorkItemCommentAttachmentDownloadUrl('YCE-TASK/2', 42, 12, {
      expiresInSeconds: 240,
    });
    const deleted = await deleteWorkItemCommentAttachment('YCE-TASK/2', 42, 12);

    assert.equal(attachments[0].filename, 'comment-log.txt');
    assert.equal(created.filename, 'comment.png');
    assert.equal(upload.request.method, 'PUT');
    assert.equal(uploaded.status, 'uploaded');
    assert.equal(download.request.method, 'GET');
    assert.equal(deleted.status, 'deleted');
    assert.equal(calls[0].url, '/api/v1/work-items/YCE-TASK%2F2/comments/42/attachments');
    assert.equal(calls[1].url, '/api/v1/auth/csrf');
    assert.equal(calls[2].url, '/api/v1/work-items/YCE-TASK%2F2/comments/42/attachments');
    assert.equal(calls[2].options.method, 'POST');
    assert.deepEqual(JSON.parse(String(calls[2].options.body)), {
      original_filename: 'comment.png',
      content_type: 'image/png',
      byte_size: 512,
    });
    assert.equal(calls[3].url, '/api/v1/work-items/YCE-TASK%2F2/comments/42/attachments/12/upload-url?expires_in_seconds=180');
    assert.equal(calls[5].url, '/api/v1/work-items/YCE-TASK%2F2/comments/42/attachments/12/uploaded');
    assert.equal(calls[5].options.method, 'POST');
    assert.equal(new Headers(calls[5].options.headers).get('x-yuance-csrf-token'), 'csrf-comment-uploaded');
    assert.equal(calls[6].url, '/api/v1/work-items/YCE-TASK%2F2/comments/42/attachments/12/download-url?expires_in_seconds=240');
    assert.equal(calls[7].url, '/api/v1/auth/csrf');
    assert.equal(calls[8].url, '/api/v1/work-items/YCE-TASK%2F2/comments/42/attachments/12');
    assert.equal(calls[8].options.method, 'DELETE');
    const deleteHeaders = new Headers(calls[8].options.headers);
    assert.equal(deleteHeaders.get('x-yuance-csrf-token'), 'csrf-comment-delete');
    assert.equal(deleteHeaders.get('x-yuance-editor-context'), 'work-item-comment-edit');
  });
});

test('primary post attachment deletion exposes the distinct bounded browser adapter', async () => {
  await withFetchQueue([
    jsonResponse({ csrf_token: 'csrf-primary-delete' }, { csrfToken: 'csrf-primary-delete' }),
    jsonResponse(attachmentPayload({ id: 13, filename: 'primary.txt', status: 'deleted' })),
  ], async (calls) => {
    const deleted = await deleteWorkItemPrimaryPostAttachment('YCE-TASK/2', 43, 13);
    assert.equal(deleted.status, 'deleted');
    assert.equal(calls[1].url, '/api/v1/work-items/YCE-TASK%2F2/comments/43/attachments/13');
    assert.equal(calls[1].options.method, 'DELETE');
    const headers = new Headers(calls[1].options.headers);
    assert.equal(headers.get('x-yuance-csrf-token'), 'csrf-primary-delete');
    assert.equal(headers.get('x-yuance-editor-context'), 'work-item-primary-post');
  });
});
