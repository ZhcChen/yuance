import test from 'node:test';
import assert from 'node:assert/strict';

import { ApiError } from '@yuance/frontend-api-client';
import { createBrowserApiTransport } from '../src/platform/browser/api-transport.js';

function jsonResponse(data, init = {}) {
  return new Response(JSON.stringify(init.error ? { error: init.error } : { data }), {
    status: init.status || 200,
    headers: {
      'content-type': 'application/json',
      ...(init.csrfToken ? { 'x-yuance-csrf-token': init.csrfToken } : {}),
    },
  });
}

test('browser API transport refreshes CSRF and retries one failed write', async () => {
  const responses = [
    jsonResponse({ csrf_token: 'initial' }, { csrfToken: 'initial' }),
    jsonResponse(null, {
      status: 403,
      error: { code: 'forbidden', message: 'CSRF token 校验失败。' },
    }),
    jsonResponse({ csrf_token: 'retry' }, { csrfToken: 'retry' }),
    jsonResponse({ updated: true }),
  ];
  const calls = [];
  const transport = createBrowserApiTransport({
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), options });
      const response = responses.shift();
      assert.ok(response);
      return response;
    },
    location: { pathname: '/web/app/tasks', search: '', hash: '', assign() {} },
    history: { replaceState() {} },
    storage: new MapStorage(),
  });

  await transport.prepareWrite();
  const result = await transport.request('/api/v1/work-items/YCE-TASK-2', {
    method: 'PATCH',
    body: '{}',
  });

  assert.deepEqual(result, { updated: true });
  assert.deepEqual(calls.map(({ url }) => url), [
    '/api/v1/auth/csrf',
    '/api/v1/work-items/YCE-TASK-2',
    '/api/v1/auth/csrf',
    '/api/v1/work-items/YCE-TASK-2',
  ]);
  assert.equal(new Headers(calls[1].options.headers).get('x-yuance-csrf-token'), 'initial');
  assert.equal(new Headers(calls[3].options.headers).get('x-yuance-csrf-token'), 'retry');
});

test('browser API transport does not retry business forbidden writes', async () => {
  const responses = [
    jsonResponse({ csrf_token: 'initial' }, { csrfToken: 'initial' }),
    jsonResponse(null, {
      status: 403,
      error: { code: 'forbidden', message: '访问密码不正确' },
    }),
  ];
  const calls = [];
  const transport = createBrowserApiTransport({
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), options });
      const response = responses.shift();
      assert.ok(response);
      return response;
    },
    location: { pathname: '/web/app/projects/YCE/resources/9', search: '', hash: '', assign() {} },
    history: { replaceState() {} },
    storage: new MapStorage(),
  });

  await transport.prepareWrite();
  await assert.rejects(
    transport.request('/api/v1/projects/YCE/resources/9/unlock', { method: 'POST', body: '{}' }),
    (error) => error instanceof ApiError && error.status === 403 && error.message === '访问密码不正确',
  );
  assert.deepEqual(calls.map(({ url }) => url), [
    '/api/v1/auth/csrf',
    '/api/v1/projects/YCE/resources/9/unlock',
  ]);
});

test('browser API transport rejects an API redirect resolved as the HTML login page', async () => {
  const assigned = [];
  const transport = createBrowserApiTransport({
    fetchImpl: async () => new Response('<!doctype html><title>登录</title>', {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }),
    location: {
      pathname: '/web/projects',
      search: '?status=active',
      hash: '',
      assign(value) { assigned.push(value); },
    },
    history: { replaceState() {} },
    storage: new MapStorage(),
  });

  await assert.rejects(
    transport.request('/api/v1/me'),
    (error) => error instanceof ApiError && error.status === 401 && error.message === '登录已失效。',
  );
  assert.deepEqual(assigned, ['/web/login?return_to=%2Fweb%2Fprojects%3Fstatus%3Dactive']);
});

test('browser API transport preserves and restores an authenticated return hash', () => {
  const assigned = [];
  const replaced = [];
  const storage = new MapStorage();
  const location = {
    pathname: '/web/app/work-items/YCE-TASK-2',
    search: '?tab=comments',
    hash: '#comment-42',
    assign(value) { assigned.push(value); },
  };
  const transport = createBrowserApiTransport({
    fetchImpl: async () => jsonResponse({}),
    location,
    history: { replaceState(_state, _title, value) { replaced.push(value); } },
    storage,
  });

  transport.redirectToLogin();
  assert.equal(assigned[0], '/web/login?return_to=%2Fweb%2Fapp%2Fwork-items%2FYCE-TASK-2%3Ftab%3Dcomments');

  location.hash = '';
  transport.restorePendingReturnToHash();
  assert.deepEqual(replaced, ['/web/app/work-items/YCE-TASK-2?tab=comments#comment-42']);
  assert.equal(storage.length, 0);
});

class MapStorage {
  #values = new Map();

  get length() { return this.#values.size; }
  getItem(key) { return this.#values.get(key) ?? null; }
  setItem(key, value) { this.#values.set(key, value); }
  removeItem(key) { this.#values.delete(key); }
}
