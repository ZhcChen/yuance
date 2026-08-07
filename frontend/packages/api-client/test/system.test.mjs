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
