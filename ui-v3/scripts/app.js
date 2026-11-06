/*
 * 元策 UI v3 · 应用入口
 * 组装壳层、注册路由、响应 hash 变化。
 */

import { h, mount, clear, icon } from './ui.js';
import { route, resolve, navigate } from './router.js';
import { renderSidebar, renderTopbar, toggleSidebar } from './shell.js';
import { currentProject } from './mock/data.js';
import { readTheme, toggleTheme } from './theme.js';

import { renderWorkbench } from './pages/workbench.js';
import { renderProjects, renderProjectDetail } from './pages/projects.js';
import { renderWorkItems } from './pages/work-items.js';
import { renderWorkItemDetail } from './pages/work-item-detail.js';
import { renderResources, renderResourceDetail } from './pages/resources.js';
import { renderMessages } from './pages/messages.js';
import { renderSearch } from './pages/search.js';
import { renderProfile } from './pages/profile.js';
import { renderSystem } from './pages/system.js';

const app = document.getElementById('app');
const view = document.getElementById('view');

const PAGE_TITLES = {
  workbench: '工作台',
  projects: '项目',
  'project-detail': '项目详情',
  requirements: '需求',
  tasks: '任务',
  bugs: 'Bug',
  'work-item-detail': '工作项详情',
  resources: '资料库',
  'resource-detail': '资料详情',
  messages: '消息中心',
  search: '全局搜索',
  profile: '个人中心',
  system: '系统管理',
};

route('/', 'workbench', renderWorkbench);
route('/projects', 'projects', renderProjects);
route('/projects/:projectKey', 'project-detail', renderProjectDetail);
route('/requirements', 'requirements', (params, query) => renderWorkItems('requirement', params, query));
route('/tasks', 'tasks', (params, query) => renderWorkItems('task', params, query));
route('/bugs', 'bugs', (params, query) => renderWorkItems('bug', params, query));
route('/work-items/:itemKey', 'work-item-detail', renderWorkItemDetail);
route('/resources', 'resources', renderResources);
route('/resources/:resourceId', 'resource-detail', renderResourceDetail);
route('/messages', 'messages', renderMessages);
route('/search', 'search', renderSearch);
route('/me', 'profile', renderProfile);
route('/system', 'system', (params, query) => renderSystem('dashboard', params, query));
route('/system/users', 'system', (params, query) => renderSystem('users', params, query));
route('/system/roles', 'system', (params, query) => renderSystem('roles', params, query));
route('/system/permissions', 'system', (params, query) => renderSystem('permissions', params, query));
route('/system/storage', 'system', (params, query) => renderSystem('storage', params, query));
route('/system/audit', 'system', (params, query) => renderSystem('audit', params, query));
route('/system/releases', 'system', (params, query) => renderSystem('releases', params, query));
route('/system/database-stats', 'system', (params, query) => renderSystem('database-stats', params, query));

let activePageId = '';
let renderedProjectKey = currentProject.key;

function navigateTo(path) {
  navigate(path);
}

function renderShell(activeId) {
  const shell = h(
    'div',
    { class: 'app' },
    renderSidebar(activeId),
    h('div', { class: 'app-main' }, renderTopbar(navigateTo), h('main', { class: 'content' }, h('div', { class: 'content__inner', id: 'view' }))),
  );
  mount(app, shell);
}

function renderRoute() {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [pathname, search = ''] = raw.split('?');
  const matched = resolve(pathname, search);

  if (!matched) {
    activePageId = 'not-found';
    renderShell(activePageId);
    mount(
      document.getElementById('view'),
      h(
        'div',
        { class: 'empty' },
        h('span', { class: 'empty__icon' }, icon('i-alert')),
        h('h1', { class: 'empty__title' }, '页面不存在'),
        h('p', { class: 'empty__desc' }, `没有找到与「${pathname}」对应的页面，可能是链接已失效。`),
        h('a', { class: 'btn btn--primary', href: '#/' }, '返回工作台'),
      ),
    );
    document.title = '元策 · 页面不存在';
    return;
  }

  // 页面类型变化，或当前项目变化（顶栏项目选择器切换）时重建壳层
  const projectChanged = currentProject.key !== renderedProjectKey;
  if (matched.pageId !== activePageId || projectChanged) {
    activePageId = matched.pageId;
    renderedProjectKey = currentProject.key;
    renderShell(activePageId);
  }

  const container = document.getElementById('view');
  clear(container);

  const content = matched.handler(matched.params, matched.query);
  if (content) container.appendChild(content);

  document.title = `元策 · ${PAGE_TITLES[matched.pageId] || '工作台'}`;
  toggleSidebar(false);
}

// 主题：与生产一致，读取本地偏好并在文档根节点标记。
document.documentElement.setAttribute('data-theme', readTheme());

window.addEventListener('hashchange', renderRoute);
renderRoute();

// 便于在浏览器控制台里跳转：__v3.navigate('#/requirements')
window.__v3 = { navigate: navigateTo, render: renderRoute };
