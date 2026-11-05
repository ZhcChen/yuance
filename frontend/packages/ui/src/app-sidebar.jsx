// @ts-check
/*
 * 应用侧栏：分组导航。
 *
 * 一级导航从顶部横排改为左侧分组侧栏：
 * 概览 / 项目 / 交付 / 协作 / 工具 / 系统。
 * 时间管理沿用现有实现，在侧栏里标注为「现网」入口；
 * 桌面端下载同样是「现网」入口，另开标签页。
 */

import React from 'react';

import { logoSrc } from './brand.js';

/** 侧栏图标：全部内联 SVG 描边路径，不用 emoji，也不用外链图标。 */
const SIDEBAR_ICONS = {
  home: ['M12 3.4 3.2 11v9.2h5.8v-6h6v6h5.8V11Z'],
  folder: ['M3.4 6.8a1.7 1.7 0 0 1 1.7-1.7h3.4l1.8 2.2h9a1.7 1.7 0 0 1 1.7 1.7v9.1a1.7 1.7 0 0 1-1.7 1.7H5.1a1.7 1.7 0 0 1-1.7-1.7Z'],
  book: ['M5.4 4.6h8.4A3.2 3.2 0 0 1 17 7.8v11.6H8.6A3.2 3.2 0 0 1 5.4 16.2Z', 'M8.8 4.6v11.6'],
  inbox: ['M4 13.2 6.8 5.6h10.4L20 13.2v5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.2Z', 'M4 13.2h4.6l1.3 2.6h4.2l1.3-2.6H20'],
  task: ['M5.4 4.8h13.2v14.4H5.4Z', 'm8.6 11.9 2.2 2.2 4.6-4.7'],
  bug: ['M9.2 8.8a2.8 2.8 0 0 1 5.6 0v6.4a2.8 2.8 0 0 1-5.6 0Z', 'M4 10.6h5.2M14.8 10.6H20M4.8 15.2h4.6M14.6 15.2h4.6M12 6.2V3.4M8.2 6.8 6.6 4.8M15.8 6.8l1.6-2'],
  message: ['M4.4 6.8a1.7 1.7 0 0 1 1.7-1.7h11.8a1.7 1.7 0 0 1 1.7 1.7v8.6a1.7 1.7 0 0 1-1.7 1.7H9.4L5 20.2v-4.1a1.7 1.7 0 0 1-.6-1.3Z'],
  clock: ['M12 3.4a8.6 8.6 0 1 0 0 17.2 8.6 8.6 0 0 0 0-17.2Z', 'M12 7.4V12l3.4 2'],
  settings: ['M3.8 7.4h16.4M3.8 12h16.4M3.8 16.6h16.4', 'M8.6 5.6h2.6v3.6H8.6ZM13.4 10.2H16v3.6h-2.6ZM6.6 14.8h2.6v3.6H6.6Z'],
  download: ['M12 4.2v9.4m0 0 3.4-3.4M12 13.6 8.6 10.2M5 17.2v1.2A1.6 1.6 0 0 0 6.6 20h10.8a1.6 1.6 0 0 0 1.6-1.6v-1.2'],
};

/** @param {{ name?: string }} props */
function SidebarIcon({ name }) {
  const paths = name ? SIDEBAR_ICONS[name] : undefined;
  if (!paths) return null;
  return (
    <svg className="app-sidebar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths.map((d) => <path key={d} d={d} />)}
    </svg>
  );
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
  return (
    <>
      {open ? <div className="app-sidebar__scrim" onClick={() => onOpenChange?.(false)} /> : null}
      <aside className="app-sidebar" data-open={open ? 'true' : 'false'}>
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
                <SidebarIcon name={item.icon} />
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
