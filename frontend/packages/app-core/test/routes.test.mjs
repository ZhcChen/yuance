import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildHomePath,
  buildMessagesPath,
  buildProfilePath,
  buildProjectDetailPath,
  buildProjectCycleDetailPath,
  buildProjectResourceDetailPath,
  buildProjectPersonalAnalysisPath,
  buildProjectsPath,
  buildSearchPath,
  buildWorkItemDetailPath,
  buildWorkItemListPath,
  parseAppRoute,
  routePathForOwner,
} from '@yuance/frontend-app-core';

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

test('parseAppRoute supports owner-aware project detail tabs', () => {
  assert.deepEqual(
    parseAppRoute('/web/app/projects/YCE', '?tab=members'),
    {
      id: 'project-detail',
      owner: 'app',
      pathname: '/web/app/projects/YCE',
      search: '?tab=members',
      projectKey: 'YCE',
      tab: 'members',
      title: '项目详情',
    },
  );
  assert.equal(buildProjectDetailPath({ owner: 'web', projectKey: 'YCE / 1', tab: 'members' }), '/web/projects/YCE%20%2F%201?tab=members');
  assert.equal(buildProjectDetailPath({ owner: 'app', projectKey: 'YCE', tab: 'cycles' }), '/web/app/projects/YCE?tab=cycles');
  assert.equal(buildProjectCycleDetailPath({ owner: 'web', projectKey: 'YCE', cycleId: 7 }), '/web/projects/YCE/cycles/7');
  assert.equal(buildProjectDetailPath({ owner: 'app', projectKey: 'YCE', tab: 'resources' }), '/web/app/projects/YCE?tab=resources');
  assert.equal(buildProjectResourceDetailPath({ owner: 'app', projectKey: 'YCE', resourceId: 9 }), '/web/app/projects/YCE/resources/9');
  assert.equal(buildProjectPersonalAnalysisPath({ owner: 'web', projectKey: 'YCE / 1' }), '/web/projects/YCE%20%2F%201/my-analysis');
  assert.equal(buildProjectPersonalAnalysisPath({ owner: 'app' }), '/web/app/projects');
  assert.deepEqual(parseAppRoute('/web/app/projects/YCE/cycles/7', ''), {
    id: 'project-cycle-detail', owner: 'app', pathname: '/web/app/projects/YCE/cycles/7', search: '',
    projectKey: 'YCE', cycleId: 7, title: '项目周期详情',
  });
  assert.equal(buildProjectDetailPath({ owner: 'app' }), '/web/app/projects');
  assert.deepEqual(parseAppRoute('/web/app/projects/YCE/resources/9', ''), {
    id: 'project-resource-detail', owner: 'app', pathname: '/web/app/projects/YCE/resources/9', search: '', projectKey: 'YCE', resourceId: 9, title: '项目资料详情',
  });
  assert.deepEqual(parseAppRoute('/web/app/projects/YCE/my-analysis', ''), {
    id: 'project-personal-analysis', owner: 'app', pathname: '/web/app/projects/YCE/my-analysis', search: '', projectKey: 'YCE', title: '个人项目分析',
  });
  assert.deepEqual(parseAppRoute('/web/projects/YCE%20%2F%201/my-analysis', ''), {
    id: 'project-personal-analysis', owner: 'web', pathname: '/web/projects/YCE%20%2F%201/my-analysis', search: '', projectKey: 'YCE / 1', title: '个人项目分析',
  });
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
  assert.equal(
    buildWorkItemListPath(parseAppRoute('/web/bugs', '?status=pending&assignee_username=admin&project_key=YCE')),
    '/web/bugs?status=pending&assignee_username=admin&project_key=YCE',
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
      projectKey: '',
      page: 2,
      perPage: 20,
      title: '任务列表',
    },
  );
  assert.equal(
    buildWorkItemListPath({ owner: 'web', itemType: 'bug', status: 'pending', assigneeUsername: 'admin', projectKey: 'YCE' }),
    '/web/bugs?status=pending&assignee_username=admin&project_key=YCE',
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

test('buildWorkItemDetailPath falls back to task list when item key is empty', () => {
  assert.equal(buildWorkItemDetailPath({ owner: 'app', itemKey: '' }), '/web/app/tasks');
});

test('profile and search builders preserve the route owner and normalize query values', () => {
  assert.equal(buildProfilePath('web'), '/web/me');
  assert.equal(buildProfilePath('app'), '/web/app/me');
  assert.equal(buildSearchPath({ owner: 'app' }), '/web/app/search');
  assert.equal(
    buildSearchPath({ owner: 'web', q: '  登录失败  ', page: 2, perPage: 20 }),
    '/web/search?q=%E7%99%BB%E5%BD%95%E5%A4%B1%E8%B4%A5&page=2&per_page=20',
  );
  assert.equal(
    buildSearchPath({ owner: 'app', page: 0, perPage: -1 }),
    '/web/app/search',
  );
});

test('search route parser and result targets preserve owner semantics', () => {
  assert.deepEqual(parseAppRoute('/web/app/search', '?q=%E7%99%BB%E5%BD%95&page=2&per_page=20'), {
    id: 'search',
    owner: 'app',
    pathname: '/web/app/search',
    search: '?q=%E7%99%BB%E5%BD%95&page=2&per_page=20',
    q: '登录',
    page: 2,
    perPage: 20,
    title: '全局搜索',
  });
  assert.equal(routePathForOwner('/web/work-items/YCE-TASK-2#comment-7', 'app'), '/web/app/work-items/YCE-TASK-2#comment-7');
  assert.equal(routePathForOwner('/web/projects/YCE?tab=members', 'web'), '/web/projects/YCE?tab=members');
  assert.equal(routePathForOwner('https://evil.example/web/projects/YCE', 'app'), '/web/app');
  assert.equal(routePathForOwner('/web/app/projects', 'app'), '/web/app');
});

test('profile route parser preserves Browser and Desktop owners', () => {
  assert.deepEqual(parseAppRoute('/web/app/me', ''), {
    id: 'profile', owner: 'app', pathname: '/web/app/me', search: '', title: '个人中心',
  });
  assert.deepEqual(parseAppRoute('/web/me', ''), {
    id: 'profile', owner: 'web', pathname: '/web/me', search: '', title: '个人中心',
  });
});
