import assert from 'node:assert/strict';
import test from 'node:test';

import { createDashboardClient } from '../src/dashboard.js';

test('dashboard uses one fixed read contract', async () => {
  const calls = [];
  const client = createDashboardClient({
    request: async (url) => {
      calls.push(url);
      return { metrics: { active_projects: 2 } };
    },
  });

  assert.deepEqual(await client.getDashboard(), { metrics: { active_projects: 2 } });
  assert.deepEqual(calls, ['/api/v1/dashboard']);
});
