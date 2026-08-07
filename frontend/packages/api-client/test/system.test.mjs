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
