/*
 * 元策 UI v3 · 应用壳层
 * 侧边栏（分组导航）+ 顶栏（搜索 / 项目切换 / 通知 / 账户）。
 */

import { h, icon, avatar } from './ui.js';
import { currentUser, currentProject, projects } from './mock/data.js';

/** 现网地址：时间管理沿用现有实现，不在 v3 范围内。 */
export const LIVE_TIME_MANAGEMENT_URL = 'https://yuance.quanxinfu.com/web/time-management';

const NAV_GROUPS = [
  {
    label: '概览',
    items: [{ id: 'workbench', href: '#/', label: '工作台', icon: 'i-home' }],
  },
  {
    label: '项目',
    items: [
      { id: 'projects', href: '#/projects', label: '项目', icon: 'i-folder' },
      { id: 'resources', href: '#/resources', label: '资料库', icon: 'i-book' },
    ],
  },
  {
    label: '交付',
    items: [
      { id: 'requirements', href: '#/requirements', label: '需求', icon: 'i-inbox', badge: '2' },
      { id: 'tasks', href: '#/tasks', label: '任务', icon: 'i-task', badge: '3' },
      { id: 'bugs', href: '#/bugs', label: 'Bug', icon: 'i-bug', badge: '1' },
    ],
  },
  {
    label: '协作',
    items: [{ id: 'messages', href: '#/messages', label: '消息中心', icon: 'i-message', badge: '2' }],
  },
  {
    label: '系统',
    items: [{ id: 'system', href: '#/system', label: '系统管理', icon: 'i-settings' }],
  },
];

/**
 * 渲染侧边栏。
 * @param {string} activePageId 当前页面 id
 */
export function renderSidebar(activePageId) {
  const groups = NAV_GROUPS.map((group) =>
    h(
      'div',
      { class: 'sidebar__group' },
      h('div', { class: 'sidebar__group-label' }, group.label),
      group.items.map((item) =>
        h(
          'a',
          {
            class: 'sidebar__link',
            href: item.href,
            'aria-current': item.id === activePageId ? 'page' : null,
            title: item.label,
          },
          icon(item.icon),
          h('span', null, item.label),
          item.badge ? h('span', { class: 'sidebar__badge' }, item.badge) : null,
        ),
      ),
    ),
  );

  return h(
    'aside',
    { class: 'sidebar', id: 'sidebar', 'data-open': 'false' },
    h(
      'div',
      { class: 'sidebar__brand' },
      h('span', { class: 'sidebar__logo' }, icon('i-layers')),
      h('span', { class: 'sidebar__name' }, '元策'),
    ),
    ...groups,
    h(
      'div',
      { class: 'sidebar__footer' },
      h(
        'a',
        {
          class: 'sidebar__link',
          href: LIVE_TIME_MANAGEMENT_URL,
          target: '_blank',
          rel: 'noreferrer noopener',
          title: '时间管理（沿用现有实现）',
        },
        icon('i-clock'),
        h('span', null, '时间管理'),
        h('span', { class: 'sidebar__badge' }, '现网'),
      ),
    ),
  );
}

/**
 * 渲染顶栏。
 * @param {(path: string) => void} onNavigate 路由跳转回调
 */
export function renderTopbar(onNavigate) {
  const searchInput = h('input', {
    class: 'input',
    type: 'search',
    name: 'q',
    placeholder: '搜索项目、需求、任务、Bug、资料库',
    'aria-label': '全局搜索',
    onkeydown: (event) => {
      if (event.key === 'Enter') {
        onNavigate(`#/search?q=${encodeURIComponent(searchInput.value.trim())}`);
      }
    },
  });

  const projectSelect = h(
    'select',
    {
      class: 'select topbar__select',
      'aria-label': '切换当前项目',
      onchange: (event) => {
        const selected = projects.find((project) => project.project_key === event.target.value);
        if (selected) onNavigate(`#/projects/${selected.project_key}`);
      },
    },
    projects.map((project) =>
      h(
        'option',
        { value: project.project_key, selected: project.project_key === currentProject.key },
        project.name,
      ),
    ),
  );

  return h(
    'header',
    { class: 'topbar' },
    h(
      'button',
      {
        class: 'topbar__menu',
        type: 'button',
        'aria-label': '打开导航',
        onclick: () => toggleSidebar(),
      },
      icon('i-layers'),
    ),
    h('div', { class: 'global-search' }, searchInput, h('span', { class: 'global-search__hint' }, 'Enter')),
    h('div', { class: 'topbar__spacer' }),
    h('div', { class: 'cluster' }, h('span', { class: 'table__muted' }, '当前项目'), projectSelect),
    h(
      'button',
      { class: 'topbar__icon-btn', type: 'button', 'aria-label': '打开消息通知', onclick: () => onNavigate('#/messages') },
      icon('i-bell'),
      h('span', { class: 'topbar__dot' }),
    ),
    h(
      'div',
      { class: 'dropdown' },
      h(
        'button',
        { class: 'topbar__icon-btn', type: 'button', 'aria-label': `打开 ${currentUser.display_name} 的账户菜单` },
        avatar(currentUser.display_name),
      ),
      h(
        'div',
        { class: 'dropdown__menu' },
        h('a', { class: 'dropdown__item', href: '#/me' }, icon('i-user'), '个人中心'),
        h('a', { class: 'dropdown__item', href: '#/system' }, icon('i-settings'), '系统管理'),
        h('a', { class: 'dropdown__item dropdown__item--danger', href: '#/' }, icon('i-logout'), '退出登录'),
      ),
    ),
  );
}

let scrim = null;

/** 窄屏抽屉开关。 */
export function toggleSidebar(force) {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  const open = force !== undefined ? force : sidebar.dataset.open !== 'true';
  sidebar.dataset.open = String(open);

  if (open) {
    scrim = h('div', { class: 'sidebar-scrim', onclick: () => toggleSidebar(false) });
    document.body.appendChild(scrim);
  } else if (scrim) {
    scrim.remove();
    scrim = null;
  }
}
