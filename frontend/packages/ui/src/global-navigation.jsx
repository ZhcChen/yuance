// @ts-check
/* global ResizeObserver, requestAnimationFrame */

import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';

const logoSrc = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"%3E%3Crect x="4" y="4" width="88" height="88" rx="22" fill="%231f5fbf"/%3E%3Cpath d="M22 22h27v14H36v38H22V22Z" fill="%23fff"/%3E%3Cpath d="M50 22h24v14H56L37 74H22l21-42c2-4 4-7 7-10Z" fill="%23fff"/%3E%3Cpath d="M57 45h17v14H50l7-14Z" fill="%23fff"/%3E%3Crect x="62" y="62" width="15" height="15" rx="4" fill="%232d8a68"/%3E%3C/svg%3E';

/** @param {number} count */
export function formatNavigationBadge(count) {
  if (!Number.isFinite(count) || count <= 0) return '';
  return count > 99 ? '99' : String(Math.floor(count));
}

/** @param {{ key: string, currentTarget: HTMLDetailsElement }} event */
export function closeNavigationMenuOnEscape(event) {
  if (event.key !== 'Escape') return;
  event.currentTarget.open = false;
  event.currentTarget.querySelector('summary')?.focus();
}

/** @param {{ currentTarget: HTMLDetailsElement, relatedTarget: EventTarget | null }} event */
export function closeNavigationMenuOnBlur(event) {
  if (event.relatedTarget && event.currentTarget.contains(/** @type {Node} */ (event.relatedTarget))) return;
  event.currentTarget.open = false;
}

/** @param {React.SyntheticEvent<HTMLElement>} event */
export function closeContainingNavigationMenu(event) {
  const details = event.currentTarget.closest('details');
  if (details) details.open = false;
}

/**
 * @param {{
 *   productName: string,
 *   links: Array<{ id: string, label: string, href: string, active?: boolean, badge?: number }>,
 *   currentProject?: { key: string, name: string, pending_count?: number } | null,
 *   projectOptions?: Array<{ key: string, name: string, pending_count?: number }>,
 *   projectsHref: string,
 *   downloadsHref: string,
 *   systemLinks?: Array<{ id: string, label: string, href: string, active?: boolean }>,
 *   messagesHref: string,
 *   unreadCount?: number,
 *   notifications?: Array<{ id: number, kind?: string, title: string, body: string, actor: string, createdAt: string, read: boolean }>,
 *   notificationBusy?: boolean,
 *   projectSwitchingKey?: string,
 *   user?: { username: string, display_name: string, is_super_admin?: boolean } | null,
 *   profileHref: string,
 *   theme: 'light' | 'dark',
 *   onNavigate(event: React.MouseEvent<HTMLAnchorElement>, href: string, label: string): void,
 *   onSearch(query: string): void,
 *   onProjectChange(project: { key: string, name: string, pending_count?: number }): void,
 *   onOpenNotification(notification: { id: number, kind?: string, title: string, body: string, actor: string, createdAt: string, read: boolean }): void,
 *   onMarkAllRead(): void,
 *   onThemeChange(theme: 'light' | 'dark'): void,
 *   onLogout(): void,
 * }} props
 */
