import test from 'node:test';
import assert from 'node:assert/strict';

import { createBrowserRouter } from '../src/platform/browser/router.js';

test('browser router owns location parsing, history and popstate subscriptions', () => {
  const location = { pathname: '/web/app/tasks', search: '?page=2', assign() {} };
  const historyCalls = [];
  const listeners = new Map();
  const eventTarget = {
    addEventListener(type, callback) { listeners.set(type, callback); },
    removeEventListener(type, callback) {
      if (listeners.get(type) === callback) listeners.delete(type);
    },
  };
  const router = createBrowserRouter({
    location,
    history: {
      pushState(_state, _title, path) { historyCalls.push(['push', path]); },
      replaceState(_state, _title, path) { historyCalls.push(['replace', path]); },
    },
    eventTarget,
  });

  assert.equal(router.currentRoute().id, 'tasks');
  router.navigate('/web/app/messages');
  router.navigate('/web/app/projects', { replace: true });
  assert.deepEqual(historyCalls, [
    ['push', '/web/app/messages'],
    ['replace', '/web/app/projects'],
  ]);

  let restored = 0;
  const unsubscribe = router.subscribe(() => { restored += 1; });
  listeners.get('popstate')();
  assert.equal(restored, 1);
  unsubscribe();
  assert.equal(listeners.has('popstate'), false);
});
