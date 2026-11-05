import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { GlobalNavigation, closeContainingNavigationMenu, closeNavigationMenuOnBlur, closeNavigationMenuOnEscape, formatNavigationBadge } from '@yuance/frontend-ui';

test('navigation badge caps large values and hides empty values', () => {
  assert.equal(formatNavigationBadge(0), '');
  assert.equal(formatNavigationBadge(12), '12');
  assert.equal(formatNavigationBadge(100), '99');
});

test('navigation menus close on Escape and restore summary focus', () => {
  let focused = false;
  const details = /** @type {HTMLDetailsElement} */ (/** @type {unknown} */ ({
    open: true,
    querySelector: () => ({ focus: () => { focused = true; } }),
  }));
  closeNavigationMenuOnEscape({ key: 'Enter', currentTarget: details });
  assert.equal(details.open, true);
  closeNavigationMenuOnEscape({ key: 'Escape', currentTarget: details });
  assert.equal(details.open, false);
  assert.equal(focused, true);
});

test('navigation menus close when focus leaves the menu', () => {
  const details = /** @type {HTMLDetailsElement} */ (/** @type {unknown} */ ({ open: true, contains: () => false }));
  closeNavigationMenuOnBlur({ currentTarget: details, relatedTarget: null });
  assert.equal(details.open, false);
});

test('navigation menu actions close their containing menu', () => {
  const details = { open: true };
  const currentTarget = /** @type {HTMLElement} */ (/** @type {unknown} */ ({ closest: () => details }));
  closeContainingNavigationMenu(/** @type {Parameters<typeof closeContainingNavigationMenu>[0]} */ (/** @type {unknown} */ ({ currentTarget })));
  assert.equal(details.open, false);
});

test('global navigation renders the complete shared shell semantics', () => {
  const html = renderToStaticMarkup(createElement(GlobalNavigation, {
    currentProject: { key: 'LONG', name: '一个名称非常长但不应撑破顶部导航的项目', pending_count: 0 },
    projectOptions: [{ key: 'LONG', name: '一个名称非常长但不应撑破顶部导航的项目', pending_count: 0 }, { key: 'OPS', name: '交付运维台', pending_count: 108 }],
    projectsHref: '/web/app/projects',
    messagesHref: '/web/app/messages',
    unreadCount: 8,
    notifications: [{ id: 7, kind: 'comment_mentioned', title: '新的指派', body: '请处理任务', actor: 'Alice', createdAt: '刚刚', read: false }],
    user: { username: 'alice', display_name: 'Alice', is_super_admin: false },
    profileHref: '/web/me',
    theme: 'dark',
    onNavigate() {}, onSearch() {}, onProjectChange() {}, onOpenNotification() {}, onMarkAllRead() {}, onThemeChange() {}, onLogout() {},
  }));

  assert.match(html, /aria-label="全部项目待处理 108">99</u);
  assert.match(html, /role="search"/u);
  assert.match(html, /aria-pressed="true"/u);
  assert.match(html, /切换当前项目/u);
  assert.match(html, /global-nav-project-caret/u);
  assert.match(html, /搜索项目名称/u);
  assert.match(html, /交付运维台/u);
  assert.match(html, /打开消息通知/u);
  assert.match(html, /最近消息/u);
  assert.match(html, /新的指派/u);
  assert.match(html, /请处理任务/u);
  assert.match(html, /提及 · Alice · 刚刚/u);
  assert.match(html, /global-nav-notification-dot/u);
  assert.match(html, />8 条未读</u);
  assert.match(html, /一键已读/u);
  assert.match(html, /打开 Alice 的账户菜单/u);
});

test('global navigation exposes the mobile navigation toggle', () => {
  const html = renderToStaticMarkup(createElement(GlobalNavigation, {
    currentProject: { key: 'OPS', name: '交付运维台', pending_count: 0 },
    projectOptions: [],
    projectsHref: '/web/app/projects',
    messagesHref: '/web/app/messages',
    user: { username: 'alice', display_name: 'Alice', is_super_admin: false },
    profileHref: '/web/me',
    theme: 'light',
    onNavigate() {}, onSearch() {}, onProjectChange() {}, onOpenNotification() {}, onMarkAllRead() {}, onThemeChange() {}, onLogout() {},
    onToggleNavigation() {},
    navigationOpen: true,
  }));

  assert.match(html, /aria-label="关闭导航"/u);
  assert.match(html, /aria-expanded="true"/u);
});
