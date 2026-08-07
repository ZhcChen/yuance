import test from 'node:test';
import assert from 'node:assert/strict';
import { createSystemClient } from '../src/system.js';

test('system dashboard uses one fixed read contract', async () => {
  const calls = [];
  const client = createSystemClient({ request: async (url) => {
    calls.push(url);
    return { links: [] };
  } });

  assert.deepEqual(await client.getSystemDashboard(), { links: [] });
  assert.deepEqual(calls, ['/api/v1/system/dashboard']);
});

test('system users view preserves compact pagination query', async () => {
  const calls = [];
  const client = createSystemClient({ request: async (url) => {
    calls.push(url);
    return { items: [] };
  } });

  await client.getSystemUsersView();
  await client.getSystemUsersView({ page: 3, perPage: 20 });
  assert.deepEqual(calls, ['/api/v1/system/users-view', '/api/v1/system/users-view?page=3&per_page=20']);
});

test('system roles view preserves compact selection and pagination query', async () => {
  const calls = [];
  const client = createSystemClient({ request: async (url) => {
    calls.push(url);
    return { items: [] };
  } });

  await client.getSystemRolesView();
  await client.getSystemRolesView({ role: 'qa lead', page: 3, perPage: 20 });
  assert.deepEqual(calls, ['/api/v1/system/roles-view', '/api/v1/system/roles-view?role=qa+lead&page=3&per_page=20']);
});

test('system storage view preserves compact version pagination query', async () => {
  const calls = [];
  const client = createSystemClient({ request: async (url) => { calls.push(url); return { versions: [] }; } });

  await client.getSystemStorageView();
  await client.getSystemStorageView({ page: 3, perPage: 20 });
  assert.deepEqual(calls, ['/api/v1/system/storage-view', '/api/v1/system/storage-view?page=3&per_page=20']);
});

test('system OpenAPI token lifecycle uses fixed contracts and prepares every write', async () => {
  const calls = [];
  const client = createSystemClient({
    prepareWrite: async () => { calls.push(['prepare']); },
    request: async (url, options) => { calls.push([url, options]); return {}; },
  });
  await client.getSystemOpenApiView();
  await client.createSystemApiToken('Release robot', ['system_release:read', 'system_release:write']);
  await client.updateSystemApiToken(7, 'Release reader', ['system_release:read']);
  await client.deleteSystemApiToken(7);
  assert.deepEqual(calls, [
    ['/api/v1/system/openapi-view', undefined],
    ['prepare'], ['/api/v1/system/api-tokens', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"name":"Release robot","scopes":["system_release:read","system_release:write"]}' }],
    ['prepare'], ['/api/v1/system/api-tokens/7', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{"name":"Release reader","scopes":["system_release:read"]}' }],
    ['prepare'], ['/api/v1/system/api-tokens/7', { method: 'DELETE' }],
  ]);
});

test('system releases view preserves compact version pagination query', async () => {
  const calls = [];
  const client = createSystemClient({ request: async (url) => { calls.push(url); return { items: [] }; } });

  await client.getSystemReleasesView();
  await client.getSystemReleasesView({ page: 3, perPage: 20 });
  assert.deepEqual(calls, ['/api/v1/system/releases-view', '/api/v1/system/releases-view?page=3&per_page=20']);
});

test('system release mutations use fixed JSON contracts after write preparation', async () => {
  const calls = [];
  const client = createSystemClient({
    prepareWrite: async () => { calls.push(['prepare']); },
    request: async (url, options) => { calls.push([url, options]); return {}; },
  });

  await client.updateSystemReleaseSettings(8);
  await client.createSystemRelease({ versionName: 'v2.1.0', title: '桌面版本', notes: '内部验证', channel: 'internal', manifestSha256: 'a'.repeat(64), signingKeyId: 'release-key-1', sourceCommit: 'b'.repeat(40), sourceTag: 'desktop-v2.1.0' });
  await client.updateSystemRelease(7, { versionName: 'v2.1.0', title: '桌面版本修订', notes: '准备发布', publish: true });
  await client.verifySystemRelease(7);
  await client.withdrawSystemRelease(7, '发现阻断缺陷');

  assert.deepEqual(calls, [
    ['prepare'], ['/api/v1/system/releases/settings', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{"retention_count":8}' }],
    ['prepare'], ['/api/v1/system/releases', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ version_name: 'v2.1.0', title: '桌面版本', notes: '内部验证', channel: 'internal', manifest_sha256: 'a'.repeat(64), signing_key_id: 'release-key-1', source_commit: 'b'.repeat(40), source_tag: 'desktop-v2.1.0' }) }],
    ['prepare'], ['/api/v1/system/releases/7', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{"version_name":"v2.1.0","title":"桌面版本修订","notes":"准备发布","publish":true}' }],
    ['prepare'], ['/api/v1/system/releases/7/verify', { method: 'POST' }],
    ['prepare'], ['/api/v1/system/releases/7/withdraw', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"reason":"发现阻断缺陷","github_withdrawal_status":"pending"}' }],
  ]);
});

