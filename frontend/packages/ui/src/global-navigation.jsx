// @ts-check

import React from 'react';

/** @param {number} count */
export function formatNavigationBadge(count) {
  if (!Number.isFinite(count) || count <= 0) return '';
  return count > 99 ? '99+' : String(Math.floor(count));
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

/**
 * @param {{
 *   productName: string,
 *   links: Array<{ id: string, label: string, href: string, active?: boolean, badge?: number }>,
 *   currentProject?: { key: string, name: string, pending_count?: number } | null,
 *   projectsHref: string,
 *   messagesHref: string,
 *   unreadCount?: number,
 *   user?: { username: string, display_name: string, is_super_admin?: boolean } | null,
 *   profileHref: string,
 *   theme: 'light' | 'dark',
 *   onNavigate(event: React.MouseEvent<HTMLAnchorElement>, href: string, label: string): void,
 *   onSearch(query: string): void,
 *   onThemeChange(theme: 'light' | 'dark'): void,
 *   onLogout(): void,
 * }} props
 */
export function GlobalNavigation({
  productName,
  links,
  currentProject,
  projectsHref,
  messagesHref,
  unreadCount = 0,
  user,
  profileHref,
  theme,
  onNavigate,
  onSearch,
  onThemeChange,
  onLogout,
}) {
  const displayName = user?.display_name || user?.username || '未知用户';
  const avatar = Array.from(displayName.trim())[0] || '元';
  const projectBadge = formatNavigationBadge(currentProject?.pending_count || 0);

  /** @param {React.FormEvent<HTMLFormElement>} event */
  function submitSearch(event) {
    event.preventDefault();
    const query = /** @type {HTMLInputElement | null} */ (event.currentTarget.elements.namedItem('q'));
    onSearch(query?.value.trim() || '');
  }

  return (
    <header className="global-nav">
      <a className="global-nav-brand" href={links[0]?.href || projectsHref} onClick={(event) => onNavigate(event, links[0]?.href || projectsHref, productName)}>
        <span className="global-nav-mark" aria-hidden="true">元</span>
        <strong>{productName}</strong>
      </a>

      <nav className="global-nav-links" aria-label="应用导航">
        {links.map((link) => {
          const badge = formatNavigationBadge(link.badge || 0);
          return (
            <a key={link.id} className={`global-nav-link ${link.active ? 'active' : ''}`} href={link.href}
              aria-current={link.active ? 'page' : undefined} onClick={(event) => onNavigate(event, link.href, link.label)}>
              {link.label}
              {badge ? <span className="global-nav-badge" aria-label={`${link.label} ${link.badge} 项`}>{badge}</span> : null}
            </a>
          );
        })}
      </nav>

      <div className="global-nav-tools">
        <details className="global-nav-project" onKeyDown={closeNavigationMenuOnEscape} onBlur={closeNavigationMenuOnBlur}>
          <summary role="button" aria-label="切换当前项目">
            <span className="global-nav-project-label">当前项目</span>
            <strong title={currentProject?.name || '未选择项目'}>{currentProject?.name || '未选择项目'}</strong>
            {projectBadge ? <span className="global-nav-badge">{projectBadge}</span> : null}
          </summary>
          <div className="global-nav-menu global-nav-project-menu">
            <p>{currentProject ? `${currentProject.key} · ${currentProject.name}` : '尚未选择当前项目'}</p>
            <a href={projectsHref} onClick={(event) => onNavigate(event, projectsHref, '项目列表')}>查看全部项目</a>
          </div>
        </details>

        <form className="global-nav-search" role="search" onSubmit={submitSearch}>
          <label className="shell-live-region" htmlFor="global-search">全局搜索</label>
          <input id="global-search" name="q" type="search" placeholder="搜索项目、需求、任务、Bug、资料库" autoComplete="off" />
          <button type="submit">搜索</button>
        </form>

        <a className="global-nav-notifications" href={messagesHref} aria-label="打开消息通知"
          onClick={(event) => onNavigate(event, messagesHref, '消息中心')}>
          <span aria-hidden="true">消息</span>
          {formatNavigationBadge(unreadCount) ? <span className="global-nav-badge">{formatNavigationBadge(unreadCount)}</span> : null}
        </a>

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
