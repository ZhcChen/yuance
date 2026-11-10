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

test('system permissions use one fixed read contract', async () => {
  const calls = [];
  const client = createSystemClient({ request: async (url) => { calls.push(url); return []; } });
  assert.deepEqual(await client.getSystemPermissions(), []);
  assert.deepEqual(calls, ['/api/v1/system/permissions']);
});

test('system database stats use one fixed read contract', async () => {
  const calls = [];
  const snapshot = { refreshed_at: '2026-08-08T00:00:00Z', tables: [] };
  const client = createSystemClient({ request: async (url) => { calls.push(url); return snapshot; } });
  assert.deepEqual(await client.getSystemDatabaseStats(), snapshot);
  assert.deepEqual(calls, ['/api/v1/system/database-stats']);
});

test('system audit logs preserve compact filters and pagination', async () => {
  const calls = [];
  const client = createSystemClient({ request: async (url) => { calls.push(url); return { items: [] }; } });
  await client.getSystemAuditLogs();
  await client.getSystemAuditLogs({ actor: ' Alice ', action: 'auth.login', targetType: 'user', targetId: '7', page: 2, perPage: 20 });
  assert.deepEqual(calls, ['/api/v1/system/audit', '/api/v1/system/audit?actor=Alice&action=auth.login&target_type=user&target_id=7&page=2&per_page=20']);
});

test('system API docs use one fixed read contract', async () => {
  const calls = [];
  const client = createSystemClient({ request: async (url) => { calls.push(url); return { source: '{}' }; } });
  await client.getSystemApiDocs();
  assert.deepEqual(calls, ['/api/v1/system/api-docs-view']);
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