test('system release asset lifecycle uses fixed routes and strips private signed fields', async () => {
  const calls = [];
  const asset = { id: 19, release_id: 7, file_object_id: 11, object_key: 'private/release', platform: 'windows', architecture: 'x64', artifact_kind: 'installer', filename: 'desktop.exe', content_type: 'application/octet-stream', byte_size: 12, status: 'pending', checksum_sha256: 'a'.repeat(64), created_at: '2026-08-08T00:00:00Z' };
  const signed = { attachment: { id: 19, file_object_id: 11, object_key: 'private/release', filename: 'desktop.exe', content_type: 'application/octet-stream', byte_size: 12, status: 'pending', created_by: '', created_at: asset.created_at }, request: { method: 'PUT', url: '/private', headers: [] }, expires_in_seconds: 60, expires_at: asset.created_at, checksum_sha256: 'a'.repeat(64) };
  const client = createSystemClient({ prepareWrite: async () => { calls.push(['prepare']); }, request: async (url, options) => { calls.push([url, options]); if (url.includes('upload-url') || url.includes('download-url')) return signed; return asset; } });
  const created = await client.createSystemReleaseAsset(7, { platform: 'windows', architecture: 'x64', artifactKind: 'installer', originalFilename: 'desktop.exe', contentType: 'application/octet-stream', byteSize: 12, checksumSha256: 'a'.repeat(64) });
  const upload = await client.getSystemReleaseAssetUploadUrl(7, 19);
  await client.markSystemReleaseAssetUploaded(7, 19);
  await client.getSystemReleaseAssetDownloadUrl(7, 19);
  await client.deleteSystemReleaseAsset(7, 19);
  assert.equal(JSON.stringify(created).includes('object_key'), false);
  assert.deepEqual(Object.keys(upload.attachment).sort(), ['byte_size', 'content_type', 'created_at', 'filename', 'id', 'status']);
  assert.equal(JSON.stringify(upload.attachment).includes('file_object_id'), false);
  assert.deepEqual(calls.map((entry) => entry[0]), ['prepare', '/api/v1/system/releases/7/assets', '/api/v1/system/releases/7/assets/19/upload-url?expires_in_seconds=60', 'prepare', '/api/v1/system/releases/7/assets/19/uploaded', '/api/v1/system/releases/7/assets/19/download-url?expires_in_seconds=60', 'prepare', '/api/v1/system/releases/7/assets/19']);
});

