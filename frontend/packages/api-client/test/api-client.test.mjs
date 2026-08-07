import test from 'node:test';
import assert from 'node:assert/strict';

import {
  API_CLIENT_PACKAGE_NAME,
  ApiError,
  apiErrorFromPayload,
  attachmentFromPayload,
  createApiClient,
  projectApiPath,
  projectAttachmentApiPath,
  projectAttachmentPreviewApiPath,
  projectCycleApiPath,
  projectMemberApiPath,
  projectPersonalAnalysisApiPath,
  projectResourceApiPath,
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

test('project resources normalize list detail and unlock responses', async () => {
  const calls = [];
  const writes = [];
  const resource = { id: 9, project_key: 'YCE', title: '发布手册', category: 'development', body: '', body_format: 'markdown', summary: '受保护资料', status: 'active', is_protected: true, tags: ['release'], related_work_item: null, related_cycle: null, created_by: 'Alice', updated_by: 'Alice', created_at: '2026-08-07T00:00:00Z', updated_at: '2026-08-07T00:00:00Z', url: '/web/projects/YCE/resources/9', object_key: 'secret' };
  const client = createApiClient({ request: async (url, options = {}) => { calls.push({ url, options }); return url.endsWith('/resources') || url.includes('/resources?') ? [resource] : { ...resource, body: url.endsWith('/unlock') ? '正文' : '' }; }, prepareWrite: async () => { writes.push('prepare'); } });
  const listed = await client.getProjectResources('YCE', { q: '发布', category: 'development', relatedCycleId: 7 });
  const detail = await client.getProjectResource('YCE', 9);
  const unlocked = await client.unlockProjectResource('YCE', 9, 'vault-pass');
  assert.equal(projectResourceApiPath('YCE', 9), '/api/v1/projects/YCE/resources/9');
  assert.equal(listed[0].title, '发布手册'); assert.equal(detail.is_protected, true); assert.equal(unlocked.body, '正文');
  assert.equal(Object.hasOwn(listed[0], 'object_key'), false);
  assert.deepEqual(calls.map(({ url, options }) => [url, options.method || 'GET', options.body]), [
    ['/api/v1/projects/YCE/resources?q=%E5%8F%91%E5%B8%83&category=development&related_cycle_id=7', 'GET', undefined],
    ['/api/v1/projects/YCE/resources/9', 'GET', undefined],
    ['/api/v1/projects/YCE/resources/9/unlock', 'POST', '{"access_password":"vault-pass"}'],
  ]);
  assert.deepEqual(writes, ['prepare']);
});

test('project resource mutations use fixed JSON contracts', async () => {
  const calls = [];
  const resource = { id: 9, project_key: 'YCE', title: '资料', category: 'other', body: '正文', body_format: 'plain', summary: '正文', status: 'active', is_protected: false, tags: ['发布'], related_work_item: null, related_cycle: null, created_by: 'Alice', updated_by: 'Alice', created_at: '2026-08-07T00:00:00Z', updated_at: '2026-08-07T00:00:00Z', url: '/web/projects/YCE/resources/9' };
  const client = createApiClient({ request: async (url, options = {}) => { calls.push({ url, options }); return resource; }, prepareWrite: async () => {} });
  const payload = { title: '资料', category: 'other', body: '正文', bodyFormat: 'plain', accessPassword: '', tags: ['发布'], relatedWorkItemKey: '', relatedCycleId: null };
  await client.createProjectResource('YCE', payload);
  await client.updateProjectResource('YCE', 9, { ...payload, accessPasswordAction: 'keep' });
  await client.archiveProjectResource('YCE', 9);
  assert.deepEqual(calls.map(({ url, options }) => [url, options.method, options.body ? JSON.parse(options.body) : undefined]), [
    ['/api/v1/projects/YCE/resources', 'POST', { title: '资料', category: 'other', body: '正文', body_format: 'plain', access_password: '', tags: ['发布'], related_work_item_key: '', related_cycle_id: null }],
    ['/api/v1/projects/YCE/resources/9', 'PATCH', { title: '资料', category: 'other', body: '正文', body_format: 'plain', access_password_action: 'keep', access_password: '', tags: ['发布'], related_work_item_key: '', related_cycle_id: null }],
    ['/api/v1/projects/YCE/resources/9', 'DELETE', undefined],
  ]);
});

test('project resource attachments use scoped fixed paths and access grants', async () => {
  const calls = [];
  const writes = [];
  const attachment = { id: 11, filename: 'notes.txt', content_type: 'text/plain', byte_size: 12, status: 'uploaded', created_by: 'Alice', created_at: '2026-08-07T00:00:00Z' };
  const signed = { attachment, request: { method: 'GET', url: '/signed', headers: [] }, expires_in_seconds: 60 };
  const preview = { attachment, preview: { kind: 'document', strategy: 'text', file_type: 'txt', kind_label: '文本', is_experimental: false, legacy_preview_enabled: false, content_enabled: true }, navigation: { position: 1, total: 1, previous: null, next: null }, content_url: '/api/v1/projects/YCE/resources/9/attachments/11/preview/content?access=grant+token', download_url: '/api/v1/projects/YCE/resources/9/attachments/11/download-url?access=grant+token' };
  const client = createApiClient({ request: async (url, options = {}) => { calls.push({ url, options }); return url.includes('/preview?') ? preview : options.method === undefined && /\/attachments(?:\?|$)/u.test(url) ? [attachment] : url.includes('-url') ? signed : attachment; }, prepareWrite: async () => { writes.push('prepare'); } });
  await client.getProjectResourceAttachments('YCE', 9, 'grant token');
  await client.createProjectResourceAttachment('YCE', 9, { originalFilename: 'notes.txt', contentType: 'text/plain', byteSize: 12, checksumSha256: 'a'.repeat(64) });
  await client.getProjectResourceAttachmentUploadUrl('YCE', 9, 11);
  await client.markProjectResourceAttachmentUploaded('YCE', 9, 11);
  await client.getProjectResourceAttachmentDownloadUrl('YCE', 9, 11, 'grant token');
  await client.getProjectResourceAttachmentPreview('YCE', 9, 11, 'grant token');
  await client.deleteProjectResourceAttachment('YCE', 9, 11);
  assert.deepEqual(calls.map(({ url, options }) => [url, options.method || 'GET']), [
    ['/api/v1/projects/YCE/resources/9/attachments?access=grant+token', 'GET'],
    ['/api/v1/projects/YCE/resources/9/attachments', 'POST'],
    ['/api/v1/projects/YCE/resources/9/attachments/11/upload-url', 'GET'],
    ['/api/v1/projects/YCE/resources/9/attachments/11/uploaded', 'POST'],
    ['/api/v1/projects/YCE/resources/9/attachments/11/download-url?access=grant+token', 'GET'],
    ['/api/v1/projects/YCE/resources/9/attachments/11/preview?access=grant+token', 'GET'],
    ['/api/v1/projects/YCE/resources/9/attachments/11', 'DELETE'],
  ]);
  assert.deepEqual(writes, ['prepare', 'prepare', 'prepare']);
});

test('project resources accept the complete unpaginated server response', async () => {
  const resource = { id: 1, project_key: 'YCE', title: '资料', category: 'development', body: '', body_format: 'markdown', summary: '', status: 'active', is_protected: false, tags: [], related_work_item: null, related_cycle: null, created_by: 'Alice', updated_by: 'Alice', created_at: '2026-08-07T00:00:00Z', updated_at: '2026-08-07T00:00:00Z', url: '/web/projects/YCE/resources/1' };
  const client = createApiClient({ request: async () => Array.from({ length: 501 }, (_, index) => ({ ...resource, id: index + 1, url: `/web/projects/YCE/resources/${index + 1}` })), prepareWrite: async () => {} });
  const resources = await client.getProjectResources('YCE');
  assert.equal(resources.length, 501);
  assert.equal(resources[500].id, 501);
});

test('project cycle methods share fixed paths and write payloads', async () => {
  const { client, calls, writes } = createRecordedClient();
  const payload = { name: 'Sprint 1', goal: 'Ship', description: 'Cycle', ownerUsername: 'alice', startDate: '2026-08-01', endDate: '2026-08-31' };
  await client.getProjectCycles('YCE'); await client.getProjectCycle('YCE', 7);
  await client.createProjectCycle('YCE', payload); await client.updateProjectCycle('YCE', 7, payload); await client.closeProjectCycle('YCE', 7);
  assert.equal(projectCycleApiPath('YCE', 7), '/api/v1/projects/YCE/cycles/7');
  assert.deepEqual(writes, ['prepare', 'prepare', 'prepare']);
  assert.deepEqual(calls.map(({ url, options }) => [url, options.method || 'GET', options.body ? JSON.parse(options.body) : undefined]), [
    ['/api/v1/projects/YCE/cycles', 'GET', undefined], ['/api/v1/projects/YCE/cycles/7', 'GET', undefined],
    ['/api/v1/projects/YCE/cycles', 'POST', { name: 'Sprint 1', goal: 'Ship', description: 'Cycle', owner_username: 'alice', start_date: '2026-08-01', end_date: '2026-08-31' }],
    ['/api/v1/projects/YCE/cycles/7', 'PATCH', { name: 'Sprint 1', goal: 'Ship', description: 'Cycle', owner_username: 'alice', start_date: '2026-08-01', end_date: '2026-08-31' }],
    ['/api/v1/projects/YCE/cycles/7/close', 'POST', undefined],
  ]);
});

test('project personal analysis uses its fixed read path', async () => {
  const { client, calls, writes } = createRecordedClient();
  await client.getProjectPersonalAnalysis('YCE');
  assert.equal(projectPersonalAnalysisApiPath('YCE'), '/api/v1/projects/YCE/my-analysis');
  assert.deepEqual(calls.map(({ url, options }) => [url, options.method || 'GET']), [
    ['/api/v1/projects/YCE/my-analysis', 'GET'],
  ]);
  assert.deepEqual(writes, []);
});

test('project attachment methods use fixed paths and filter private fields', async () => {
  const { client, calls, writes } = createRecordedClient();
  const created = await client.createProjectAttachment('YCE/1', { originalFilename: 'design.pdf', contentType: 'application/pdf', byteSize: 2048 });
  await client.getProjectAttachments('YCE/1');
  const signed = await client.getProjectAttachmentUploadUrl('YCE/1', 7, { expiresInSeconds: 60 });
  await client.markProjectAttachmentUploaded('YCE/1', 7);
  await client.getProjectAttachmentDownloadUrl('YCE/1', 7);
  await client.archiveProjectAttachment('YCE/1', 7);
  assert.equal(projectAttachmentApiPath('YCE/1', 7), '/api/v1/projects/YCE%2F1/attachments/7');
  assert.equal(Object.hasOwn(created, 'object_key'), false);
  assert.equal(Object.hasOwn(signed.attachment, 'file_object_id'), false);
  assert.deepEqual(writes, ['prepare', 'prepare', 'prepare']);
  assert.deepEqual(calls.map(({ url, options }) => [url, options.method || 'GET']), [
    ['/api/v1/projects/YCE%2F1/attachments', 'POST'],
    ['/api/v1/projects/YCE%2F1/attachments', 'GET'],
    ['/api/v1/projects/YCE%2F1/attachments/7/upload-url?expires_in_seconds=60', 'GET'],
    ['/api/v1/projects/YCE%2F1/attachments/7/uploaded', 'POST'],
    ['/api/v1/projects/YCE%2F1/attachments/7/download-url', 'GET'],
    ['/api/v1/projects/YCE%2F1/attachments/7', 'DELETE'],
  ]);
});

test('project attachment preview normalizes capability and navigation without private fields', async () => {
  const calls = [];
  const client = createApiClient({ request: async (url) => {
    calls.push(url);
    return {
      attachment: { id: 7, filename: 'design.pdf', content_type: 'application/pdf', byte_size: 2048, status: 'uploaded', created_by: 'Alice', created_at: '2026-08-07T00:00:00Z', object_key: 'private/key' },
      preview: { kind: 'document', strategy: 'pdf', file_type: 'pdf', kind_label: 'PDF', is_experimental: false, legacy_preview_enabled: false, content_enabled: true },
      navigation: { position: 1, total: 2, previous: null, next: { id: 8, title: 'next.png', url: '/api/v1/projects/YCE/attachments/8/preview' } },
      content_url: '/api/v1/projects/YCE/attachments/7/preview/content',
      download_url: '/api/v1/projects/YCE/attachments/7/download-url',
    };
  } });
  const result = await client.getProjectAttachmentPreview('YCE', 7);
  assert.equal(projectAttachmentPreviewApiPath('YCE', 7), '/api/v1/projects/YCE/attachments/7/preview');
  assert.deepEqual(calls, ['/api/v1/projects/YCE/attachments/7/preview']);
  assert.equal(result.preview.kind, 'document');
  assert.ok(result.navigation.next);
  assert.equal(result.navigation.next.id, 8);
  assert.equal(Object.hasOwn(result.attachment, 'object_key'), false);
});

test('work item paths encode item keys', () => {
  assert.equal(workItemApiPath('YCE-TASK/2'), '/api/v1/work-items/YCE-TASK%2F2');
});

test('work item list preserves cycle and allowlisted sort query', async () => {
  const { client, calls } = createRecordedClient();
  await client.getWorkItems({ itemType: 'task', projectKey: 'yce', cycleId: 7, sort: 'due_date_asc', page: 2, perPage: 20 });
  assert.equal(calls[0].url, '/api/v1/work-items?item_type=task&project_key=YCE&cycle_id=7&sort=due_date_asc&page=2&per_page=20');
});

test('work item list view uses the atomic shared page endpoint', async () => {
  const { client, calls } = createRecordedClient();
  await client.getWorkItemListView({ itemType: 'bug', projectKey: 'yce', cycleId: 7, sort: 'updated_desc', page: 1, perPage: 10 });
  assert.equal(calls[0].url, '/api/v1/work-item-list-view?item_type=bug&project_key=YCE&cycle_id=7&sort=updated_desc&page=1&per_page=10');
});

test('work item saved views use fixed JSON mutation contracts', async () => {
  const { client, calls, writes } = createRecordedClient();
  await client.createWorkItemSavedView({ projectKey: 'YCE', itemType: 'task', name: '重点任务', status: 'open', cycleId: '7', sort: 'updated_desc', perPage: 20, isDefault: true });
  await client.renameWorkItemSavedView(9, '核心任务');
  await client.setDefaultWorkItemSavedView(9);
  await client.deleteWorkItemSavedView(9);
  assert.deepEqual(writes, ['prepare', 'prepare', 'prepare', 'prepare']);
  assert.deepEqual(calls.map(({ url, options }) => [options?.method, url]), [
    ['POST', '/api/v1/work-item-saved-views'],
    ['PATCH', '/api/v1/work-item-saved-views/9'],
    ['POST', '/api/v1/work-item-saved-views/9/default'],
    ['DELETE', '/api/v1/work-item-saved-views/9'],
  ]);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    project_key: 'YCE', item_type: 'task', name: '重点任务', q: '', status: 'open', priority: '',
    assignee_username: '', cycle_id: '7', sort: 'updated_desc', per_page: 20, is_default: true,
  });
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

test('createProject uses the shared write contract', async () => {
  const { client, calls, writes } = createRecordedClient();
  await client.createProject({ name: '新项目', description: '说明', status: 'not_started', startDate: '2026-08-08', dueDate: '2026-08-31' });
  assert.deepEqual(writes, ['prepare']);
  assert.equal(calls[0].url, '/api/v1/projects');
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(String(calls[0].options.body)), { name: '新项目', description: '说明', status: 'not_started', start_date: '2026-08-08', due_date: '2026-08-31' });
});

