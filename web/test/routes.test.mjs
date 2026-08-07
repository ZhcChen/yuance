import test from 'node:test';
import assert from 'node:assert/strict';

import { buildHomePath, buildMessagesPath, buildProjectsPath, buildWorkItemDetailPath, buildWorkItemListPath, parseAppRoute } from '../src/lib/routes.js';

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

test('parseAppRoute recognizes shared project detail routes', () => {
  assert.deepEqual(
    parseAppRoute('/web/app/projects/YCE', '?view=kanban'),
    {
      id: 'project-detail',
      owner: 'app',
      pathname: '/web/app/projects/YCE',
      search: '?view=kanban',
      projectKey: 'YCE',
      tab: 'info',
      title: '项目详情',
    },
  );
});

test('parseAppRoute supports projects route and owner-aware builders', () => {
  assert.deepEqual(
    parseAppRoute('/web/app/projects', '?status=on_hold&page=2&per_page=20'),
    {
      id: 'projects',
      owner: 'app',
      pathname: '/web/app/projects',
      search: '?status=on_hold&page=2&per_page=20',
      status: 'on_hold',
      page: 2,
      perPage: 20,
      title: '项目列表',
    },
  );
  assert.equal(
    buildProjectsPath({ owner: 'app', status: 'on_hold', page: 2, perPage: 20 }),
    '/web/app/projects?status=on_hold&page=2&per_page=20',
  );
});

test('parseAppRoute supports work item list filters and detail routes', () => {
  assert.deepEqual(
    parseAppRoute('/web/app/tasks', '?q=%E6%A8%A1%E5%9E%8B&status=in_progress&priority=p0&assignee_username=admin&page=2&per_page=20'),
    {
      id: 'tasks',
      owner: 'app',
      pathname: '/web/app/tasks',
      search: '?q=%E6%A8%A1%E5%9E%8B&status=in_progress&priority=p0&assignee_username=admin&page=2&per_page=20',
      itemType: 'task',
      q: '模型',
      status: 'in_progress',
      priority: 'P0',
      assigneeUsername: 'admin',
      page: 2,
      perPage: 20,
      title: '任务列表',
    },
  );
  assert.deepEqual(
    parseAppRoute('/web/app/work-items/YCE-TASK-2', ''),
    {
      id: 'work-item-detail',
      owner: 'app',
      pathname: '/web/app/work-items/YCE-TASK-2',
      search: '',
      itemKey: 'YCE-TASK-2',
      title: '工作项详情',
    },
  );
  assert.equal(
    buildWorkItemListPath({ owner: 'app', itemType: 'task', q: '模型', status: 'in_progress', priority: 'p0', assigneeUsername: 'admin', page: 2, perPage: 20 }),
    '/web/app/tasks?q=%E6%A8%A1%E5%9E%8B&status=in_progress&priority=P0&assignee_username=admin&page=2&per_page=20',
  );
  assert.equal(
    buildWorkItemDetailPath({ owner: 'app', itemKey: 'YCE-TASK-2', commentId: 42 }),
    '/web/app/work-items/YCE-TASK-2#comment-42',
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