test('system storage mutations use fixed JSON contracts after write preparation', async () => {
  const calls = [];
  const client = createSystemClient({
    prepareWrite: async () => { calls.push(['prepare']); },
    request: async (url, options) => { calls.push([url, options]); return {}; },
  });

  await client.saveStorageConfig({ endpoint: 'https://oss.example', region: 'cn-test', bucket: 'yuance-files', accessKeyId: 'AKIAEXAMPLE', accessKeySecret: 'SecretValue', activate: true });
  await client.probeStorageConfig();
  await client.initializeStorageConfig();
  await client.rollbackStorageConfig(7);

  assert.deepEqual(calls, [
    ['prepare'], ['/api/v1/storage/config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: 'https://oss.example', region: 'cn-test', bucket: 'yuance-files', access_key_id: 'AKIAEXAMPLE', access_key_secret: 'SecretValue', activate: true }) }],
    ['prepare'], ['/api/v1/storage/config/probe', { method: 'POST' }],
    ['prepare'], ['/api/v1/storage/config/initialize', { method: 'POST' }],
    ['prepare'], ['/api/v1/storage/config/versions/7/rollback', { method: 'POST' }],
  ]);
});

test('system role mutations use fixed JSON contracts after write preparation', async () => {
  const calls = [];
  const client = createSystemClient({
    prepareWrite: async () => { calls.push(['prepare']); },
    request: async (url, options) => { calls.push([url, options]); return {}; },
  });
  await client.createSystemRole('qa_lead', '质量负责人', 'all');
  await client.updateSystemRoleStatus('qa_lead', 'disabled');
  await client.updateSystemRolePermissions('qa_lead', ['system.dashboard.view']);
  assert.deepEqual(calls, [
    ['prepare'], ['/api/v1/system/roles', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"role_code":"qa_lead","role_name":"质量负责人","data_scope_type":"all"}' }],
    ['prepare'], ['/api/v1/system/roles/qa_lead/status', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{"status":"disabled"}' }],
    ['prepare'], ['/api/v1/system/roles/qa_lead/permissions', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{"permission_keys":["system.dashboard.view"]}' }],
  ]);
});

test('system user mutations use fixed JSON contracts after write preparation', async () => {
  const calls = [];
  const client = createSystemClient({
    prepareWrite: async () => { calls.push(['prepare']); },
    request: async (url, options) => { calls.push([url, options]); return { username: 'alice' }; },
  });
  await client.createSystemUser({ username: 'alice', displayName: 'Alice', email: 'alice@example.test', mobile: '', password: 'AlicePass2026!', roleCode: 'member' });
  await client.updateSystemUserStatus('alice', 'disabled');
  await client.updateSystemUserRole('alice', 'viewer');
  await client.resetSystemUserPassword('alice', 'NewAlicePass2026!');
  await client.assignSystemUserProjects('alice', ['YCE', 'OPS'], 'viewer');
  await client.removeSystemUserProjects('alice', ['OPS']);
  await client.removeSystemUserProject('alice', 'YCE');
  await client.updateSystemUserProjectRole('alice', 'OPS', 'maintainer');

  assert.deepEqual(calls, [
    ['prepare'],
    ['/api/v1/system/users', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'alice', display_name: 'Alice', email: 'alice@example.test', mobile: '', password: 'AlicePass2026!', role_code: 'member' }) }],
    ['prepare'], ['/api/v1/system/users/alice/status', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{"status":"disabled"}' }],
    ['prepare'], ['/api/v1/system/users/alice/role', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{"role_code":"viewer"}' }],
    ['prepare'], ['/api/v1/system/users/alice/password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"password":"NewAlicePass2026!"}' }],
    ['prepare'], ['/api/v1/system/users/alice/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"project_keys":["YCE","OPS"],"member_role":"viewer"}' }],
    ['prepare'], ['/api/v1/system/users/alice/projects', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: '{"project_keys":["OPS"]}' }],
    ['prepare'], ['/api/v1/system/users/alice/projects/YCE', { method: 'DELETE' }],
    ['prepare'], ['/api/v1/system/users/alice/projects/OPS/role', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{"member_role":"maintainer"}' }],
  ]);
});