export function GlobalNavigation({
  productName,
  links,
  currentProject,
  projectOptions = [],
  projectsHref,
  downloadsHref,
  systemLinks = [],
  messagesHref,
  unreadCount = 0,
  notifications = [],
  notificationBusy = false,
  projectSwitchingKey = '',
  user,
  profileHref,
  theme,
  onNavigate,
  onSearch,
  onProjectChange,
  onOpenNotification,
  onMarkAllRead,
  onThemeChange,
  onLogout,
}) {
  const linksRef = useRef(/** @type {HTMLElement | null} */ (null));
  const hasSyncedIndicatorRef = useRef(false);
  const displayName = user?.display_name || user?.username || '未知用户';
  const avatar = Array.from(displayName.trim())[0] || '元';
  const currentProjectPendingCount = Number(currentProject?.pending_count || 0);
  const projectBadge = formatNavigationBadge(currentProjectPendingCount);
  const [projectQuery, setProjectQuery] = useState('');
  const filteredProjects = useMemo(() => {
    const query = projectQuery.trim().toLocaleLowerCase();
    return query
      ? projectOptions.filter((project) => `${project.key} ${project.name}`.toLocaleLowerCase().includes(query))
      : projectOptions;
  }, [projectOptions, projectQuery]);

  useLayoutEffect(() => {
    const navigation = linksRef.current;
    const active = /** @type {HTMLElement | null} */ (navigation?.querySelector('.global-nav-link.active') || null);
    const indicator = /** @type {HTMLElement | null} */ (navigation?.querySelector('.global-nav-links-indicator') || null);
    if (!navigation || !active || !indicator) return undefined;

    const syncIndicator = (animate) => {
      const navigationBounds = navigation.getBoundingClientRect();
      const activeBounds = active.getBoundingClientRect();
      indicator.style.transition = animate ? '' : 'none';
      navigation.style.setProperty('--yc-global-nav-indicator-width', `${activeBounds.width}px`);
      navigation.style.setProperty('--yc-global-nav-indicator-x', `${activeBounds.left - navigationBounds.left + navigation.scrollLeft}px`);
      if (!animate) requestAnimationFrame(() => { indicator.style.transition = ''; });
    };

    syncIndicator(hasSyncedIndicatorRef.current);
    hasSyncedIndicatorRef.current = true;
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => syncIndicator(true));
    observer?.observe(navigation);
    Array.from(navigation.querySelectorAll('.global-nav-link')).forEach((link) => observer?.observe(link));
    return () => observer?.disconnect();
  }, [links, systemLinks]);

  /** @param {React.FormEvent<HTMLFormElement>} event */
  function submitSearch(event) {
    event.preventDefault();
    const query = /** @type {HTMLInputElement | null} */ (event.currentTarget.elements.namedItem('q'));
    onSearch(query?.value.trim() || '');
  }

  /** @param {string | undefined} kind */
  function notificationKindLabel(kind) {
    if (kind === 'comment_replied') return '回复';
    if (kind === 'comment_mentioned') return '提及';
    return '指派';
  }

  return (
    <header className="global-nav">
      <a className="global-nav-brand" href={links[0]?.href || projectsHref} onClick={(event) => onNavigate(event, links[0]?.href || projectsHref, productName)}>
        <img className="global-nav-mark" src={logoSrc} alt="" width="32" height="32" />
        <strong>{productName}</strong>
      </a>

      <nav ref={linksRef} className="global-nav-links" aria-label="应用导航">
        <span className="global-nav-links-indicator" aria-hidden="true" />
        {links.map((link) => {
          const badge = formatNavigationBadge(link.badge || 0);
          return (
            <a key={link.id} className={['global-nav-link', link.active ? 'active' : ''].filter(Boolean).join(' ')} href={link.href}
              aria-current={link.active ? 'page' : undefined} onClick={(event) => onNavigate(event, link.href, link.label)}>
              {link.label}
              {badge ? <span className="global-nav-badge" aria-label={`${link.label} ${link.badge} 项`}>{badge}</span> : null}
            </a>
          );
        })}
        {systemLinks.length ? (
          <details className="global-nav-system" onKeyDown={closeNavigationMenuOnEscape} onBlur={closeNavigationMenuOnBlur}>
            <summary className={systemLinks.some((link) => link.active) ? 'global-nav-link active' : 'global-nav-link'} role="button">
              系统管理<span className="global-nav-caret" aria-hidden="true" />
            </summary>
            <div className="global-nav-menu global-nav-system-menu">
              {systemLinks.map((link) => <a key={link.id} className={link.active ? 'active' : ''} href={link.href} onClick={(event) => { closeContainingNavigationMenu(event); onNavigate(event, link.href, link.label); }}>{link.label}</a>)}
            </div>
          </details>
        ) : null}
      </nav>

      <div className="global-nav-tools">
        <a className="global-nav-download" href={downloadsHref} target="_blank" rel="noreferrer">桌面端下载</a>
        <details className="global-nav-project" onKeyDown={closeNavigationMenuOnEscape} onBlur={closeNavigationMenuOnBlur}>
          <summary role="button" aria-label="切换当前项目">
            <span className="global-nav-project-label">当前项目</span>
            <strong title={currentProject?.name || '未选择项目'}>{currentProject?.name || '未选择项目'}</strong>
            {projectBadge ? <span className="global-nav-badge" aria-label={`当前项目待处理 ${currentProjectPendingCount}`}>{projectBadge}</span> : null}
            <span className="global-nav-caret global-nav-project-caret" aria-hidden="true" />
          </summary>
          <div className="global-nav-menu global-nav-project-menu">
            <label className="global-nav-project-search">
              <span className="shell-live-region">搜索项目</span>
              <input type="search" value={projectQuery} placeholder="搜索项目名称" autoComplete="off" onChange={(event) => setProjectQuery(event.currentTarget.value)} />
            </label>
            <div className="global-nav-project-options" aria-label="可选项目">
              {filteredProjects.map((project) => (
                <button key={project.key} type="button" className={currentProject?.key === project.key ? 'active' : ''} disabled={Boolean(projectSwitchingKey)} onClick={(event) => { closeContainingNavigationMenu(event); setProjectQuery(''); onProjectChange(project); }}>
                  <span>{project.name}</span>
                  {formatNavigationBadge(project.pending_count || 0) ? <span className="global-nav-badge">{formatNavigationBadge(project.pending_count || 0)}</span> : null}
                </button>
              ))}
              {!filteredProjects.length ? <p className="global-nav-project-empty">没有匹配项目</p> : null}
            </div>
            <a href={projectsHref} onClick={(event) => { closeContainingNavigationMenu(event); onNavigate(event, projectsHref, '项目列表'); }}>查看全部项目</a>
          </div>
        </details>

        <form className="global-nav-search" role="search" onSubmit={submitSearch}>
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M10.8 5.2a5.6 5.6 0 1 0 0 11.2 5.6 5.6 0 0 0 0-11.2ZM3.6 10.8a7.2 7.2 0 1 1 12.7 4.6l3.8 3.8-1 1-3.8-3.8A7.2 7.2 0 0 1 3.6 10.8Z" /></svg>
          <label className="shell-live-region" htmlFor="global-search">全局搜索</label>
          <input id="global-search" name="q" type="search" placeholder="搜索项目、需求、任务、Bug、资料库" autoComplete="off" />
          <button type="submit">搜索</button>
        </form>

        <details className="global-nav-notifications" onKeyDown={closeNavigationMenuOnEscape} onBlur={closeNavigationMenuOnBlur}>
          <summary role="button" aria-label="打开消息通知">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Zm-8 11h4a2 2 0 0 1-4 0Z" /></svg>
            {formatNavigationBadge(unreadCount) ? <span className="global-nav-badge">{formatNavigationBadge(unreadCount)}</span> : null}
          </summary>
          <div className="global-nav-menu global-nav-notification-panel" role="dialog" aria-label="最近消息">
            <div className="global-nav-notification-head"><div><strong>消息</strong><span>{unreadCount ? `${unreadCount} 条未读` : '暂无未读'}</span></div><button type="button" disabled={notificationBusy || unreadCount === 0} onClick={onMarkAllRead}>一键已读</button></div>
            <div className="global-nav-notification-list">
              {notifications.length ? notifications.map((item) => (
                <button key={item.id} type="button" className={`global-nav-notification-item${item.read ? '' : ' unread'}`} disabled={notificationBusy} onClick={() => onOpenNotification(item)}>
                  <span className="global-nav-notification-dot" aria-hidden="true" />
                  <span className="global-nav-notification-content"><strong>{item.title}</strong><span>{item.body}</span><small>{notificationKindLabel(item.kind)} · {item.actor} · {item.createdAt}</small></span>
                </button>
              )) : <p>暂无消息</p>}
            </div>
            <a href={messagesHref} onClick={(event) => { closeContainingNavigationMenu(event); onNavigate(event, messagesHref, '消息中心'); }}>进入消息中心</a>
          </div>
        </details>

        <details className="global-nav-account" onKeyDown={closeNavigationMenuOnEscape} onBlur={closeNavigationMenuOnBlur}>
          <summary role="button" aria-label={`打开 ${displayName} 的账户菜单`}>
            <span className="global-nav-avatar" aria-hidden="true">{avatar}</span>
          </summary>
          <div className="global-nav-menu global-nav-account-menu">
            <div className="global-nav-account-head"><strong>{displayName}</strong><span>@{user?.username || 'unknown'}</span></div>
            <a href={profileHref} onClick={(event) => onNavigate(event, profileHref, '我的账号')}>我的账号</a>
            <button type="button" className="global-nav-theme" aria-pressed={theme === 'dark'}
              onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}>
              <span>深色模式</span><span className="global-nav-switch" aria-hidden="true"><span /></span>
            </button>
            <button type="button" onClick={onLogout}>退出登录</button>
          </div>
        </details>
      </div>
    </header>
  );
}
