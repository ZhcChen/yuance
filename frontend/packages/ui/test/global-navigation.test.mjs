import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { GlobalNavigation, closeNavigationMenuOnBlur, closeNavigationMenuOnEscape, formatNavigationBadge } from '@yuance/frontend-ui';

test('navigation badge caps large values and hides empty values', () => {
  assert.equal(formatNavigationBadge(0), '');
  assert.equal(formatNavigationBadge(12), '12');
  assert.equal(formatNavigationBadge(100), '99+');
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

test('global navigation renders the complete shared shell semantics', () => {
  const html = renderToStaticMarkup(createElement(GlobalNavigation, {
    productName: '元策',
    links: [{ id: 'home', label: '工作台', href: '/web/app', active: true }, { id: 'messages', label: '消息', href: '/web/app/messages', badge: 108 }],
    currentProject: { key: 'LONG', name: '一个名称非常长但不应撑破顶部导航的项目', pending_count: 3 },
    projectsHref: '/web/app/projects',
    messagesHref: '/web/app/messages',
    unreadCount: 8,
    user: { username: 'alice', display_name: 'Alice', is_super_admin: false },
    profileHref: '/web/me',
    theme: 'dark',
    onNavigate() {}, onSearch() {}, onThemeChange() {}, onLogout() {},
  }));

  assert.match(html, /aria-label="应用导航"/u);
  assert.match(html, /aria-current="page"/u);
  assert.match(html, /99\+/u);
  assert.match(html, /role="search"/u);
  assert.match(html, /aria-pressed="true"/u);
  assert.match(html, /切换当前项目/u);
  assert.match(html, /打开消息通知/u);
  assert.match(html, /打开 Alice 的账户菜单/u);
});
