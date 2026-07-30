import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createWorkItemAttachment,
  createWorkItemCommentAttachment,
  createWorkItemCommentDraft,
  createWorkItemComment,
  getWorkItemAttachmentUploadUrl,
  getWorkItemCommentAttachmentDownloadUrl,
  getWorkItemCommentAttachmentUploadUrl,
  getWorkItemCommentAttachments,
  getWorkItemAttachmentDownloadUrl,
  getWorkItemAttachments,
  handoffWorkItem,
  markWorkItemAttachmentUploaded,
  markWorkItemCommentAttachmentUploaded,
  publishWorkItemCommentDraft,
  updateWorkItem,
  updateWorkItemComment,
} from '../src/lib/api.js';

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

test('draft and publish comment clients use the expected paths and payloads', async () => {
  await withFetchQueue([
    jsonResponse({ csrf_token: 'csrf-draft-token' }, { csrfToken: 'csrf-draft-token' }),
    jsonResponse({ id: 50, body: '', body_format: 'plain', is_draft: true }, { status: 201 }),
    jsonResponse({ csrf_token: 'csrf-publish-token' }, { csrfToken: 'csrf-publish-token' }),
    jsonResponse({ id: 50, body: '发布草稿', body_format: 'html', is_draft: false }),
  ], async (calls) => {
    const draft = await createWorkItemCommentDraft('YCE-TASK-2', {
      body: '',
      parentCommentId: 42,
    });
    const published = await publishWorkItemCommentDraft('YCE-TASK-2', 50, {
      body: '<p>发布草稿</p>',
      bodyFormat: 'html',
    });

    assert.equal(draft.is_draft, true);
    assert.equal(published.body_format, 'html');
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

test('comment attachment clients cover list, create, signed URLs and uploaded marker', async () => {
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

    assert.equal(attachments[0].filename, 'comment-log.txt');
    assert.equal(created.filename, 'comment.png');
    assert.equal(upload.request.method, 'PUT');
    assert.equal(uploaded.status, 'uploaded');
    assert.equal(download.request.method, 'GET');
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
  });
});