test('project detail and member methods use one shared write contract', async () => {
  const { client, calls, writes } = createRecordedClient();
  await client.getProject('YCE/1');
  await client.getProjectMembers('YCE/1');
  await client.updateProject('YCE/1', { name: '项目', ownerUsername: 'alice', dueDate: '' });
  await client.addProjectMember('YCE/1', { username: 'bob', memberRole: 'member' });
  await client.updateProjectMemberRole('YCE/1', 'bob/2', 'maintainer');
  await client.removeProjectMember('YCE/1', 'bob/2');
  assert.equal(projectApiPath('YCE/1'), '/api/v1/projects/YCE%2F1');
  assert.equal(projectMemberApiPath('YCE/1', 'bob/2'), '/api/v1/projects/YCE%2F1/members/bob%2F2');
  assert.deepEqual(writes, ['prepare', 'prepare', 'prepare', 'prepare']);
  assert.deepEqual(calls.map(({ url, options }) => [url, options.method || 'GET', options.body ? JSON.parse(options.body) : undefined]), [
    ['/api/v1/projects/YCE%2F1', 'GET', undefined],
    ['/api/v1/projects/YCE%2F1/members', 'GET', undefined],
    ['/api/v1/projects/YCE%2F1', 'PATCH', { name: '项目', owner_username: 'alice', due_date: '' }],
    ['/api/v1/projects/YCE%2F1/members', 'POST', { username: 'bob', member_role: 'member' }],
    ['/api/v1/projects/YCE%2F1/members/bob%2F2', 'PATCH', { member_role: 'maintainer' }],
    ['/api/v1/projects/YCE%2F1/members/bob%2F2', 'DELETE', undefined],
  ]);
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

test('account security client uses fixed JSON and destructive routes', async () => {
  const { client, calls, writes } = createRecordedClient();
  await client.updateOwnPassword({ currentPassword: 'OldPass2026!', newPassword: 'NewPass2026!', newPasswordConfirm: 'NewPass2026!' });
  await client.createApiToken({ name: 'Agent', scopes: ['project:read'], projectScope: 'all' });
  await client.updateApiToken(7, { name: 'Agent 2', scopes: ['work_item:read'], projectScope: 'all' });
  await client.deleteApiToken(7);
  await client.revokeDeviceSession('family-1');
  assert.equal(writes.length, 5);
  assert.deepEqual(calls.map(({ url, options }) => [url, options.method]), [
    ['/api/v1/me/password', 'PATCH'], ['/api/v1/me/tokens', 'POST'], ['/api/v1/me/tokens/7', 'PATCH'],
    ['/api/v1/me/tokens/7', 'DELETE'], ['/api/v1/me/device-sessions/family-1', 'DELETE'],
  ]);
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
