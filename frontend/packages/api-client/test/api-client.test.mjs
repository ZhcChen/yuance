import test from 'node:test';
import assert from 'node:assert/strict';

import {
  API_CLIENT_PACKAGE_NAME,
  ApiError,
  apiErrorFromPayload,
  attachmentFromPayload,
  createApiClient,
  workItemApiPath,
} from '@yuance/frontend-api-client';

function createRecordedClient() {
  const calls = [];
  const writes = [];
  const client = createApiClient({
    async request(url, options = {}) {
      calls.push({ url, options });
      return {
        ok: true,
        attachment: {
          id: 7,
          file_object_id: 99,
          object_key: 'internal/object/key',
          filename: 'design.pdf',
          content_type: 'application/pdf',
          byte_size: 2048,
          status: 'uploaded',
          created_by: '系统管理员',
          created_at: '2026-07-30T12:00:00Z',
        },
        request: {
          method: 'PUT',
          url: '/upload',
          headers: [],
        },
        expires_in_seconds: 300,
      };
    },
    async prepareWrite() {
      writes.push('prepare');
    },
  });
  return { client, calls, writes };
}

test('api-client exposes package root marker', () => {
  assert.equal(API_CLIENT_PACKAGE_NAME, '@yuance/frontend-api-client');
});

test('work item paths encode item keys', () => {
  assert.equal(workItemApiPath('YCE-TASK/2'), '/api/v1/work-items/YCE-TASK%2F2');
});

test('updateWorkItem uses injected transport and JSON payload without CSRF logic', async () => {
  const { client, calls, writes } = createRecordedClient();

  await client.updateWorkItem('YCE-TASK/2', {
    title: '更新标题',
    priority: 'p1',
    description: undefined,
  });

  assert.deepEqual(writes, ['prepare']);
  assert.equal(calls[0].url, '/api/v1/work-items/YCE-TASK%2F2');
  assert.equal(calls[0].options.method, 'PATCH');
  assert.deepEqual(JSON.parse(String(calls[0].options.body)), {
    title: '更新标题',
    priority: 'p1',
  });
});

test('attachment DTO drops internal object storage fields', async () => {
  const { client, calls, writes } = createRecordedClient();

  const result = await client.getWorkItemAttachmentUploadUrl('YCE-TASK-2', 7, {
    expiresInSeconds: 120,
  });

  assert.equal(calls[0].url, '/api/v1/work-items/YCE-TASK-2/attachments/7/upload-url?expires_in_seconds=120');
  assert.deepEqual(writes, []);
  assert.equal(result.attachment.filename, 'design.pdf');
  assert.equal(Object.hasOwn(result.attachment, 'object_key'), false);
  assert.equal(Object.hasOwn(result.attachment, 'file_object_id'), false);
});

test('notification write client prepares host write and posts expected path', async () => {
  const { client, calls, writes } = createRecordedClient();

  await client.markNotificationRead(42);

  assert.deepEqual(writes, ['prepare']);
  assert.equal(calls[0].url, '/api/v1/notifications/42/read');
  assert.equal(calls[0].options.method, 'POST');
});

test('search uses a normalized read-only query contract', async () => {
  const { client, calls, writes } = createRecordedClient();

  await client.search({ q: '  登录失败  ', page: 2, perPage: 20 });

  assert.deepEqual(writes, []);
  assert.equal(calls[0].url, '/api/v1/search?q=%E7%99%BB%E5%BD%95%E5%A4%B1%E8%B4%A5&page=2&per_page=20');
  assert.deepEqual(calls[0].options, {});
});

test('profile client reads and updates through the shared write preparation', async () => {
  const { client, calls, writes } = createRecordedClient();
  await client.getOwnProfile();
  await client.updateOwnProfile({ displayName: '管理员', email: 'admin@example.com', mobile: '13800000000' });

  assert.deepEqual(writes, ['prepare']);
  assert.equal(calls[0].url, '/api/v1/me/profile');
  assert.deepEqual(calls[0].options, {});
  assert.equal(calls[1].url, '/api/v1/me/profile');
  assert.equal(calls[1].options.method, 'PATCH');
  assert.deepEqual(JSON.parse(String(calls[1].options.body)), {
    display_name: '管理员', email: 'admin@example.com', mobile: '13800000000',
  });
});

test('apiErrorFromPayload preserves server error code and message', () => {
  const error = apiErrorFromPayload({
    error: {
      code: 'forbidden',
      message: 'CSRF token 校验失败。',
    },
  });

  assert.ok(error instanceof ApiError);
  assert.equal(error.code, 'forbidden');
  assert.equal(error.message, 'CSRF token 校验失败。');
});

test('attachmentFromPayload normalizes unknown raw payloads', () => {
  const attachment = attachmentFromPayload({
    id: 3,
    filename: 'demo.txt',
    object_key: 'private/key',
  });

  assert.equal(attachment.id, 3);
  assert.equal(attachment.filename, 'demo.txt');
  assert.equal(Object.hasOwn(attachment, 'object_key'), false);
});
