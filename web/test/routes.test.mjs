import test from 'node:test';
import assert from 'node:assert/strict';

import { buildHomePath, buildMessagesPath, parseAppRoute } from '../src/lib/routes.js';

test('parseAppRoute recognizes browser shell home owners', () => {
  assert.deepEqual(parseAppRoute('/web', ''), {
    id: 'home',
    owner: 'web',
    pathname: '/web',
    search: '',
    title: '元策浏览器工作台',
  });

  assert.deepEqual(parseAppRoute('/web/app', ''), {
    id: 'home',
    owner: 'app',
    pathname: '/web/app',
    search: '',
    title: '元策浏览器工作台',
  });
});

test('parseAppRoute normalizes message center filters and pagination', () => {
  assert.deepEqual(
    parseAppRoute('/web/messages', '?filter=pending_discussion&page=3&per_page=20'),
    {
      id: 'messages',
      owner: 'web',
      pathname: '/web/messages',
      search: '?filter=pending_discussion&page=3&per_page=20',
      filter: 'pending',
      page: 3,
      perPage: 20,
      title: '消息中心',
    },
  );
});

test('parseAppRoute maps app-side unknown routes back to legacy fallback', () => {
  assert.deepEqual(
    parseAppRoute('/web/app/projects/YCE', '?view=kanban'),
    {
      id: 'unsupported',
      owner: 'app',
      pathname: '/web/app/projects/YCE',
      search: '?view=kanban',
      legacyPath: '/web/projects/YCE',
      title: '未迁移路由',
    },
  );
});

test('buildMessagesPath keeps owner-specific base path and compact query', () => {
  assert.equal(buildHomePath('web'), '/web');
  assert.equal(buildHomePath('app'), '/web/app');
  assert.equal(buildMessagesPath({ owner: 'app' }), '/web/app/messages');
  assert.equal(
    buildMessagesPath({ owner: 'web', filter: 'unread', page: 2, perPage: 20 }),
    '/web/messages?filter=unread&page=2&per_page=20',
  );
});
