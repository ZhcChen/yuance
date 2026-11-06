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
import { Icon } from './icons.jsx';

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
