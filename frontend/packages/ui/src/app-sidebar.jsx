// @ts-check
/*
 * 应用侧栏：分组导航。
 *
 * 一级导航从顶部横排改为左侧分组侧栏：
 * 概览 / 项目 / 交付 / 协作 / 工具 / 系统。
 */

import React, { useSyncExternalStore } from 'react';

import { logoSrc } from './brand.js';
import { Icon } from './icons.jsx';

/** 与样式表 `@media (max-width: 768px)` 一致：此宽度下侧栏收起为抽屉。 */
const OFF_CANVAS_QUERY = '(max-width: 768px)';

function subscribeOffCanvas(callback) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const media = window.matchMedia(OFF_CANVAS_QUERY);
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}

function isOffCanvas() {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.(OFF_CANVAS_QUERY).matches);
}

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   href: string,
 *   icon?: string,
 *   active?: boolean,
 *   badge?: string,
 *   external?: boolean,
 *   title?: string,
 * }} SidebarItem
 *
 * @typedef {{ id: string, label: string, items: SidebarItem[] }} SidebarGroup
 *
 * @param {{
 *   productName: string,
 *   groups: SidebarGroup[],
 *   onNavigate?(event: React.MouseEvent<HTMLAnchorElement>, href: string, label: string): void,
 *   onOpenChange?(open: boolean): void,
 *   open?: boolean,
 *   footer?: React.ReactNode,
 * }} props
 */
export function AppSidebar({ productName, groups, onNavigate, onOpenChange, open = false, footer }) {
  const offCanvas = useSyncExternalStore(subscribeOffCanvas, isOffCanvas, () => false);
  // 窄屏收起时侧栏移出视口，但仍在 DOM 中：设为 inert，避免 Tab 聚焦到看不见的链接。
  const hidden = offCanvas && !open;
  return (
    <>
      {open ? <div className="app-sidebar__scrim" onClick={() => onOpenChange?.(false)} /> : null}
      <aside className="app-sidebar" data-open={open ? 'true' : 'false'} inert={hidden || undefined} aria-hidden={hidden || undefined}>
      <div className="app-sidebar__brand">
        <img className="app-sidebar__logo" src={logoSrc} alt="" width="32" height="32" />
        <span className="app-sidebar__name">{productName}</span>
      </div>

      <nav className="app-sidebar__nav" aria-label="主导航">
        {groups.map((group) => (
          <div className="app-sidebar__group" key={group.id}>
            <div className="app-sidebar__group-label">{group.label}</div>
            {group.items.map((item) => (
              <a
                key={item.id}
                className={`app-sidebar__link${item.active ? ' active' : ''}`}
                href={item.href}
                aria-current={item.active ? 'page' : undefined}
                title={item.title || item.label}
                target={item.external ? '_blank' : undefined}
                rel={item.external ? 'noreferrer noopener' : undefined}
                onClick={item.external || !onNavigate ? undefined : (event) => { onOpenChange?.(false); onNavigate(event, item.href, item.label); }}
              >
                <Icon name={item.icon || ''} className="app-sidebar__icon" />
                <span className="app-sidebar__label">{item.label}</span>
                {item.badge ? <span className="app-sidebar__badge">{item.badge}</span> : null}
              </a>
            ))}
          </div>
        ))}
      </nav>

      {footer ? <div className="app-sidebar__footer">{footer}</div> : null}
      </aside>
    </>
  );
}
