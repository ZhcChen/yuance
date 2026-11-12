// @ts-check
import React, { useMemo, useRef, useState } from 'react';

import { useOverlayScrollbar } from './overlay-scrollbar.jsx';
import { UserAvatar } from './user-avatar.jsx';


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
 *   currentProject?: { key: string, name: string, pending_count?: number } | null,
 *   projectOptions?: Array<{ key: string, name: string, pending_count?: number }>,
 *   projectsHref: string,
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
 *   onToggleNavigation?(): void,
 *   navigationOpen?: boolean,
 * }} props
 */
export function GlobalNavigation({
  currentProject,
  projectOptions = [],
  projectsHref,
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
  onToggleNavigation,
  navigationOpen = false,
}) {
  const projectOptionsRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const notificationListRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [notificationMenuOpen, setNotificationMenuOpen] = useState(false);
  const displayName = user?.display_name || user?.username || '未知用户';
  const totalProjectPendingCount = projectOptions.reduce((total, project) => {
    const count = Number(project.pending_count || 0);
    return Number.isFinite(count) && count > 0 ? total + count : total;
  }, 0);
  const projectBadge = formatNavigationBadge(totalProjectPendingCount);
  const [projectQuery, setProjectQuery] = useState('');
  const filteredProjects = useMemo(() => {
    const query = projectQuery.trim().toLocaleLowerCase();
    return query
      ? projectOptions.filter((project) => `${project.key} ${project.name}`.toLocaleLowerCase().includes(query))
      : projectOptions;
  }, [projectOptions, projectQuery]);
  const projectOptionsScrollbar = useOverlayScrollbar({ axis: 'vertical', targetRef: projectOptionsRef, enabled: projectMenuOpen, label: '项目列表', refreshKey: filteredProjects.length });
  const notificationScrollbar = useOverlayScrollbar({ axis: 'vertical', targetRef: notificationListRef, enabled: notificationMenuOpen, label: '消息列表', refreshKey: notifications.length });

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
      {onToggleNavigation ? (
        <button className="global-nav-menu-button" type="button" aria-label={navigationOpen ? '关闭导航' : '打开导航'} aria-expanded={navigationOpen} onClick={onToggleNavigation}>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
      ) : null}
      <div className="global-nav-tools">
        <form className="global-nav-search" role="search" onSubmit={submitSearch}>
          <button className="global-nav-search-submit" type="submit" aria-label="搜索">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M10.8 5.2a5.6 5.6 0 1 0 0 11.2 5.6 5.6 0 0 0 0-11.2ZM3.6 10.8a7.2 7.2 0 1 1 12.7 4.6l3.8 3.8-1 1-3.8-3.8A7.2 7.2 0 0 1 3.6 10.8Z" /></svg>
          </button>
          <label className="shell-live-region" htmlFor="global-search">全局搜索</label>
          <input id="global-search" name="q" type="search" placeholder="搜索项目、需求、任务、Bug、资料库" autoComplete="off" />
          <kbd className="global-nav-search-hint" aria-hidden="true">Enter</kbd>
        </form>
        <div className="global-nav-project-group">
          <span className="global-nav-project-label" aria-hidden="true">当前项目</span>
          <details className="global-nav-project" onToggle={(event) => setProjectMenuOpen(event.currentTarget.open)} onKeyDown={closeNavigationMenuOnEscape} onBlur={closeNavigationMenuOnBlur}>
            <summary role="button" aria-label="切换当前项目">
              <svg className="global-nav-project-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2.5h6.5A2.5 2.5 0 0 1 21 10v7.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5v-10Z" /></svg>
              <strong title={currentProject?.name || '未选择项目'}>{currentProject?.name || '未选择项目'}</strong>
              {projectBadge ? <span className="global-nav-badge" aria-label={`全部项目待处理 ${totalProjectPendingCount}`}>{projectBadge}</span> : null}
              <span className="global-nav-caret global-nav-project-caret" aria-hidden="true" />
            </summary>
            <div className="global-nav-menu global-nav-project-menu">
              <label className="global-nav-project-search">
                <span className="shell-live-region">搜索项目</span>
                <input type="search" value={projectQuery} placeholder="搜索项目名称" autoComplete="off" onChange={(event) => setProjectQuery(event.currentTarget.value)} />
              </label>
              <div ref={projectOptionsRef} className="global-nav-project-options yc-overlay-scroll-target" aria-label="可选项目">
                {filteredProjects.map((project) => (
                  <button key={project.key} type="button" className={currentProject?.key === project.key ? 'active' : ''} disabled={Boolean(projectSwitchingKey)} onClick={(event) => { closeContainingNavigationMenu(event); setProjectQuery(''); onProjectChange(project); }}>
                    <span>{project.name}</span>
                    {formatNavigationBadge(project.pending_count || 0) ? <span className="global-nav-badge">{formatNavigationBadge(project.pending_count || 0)}</span> : null}
                  </button>
                ))}
                {!filteredProjects.length ? <p className="global-nav-project-empty">没有匹配项目</p> : null}
              </div>
              {projectOptionsScrollbar.scrollbar}
              <a href={projectsHref} onClick={(event) => { closeContainingNavigationMenu(event); onNavigate(event, projectsHref, '项目列表'); }}>查看全部项目</a>
            </div>
          </details>
        </div>
        <span className="global-nav-divider" aria-hidden="true" />

        <details className="global-nav-notifications" onToggle={(event) => setNotificationMenuOpen(event.currentTarget.open)} onKeyDown={closeNavigationMenuOnEscape} onBlur={closeNavigationMenuOnBlur}>
          <summary role="button" aria-label={formatNavigationBadge(unreadCount) ? `打开消息通知（${unreadCount} 条未读）` : '打开消息通知'}>
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Zm-8 11h4a2 2 0 0 1-4 0Z" /></svg>
            {formatNavigationBadge(unreadCount) ? <span className="global-nav-dot" aria-hidden="true" /> : null}
          </summary>
          <div className="global-nav-menu global-nav-notification-panel" role="dialog" aria-label="最近消息">
            <div className="global-nav-notification-head"><div><strong>消息</strong><span>{unreadCount ? `${unreadCount} 条未读` : '暂无未读'}</span></div><button type="button" disabled={notificationBusy || unreadCount === 0} onClick={onMarkAllRead}>一键已读</button></div>
            <div ref={notificationListRef} className="global-nav-notification-list yc-overlay-scroll-target">
              {notifications.length ? notifications.map((item) => (
                <button key={item.id} type="button" className={`global-nav-notification-item${item.read ? '' : ' unread'}`} disabled={notificationBusy} onClick={() => onOpenNotification(item)}>
                  <span className="global-nav-notification-dot" aria-hidden="true" />
                  <span className="global-nav-notification-content"><strong>{item.title}</strong><span>{item.body}</span><small>{notificationKindLabel(item.kind)} · {item.actor} · {item.createdAt}</small></span>
                </button>
              )) : <p>暂无消息</p>}
            </div>
            {notificationScrollbar.scrollbar}
            <a href={messagesHref} onClick={(event) => { closeContainingNavigationMenu(event); onNavigate(event, messagesHref, '消息中心'); }}>进入消息中心</a>
          </div>
        </details>

        <details className="global-nav-account" onKeyDown={closeNavigationMenuOnEscape} onBlur={closeNavigationMenuOnBlur}>
          <summary role="button" aria-label={`打开 ${displayName} 的账户菜单`}>
            <UserAvatar name={user?.display_name || user?.username || ''} fallback="元" className="global-nav-avatar" />
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
