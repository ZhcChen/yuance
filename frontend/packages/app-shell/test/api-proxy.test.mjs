import assert from 'node:assert/strict';
import test from 'node:test';

import { createApiErrorWrappingProxy } from '../src/api-proxy.js';

test('wraps mutable API methods and reports rejections to the error callback', async () => {
  const calls = [];
  const errors = [];
  const api = {
    async read() { calls.push('read'); return 'ok'; },
    async fail() { throw new Error('boom'); },
  };
  const proxy = createApiErrorWrappingProxy(api, (error) => errors.push(error));
  assert.equal(await proxy.read(), 'ok');
  await assert.rejects(proxy.fail(), /boom/);
  assert.deepEqual(calls, ['read']);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /boom/);
});

test('returns original methods for frozen API clients to satisfy proxy invariants', async () => {
  const calls = [];
  const errors = [];
  const api = Object.freeze({
    async read() { calls.push('read'); return 'ok'; },
    async logout() { calls.push('logout'); return { revoked: true }; },
  });
  const proxy = createApiErrorWrappingProxy(api, (error) => errors.push(error));
  assert.equal(proxy.read, api.read);
  assert.equal(proxy.logout, api.logout);
  assert.deepEqual(await proxy.logout(), { revoked: true });
  assert.deepEqual(calls, ['logout']);
  assert.deepEqual(errors, []);
});
