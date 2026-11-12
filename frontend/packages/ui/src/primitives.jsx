// @ts-check
/* global Event, ResizeObserver, requestAnimationFrame */

import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

import { useOverlayScrollbar } from './overlay-scrollbar.jsx';
import { useAnimatedDialog } from './use-animated-dialog.js';

/** @param {React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost', size?: 'md' | 'sm', className?: string, loading?: boolean, ariaLabel?: string }} props */
export function Button({ children, variant = 'primary', size = 'md', className = '', loading = false, disabled = false, type = 'button', form, onClick, ariaLabel, ...buttonProps }) {
  const buttonClass = ['yc-button', `yc-button-${variant}`, size === 'sm' ? 'yc-button-sm' : '', className].filter(Boolean).join(' ');
  return <button className={buttonClass} type={type} form={form} disabled={disabled || loading} aria-busy={loading || undefined} aria-label={ariaLabel} onClick={onClick} {...buttonProps}>{loading ? <span className="yc-button-loading">处理中</span> : children}</button>;
}

/** @param {React.InputHTMLAttributes<HTMLInputElement> & { className?: string }} props */
export function TextInput({ className = '', ...inputProps }) {
  return <input className={`yc-text-input${className ? ` ${className}` : ''}`} {...inputProps} />;
}

/** @param {React.TextareaHTMLAttributes<HTMLTextAreaElement> & { className?: string }} props */
export function TextArea({ className = '', rows = 5, ...textareaProps }) {
  return <textarea className={`yc-textarea${className ? ` ${className}` : ''}`} rows={rows} {...textareaProps} />;
}

/** @param {React.ReactNode} children @returns {React.ReactElement[]} */
function flattenSelectOptions(children) {
  return React.Children.toArray(children).flatMap((child) => {
    if (!React.isValidElement(child)) return [];
    if (child.type === React.Fragment) return flattenSelectOptions(/** @type {{ children?: React.ReactNode }} */ (child.props).children);
    return child.type === 'option' ? [child] : [];
  });
}

/** @param {React.ReactNode} value */
function selectOptionText(value) {
  return React.Children.toArray(value).map((child) => {
    if (typeof child === 'string' || typeof child === 'number') return String(child);
    if (!React.isValidElement(child)) return '';
    const element = /** @type {React.ReactElement<{ children?: React.ReactNode }>} */ (child);
    return selectOptionText(element.props.children);
  }).join(' ');
}

/** @param {React.SelectHTMLAttributes<HTMLSelectElement> & { children?: React.ReactNode, searchable?: boolean, searchPlaceholder?: string, emptyText?: string }} props */
export function Select({ children, className = '', id, value, defaultValue = '', disabled = false, onChange, searchable = false, searchPlaceholder = '搜索选项', emptyText = '没有匹配项', ...selectProps }) {
  const generatedId = useId();
  const controlId = id || `yc-select-${generatedId}`;
  const rootRef = useRef(/** @type {HTMLSpanElement | null} */ (null));
  const nativeRef = useRef(/** @type {HTMLSelectElement | null} */ (null));
  const triggerRef = useRef(/** @type {HTMLButtonElement | null} */ (null));
  const searchRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const menuRef = useRef(/** @type {HTMLSpanElement | null} */ (null));
  const optionsRef = useRef(/** @type {HTMLSpanElement | null} */ (null));
  const [open, setOpen] = useState(false);
  const [internalValue, setInternalValue] = useState(String(defaultValue ?? ''));
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searchQuery, setSearchQuery] = useState('');
  const options = flattenSelectOptions(children);
  const selectedValue = value === undefined ? internalValue : String(value ?? '');
  const selectedIndex = options.findIndex((option) => String(option.props.value ?? '') === selectedValue);
  const selectedOption = options[selectedIndex] || options[0];
  const listboxId = `${controlId}-listbox`;
  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase();
  const visibleOptionIndices = options.map((option, index) => ({ option, index })).filter(({ option }) => {
    if (!normalizedSearchQuery) return true;
    const optionValue = String(option.props.value ?? '');
    return `${selectOptionText(option.props.children)} ${optionValue}`.toLocaleLowerCase().includes(normalizedSearchQuery);
  }).map(({ index }) => index);
  const scrollbarRefreshKey = `${open}:${searchable}:${options.length}:${visibleOptionIndices.length}`;
  const menuScrollbar = useOverlayScrollbar({ axis: 'vertical', targetRef: menuRef, enabled: open, label: '选择项', refreshKey: scrollbarRefreshKey });
  const optionsScrollbar = useOverlayScrollbar({ axis: 'vertical', targetRef: optionsRef, enabled: open, label: '选择项', refreshKey: scrollbarRefreshKey });

  useEffect(() => {
    if (!open) return undefined;
    const root = rootRef.current;
    const ownerDocument = root?.ownerDocument;
    if (!root || !ownerDocument) return undefined;
    const closeOnOutsidePointer = (event) => {
      if (!root.contains(/** @type {Node} */ (event.target))) { setOpen(false); setSearchQuery(''); }
    };
    ownerDocument.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => ownerDocument.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [open]);

  function chooseOption(index) {
    const option = options[index];
    if (!option || option.props.disabled) return;
    const nextValue = String(option.props.value ?? '');
    if (value === undefined) setInternalValue(nextValue);
    const native = nativeRef.current;
    if (native) {
      native.value = nextValue;
      native.dispatchEvent(new Event('change', { bubbles: true }));
    }
    setOpen(false);
    setSearchQuery('');
    triggerRef.current?.focus();
  }

  function handleNativeChange(event) {
    if (value === undefined) setInternalValue(event.currentTarget.value);
    onChange?.(event);
  }

  function openAt(index) {
    if (disabled) return;
    setActiveIndex(Math.max(0, index));
    setSearchQuery('');
    setOpen(true);
    if (searchable) requestAnimationFrame(() => searchRef.current?.focus());
  }

  function handleKeyDown(event) {
    if (disabled) return;
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
      setSearchQuery('');
      triggerRef.current?.focus();
      return;
    }
    const fromSearch = event.target === searchRef.current;
    if (event.key === 'Enter' || (event.key === ' ' && !fromSearch)) {
      event.preventDefault();
      if (open) chooseOption(activeIndex);
      else openAt(selectedIndex);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    if (!open) {
      openAt(selectedIndex >= 0 ? selectedIndex : direction > 0 ? 0 : options.length - 1);
      return;
    }
    const enabledIndices = visibleOptionIndices.filter((index) => !options[index]?.props.disabled);
    if (!enabledIndices.length) return;
    const currentPosition = enabledIndices.indexOf(activeIndex);
    const nextPosition = currentPosition < 0 ? (direction > 0 ? 0 : enabledIndices.length - 1) : (currentPosition + direction + enabledIndices.length) % enabledIndices.length;
    const nextIndex = enabledIndices[nextPosition];
    setActiveIndex(nextIndex);
  }

  function handleSearchChange(event) {
    const nextQuery = event.currentTarget.value;
    setSearchQuery(nextQuery);
    const normalized = nextQuery.trim().toLocaleLowerCase();
    const nextIndex = options.findIndex((option) => {
      if (option.props.disabled) return false;
      const optionValue = String(option.props.value ?? '');
      return !normalized || `${selectOptionText(option.props.children)} ${optionValue}`.toLocaleLowerCase().includes(normalized);
    });
    setActiveIndex(nextIndex);
  }

  const optionNodes = visibleOptionIndices.map((index) => {
    const option = options[index];
    const optionValue = String(option.props.value ?? '');
    const selected = optionValue === selectedValue;
    return <span key={`${optionValue}:${index}`} className={`yc-select-option${selected ? ' is-selected' : ''}${activeIndex === index ? ' is-active' : ''}${option.props.disabled ? ' is-disabled' : ''}`} role="option" aria-selected={selected} aria-disabled={option.props.disabled || undefined} onPointerMove={() => { if (!option.props.disabled) setActiveIndex(index); }} onClick={() => chooseOption(index)}><span>{option.props.children}</span><span className="yc-select-check" aria-hidden="true">✓</span></span>;
  });

  return (
    <span ref={rootRef} className={`yc-select${open ? ' is-open' : ''}${disabled ? ' is-disabled' : ''}${className ? ` ${className}` : ''}`} onKeyDown={handleKeyDown}>
      <select ref={nativeRef} className="yc-select-native" id={`${controlId}-native`} value={value} defaultValue={value === undefined ? defaultValue : undefined} disabled={disabled} onChange={handleNativeChange} tabIndex={-1} aria-hidden="true" {...selectProps}>{children}</select>
      <button ref={triggerRef} id={controlId} className="yc-select-trigger" type="button" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} aria-controls={listboxId} aria-describedby={selectProps['aria-describedby']} aria-invalid={selectProps['aria-invalid']} onClick={() => { if (open) { setOpen(false); setSearchQuery(''); } else openAt(selectedIndex); }}>
        <span className="yc-select-value">{selectedOption?.props.children || '请选择'}</span><span className="yc-select-caret" aria-hidden="true" />
      </button>
      {searchable ? <span className="yc-select-menu is-searchable" aria-hidden={!open}><span className="yc-select-search"><input ref={searchRef} type="search" value={searchQuery} placeholder={searchPlaceholder} aria-label={searchPlaceholder} tabIndex={open ? 0 : -1} onChange={handleSearchChange} /></span><span ref={optionsRef} id={listboxId} className="yc-select-options yc-overlay-scroll-target" role="listbox">{optionNodes.length ? optionNodes : <span className="yc-select-empty">{emptyText}</span>}</span></span>
        : <span ref={menuRef} id={listboxId} className="yc-select-menu yc-overlay-scroll-target" role="listbox" aria-hidden={!open}>{optionNodes}</span>}
      {menuScrollbar.scrollbar}
      {optionsScrollbar.scrollbar}
    </span>
  );
}

/** @param {{ id: string, label: string, hint?: string, error?: string, required?: boolean, children?: React.ReactElement }} props */
export function Field({ id, label, hint, error, required = false, children }) {
  if (!React.isValidElement(children)) throw new TypeError('Field requires one form control');
  const descriptionId = hint || error ? `${id}-description` : undefined;
  return (
    <div className={`yc-field ${error ? 'yc-field-error' : ''}`}>
      <label htmlFor={id}>{label}{required ? <span aria-hidden="true"> *</span> : null}</label>
      {React.cloneElement(children, { id, 'aria-describedby': descriptionId, 'aria-invalid': error ? true : undefined, required })}
      {hint || error ? <p id={descriptionId} role={error ? 'alert' : undefined}>{error || hint}</p> : null}
    </div>
  );
}

/** @param {{ children?: React.ReactNode, actions?: React.ReactNode, className?: string, ariaLabel?: string, role?: string, onSubmit?: React.FormEventHandler<HTMLFormElement> }} props */
export function FilterBar({ children, actions, className = '', ariaLabel, role, onSubmit }) {
  return (
    <form className={`yc-filter-bar${className ? ` ${className}` : ''}`} aria-label={ariaLabel} role={role} onSubmit={onSubmit}>
      {children}
      {actions ? <div className="yc-filter-actions">{actions}</div> : null}
    </form>
  );
}

/** @param {{ id: string, label: string, hint?: string, error?: string, required?: boolean, children?: React.ReactElement }} props */
export function FilterField({ id, label, hint, error, required = false, children }) {
  return <Field id={id} label={label} hint={hint} error={error} required={required}>{children}</Field>;
}

/** @param {{ tone?: 'info' | 'success' | 'warning' | 'danger', title: string, children?: React.ReactNode, action?: React.ReactNode }} props */
export function Feedback({ tone = 'info', title, children, action }) {
  return <section className={`yc-feedback yc-feedback-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}><div><strong>{title}</strong>{children ? <div>{children}</div> : null}</div>{action}</section>;
}

/** @param {{ open: boolean, message: string, onClose(): void }} props */
export function ErrorToast({ open, message, onClose }) {
  if (!open) return null;
  return <aside className="yc-error-toast" role="alert" aria-live="assertive"><span className="yc-error-toast-mark" aria-hidden="true">!</span><div><strong>操作未完成</strong><p>{message}</p></div><button type="button" aria-label="关闭提示" title="关闭提示" onClick={onClose}>×</button></aside>;
}

/** @param {{ children?: React.ReactNode, tone?: 'neutral' | 'brand' | 'info' | 'success' | 'warning' | 'danger' | 'violet' | 'sand' }} props */
export function Badge({ children, tone = 'neutral' }) {
  return <span className={`yc-badge yc-badge-${tone}`}>{children}</span>;
}

const PRIORITY_TONE = {
  P0: 'danger',
  P1: 'warning',
  P2: 'violet',
  P3: 'sand',
};

/** @param {{ priority?: string, children?: React.ReactNode }} props */
export function PriorityBadge({ priority, children }) {
  const value = children ?? priority ?? '未设置';
  const tone = PRIORITY_TONE[priority] || 'neutral';
  return <span className={`yc-badge yc-badge-${tone} yc-priority yc-priority-${priority || 'none'}`}>{value}</span>;
}

/** @param {{ children?: React.ReactNode, ariaLabel: string }} props */
export function ContentTabs({ children, ariaLabel }) {
  const tabsRef = useRef(/** @type {HTMLElement | null} */ (null));
  // 角标悬在标签右上角，最后一个标签的角标会探出标签条；给标签条留出等宽的右侧余量。
  const hasBadge = React.Children.toArray(children).some(
    (child) => React.isValidElement(child) && Number(/** @type {{ badge?: number }} */ (child.props)?.badge || 0) > 0,
  );
  const scrollbar = useOverlayScrollbar({ axis: 'horizontal', targetRef: tabsRef, label: ariaLabel, refreshKey: children });
  const hasSyncedRef = useRef(false);

  useLayoutEffect(() => {
    const tabs = tabsRef.current;
    const active = /** @type {HTMLElement | null} */ (tabs?.querySelector('.yc-content-tab.active') || null);
    const indicator = /** @type {HTMLElement | null} */ (tabs?.querySelector('.yc-content-tabs-indicator') || null);
    if (!tabs || !active || !indicator) return undefined;

    const syncIndicator = (animate) => {
      indicator.style.transition = animate ? '' : 'none';
      tabs.style.setProperty('--yc-content-tab-indicator-width', `${active.offsetWidth}px`);
      tabs.style.setProperty('--yc-content-tab-indicator-x', `${Math.max(0, active.offsetLeft - 4)}px`);
      if (!animate) requestAnimationFrame(() => { indicator.style.transition = ''; });
    };

    syncIndicator(hasSyncedRef.current);
    hasSyncedRef.current = true;
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => syncIndicator(true));
    observer?.observe(tabs);
    Array.from(tabs.querySelectorAll('.yc-content-tab')).forEach((tab) => observer?.observe(tab));
    return () => observer?.disconnect();
  }, [children]);

  return <><nav ref={tabsRef} className={`yc-content-tabs yc-overlay-scroll-target${hasBadge ? ' yc-content-tabs--badge' : ''}`} aria-label={ariaLabel}><span className="yc-content-tabs-indicator" aria-hidden="true" />{children}</nav>{scrollbar.scrollbar}</>;
}

/** @param {{ children?: React.ReactNode, href?: string, active?: boolean, badge?: number, onClick?: React.MouseEventHandler<HTMLAnchorElement | HTMLButtonElement> }} props */
export function ContentTab({ children, href, active = false, badge = 0, onClick }) {
  const content = <>{children}{badge > 0 ? <span className="yc-content-tab-badge">{badge > 99 ? '99+' : badge}</span> : null}</>;
  const className = `yc-content-tab ${active ? 'active' : ''}`;
  return href
    ? <a className={className} href={href} aria-current={active ? 'page' : undefined} onClick={/** @type {React.MouseEventHandler<HTMLAnchorElement>} */ (onClick)}>{content}</a>
    : <button className={className} type="button" aria-pressed={active} onClick={/** @type {React.MouseEventHandler<HTMLButtonElement>} */ (onClick)}>{content}</button>;
}

/** @param {{ open: boolean, title: string, wide?: boolean, children?: React.ReactNode, footer?: React.ReactNode, onClose(): void }} props */
export function Modal({ open, title, wide = false, children, footer, onClose }) {
  const ref = useRef(/** @type {HTMLDialogElement | null} */ (null));
  const bodyRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const titleId = useId();
  const bodyScrollbar = useOverlayScrollbar({ axis: 'vertical', targetRef: bodyRef, enabled: open, label: title, refreshKey: open });
  useAnimatedDialog(open, ref, 'yc-modal-closing');
  return (
    <dialog ref={ref} className={wide ? 'yc-modal yc-modal-wide' : 'yc-modal'} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }} onClose={() => { if (open) onClose(); }}>
      <div className="yc-modal-header"><h2 id={titleId}>{title}</h2><button type="button" aria-label="关闭" onClick={onClose}>×</button></div>
      <div ref={bodyRef} className="yc-modal-body yc-overlay-scroll-target">{children}</div>
      {bodyScrollbar.scrollbar}
      {footer ? <div className="yc-modal-footer">{footer}</div> : null}
    </dialog>
  );
}

/** @template T @param {{ columns: Array<{ key: string, label: string, render(row: T): React.ReactNode }>, rows: T[], rowKey(row: T): string | number, caption: string, emptyText?: string }} props */
export function DataTable({ columns, rows, rowKey, caption, emptyText = '暂无数据' }) {
  const tableRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const scrollbar = useOverlayScrollbar({ axis: 'horizontal', targetRef: tableRef, label: caption, refreshKey: rows.length });
  return <><div ref={tableRef} className="yc-table-wrap yc-overlay-scroll-target"><table className="yc-table"><caption className="shell-live-region">{caption}</caption><thead><tr>{columns.map((column) => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row) => <tr key={rowKey(row)}>{columns.map((column) => <td key={column.key}>{column.render(row)}</td>)}</tr>) : <tr><td colSpan={columns.length} className="yc-table-empty">{emptyText}</td></tr>}</tbody></table></div>{scrollbar.scrollbar}</>;
}

/** @param {{ page: number, totalPages: number, totalItems: number, onPageChange(page: number): void, ariaLabel?: string, itemLabel?: string, rangeLabel?: string, pageSize?: number, pageSizes?: number[], onPageSizeChange?: React.ChangeEventHandler<HTMLSelectElement> }} props */
export function Pagination({ page, totalPages, totalItems, onPageChange, ariaLabel = '分页', itemLabel = '条', rangeLabel = '', pageSize, pageSizes = [10, 20, 50], onPageSizeChange }) {
  const boundedTotal = Math.max(1, totalPages);
  return <nav className="yc-pagination" aria-label={ariaLabel}><span className="yc-pagination-meta"><span>共 <strong>{totalItems}</strong> {itemLabel}</span>{rangeLabel ? <small>{rangeLabel}</small> : null}</span><div className="yc-pagination-pages"><button type="button" aria-label="上一页" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>‹</button><span aria-current="page">{page} / {boundedTotal}</span><button type="button" aria-label="下一页" disabled={page >= boundedTotal} onClick={() => onPageChange(page + 1)}>›</button></div>{pageSize && onPageSizeChange ? <div className="yc-pagination-controls"><label><span>每页</span><select value={String(pageSize)} onChange={onPageSizeChange}>{pageSizes.map((value) => <option key={value} value={String(value)}>{value}</option>)}</select></label></div> : null}</nav>;
}

/**
 * 把列表渲染、空状态和分页封装在一起。数据变化时自动回到第 1 页，
 * 分页/每页数量变化只在内存中切页，父级无需维护额外状态。
 *
 * @template T
 * @param {{
 *   items: readonly T[],
 *   renderItem(item: T): React.ReactNode,
 *   itemKey(item: T): string | number,
 *   ariaLabel?: string,
 *   emptyText?: React.ReactNode,
 *   listClassName?: string,
 *   itemClassName?: string,
 *   pageSizes?: number[],
 *   defaultPageSize?: number,
 * }} props
 */
export function PaginatedList({
  items,
  renderItem,
  itemKey,
  ariaLabel = '分页列表',
  emptyText = '暂无数据',
  listClassName = 'yc-pagination-list',
  itemClassName = '',
  pageSizes = [10, 20, 50],
  defaultPageSize = 10,
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const rangeStart = items.length ? (currentPage - 1) * pageSize + 1 : 0;
  const rangeEnd = items.length ? Math.min(currentPage * pageSize, items.length) : 0;
  const visibleItems = items.slice(rangeStart - 1, rangeEnd);

  useEffect(() => {
    setPage(1);
  }, [items]);

  if (!items.length) {
    return <div className="yc-pagination-empty">{emptyText}</div>;
  }

  function changePageSize(event) {
    setPageSize(Math.max(1, Number.parseInt(event.target.value, 10) || defaultPageSize));
    setPage(1);
  }

  return (
    <>
      <ul className={listClassName} aria-label={ariaLabel}>
        {visibleItems.map((item) => (
          <li key={itemKey(item)} className={itemClassName}>{renderItem(item)}</li>
        ))}
      </ul>
      <Pagination
        ariaLabel={ariaLabel}
        page={currentPage}
        totalPages={totalPages}
        totalItems={items.length}
        rangeLabel={`当前显示 ${rangeStart}-${rangeEnd}`}
        pageSize={pageSize}
        pageSizes={pageSizes}
        onPageSizeChange={changePageSize}
        onPageChange={setPage}
      />
    </>
  );
}

/**
 * 把表格渲染、空状态和分页封装在一起，用于需要在有限高度内滚动查看的列表页。
 *
 * @template T
 * @param {{
 *   columns: Array<{ key: string, label: string, className?: string, headerClassName?: string, render(row: T): React.ReactNode }>,
 *   rows: readonly T[],
 *   rowKey(row: T): string | number,
 *   caption: string,
 *   emptyText?: React.ReactNode,
 *   tableClassName?: string,
 *   tableWrapClassName?: string,
 *   pageSizes?: number[],
 *   defaultPageSize?: number,
 * }} props
 */
export function PaginatedTable({
  columns,
  rows,
  rowKey,
  caption,
  emptyText = '暂无数据',
  tableClassName = '',
  tableWrapClassName = '',
  pageSizes = [10, 20, 50],
  defaultPageSize = 10,
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const rangeStart = rows.length ? (currentPage - 1) * pageSize + 1 : 0;
  const rangeEnd = rows.length ? Math.min(currentPage * pageSize, rows.length) : 0;
  const visibleRows = rows.slice(rangeStart - 1, rangeEnd);
  const tableRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const scrollbar = useOverlayScrollbar({ axis: 'both', targetRef: tableRef, label: caption, refreshKey: `${rows.length}:${currentPage}:${pageSize}` });

  useEffect(() => {
    setPage(1);
  }, [rows]);

  if (!rows.length) {
    return <div className="yc-pagination-empty">{emptyText}</div>;
  }

  function changePageSize(event) {
    setPageSize(Math.max(1, Number.parseInt(event.target.value, 10) || defaultPageSize));
    setPage(1);
  }

  return (
    <>
      <div ref={tableRef} className={['yc-table-wrap', 'yc-overlay-scroll-target', tableWrapClassName].filter(Boolean).join(' ')}>
        <table className={['yc-table', tableClassName].filter(Boolean).join(' ')} aria-label={caption}>
          <thead>
            <tr>
              {columns.map((column) => <th key={column.key} scope="col" className={column.headerClassName || column.className || ''}>{column.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((column) => <td key={column.key} className={column.className || ''}>{column.render(row)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {scrollbar.scrollbar}
      <Pagination
        ariaLabel={caption}
        page={currentPage}
        totalPages={totalPages}
        totalItems={rows.length}
        rangeLabel={`当前显示 ${rangeStart}-${rangeEnd}`}
        pageSize={pageSize}
        pageSizes={pageSizes}
        onPageSizeChange={changePageSize}
        onPageChange={setPage}
      />
    </>
  );
}

/** @param {{ lines?: number, label?: string }} props */
export function Skeleton({ lines = 3, label = '正在加载' }) {
  const count = Math.min(12, Math.max(1, Math.floor(lines)));
  return <div className="yc-skeleton" role="status" aria-label={label}>{Array.from({ length: count }, (_, index) => <span key={index} />)}</div>;
}

/* ===================== 设计稿新增组件 ===================== */

/** @param {{ children?: React.ReactNode, className?: string }} props */
export function Card({ children, className = '' }) {
  return <div className={`yc-card${className ? ` ${className}` : ''}`}>{children}</div>;
}

/**
 * 面板：标题区 + 主体 + 底部动作区。
 * @param {{ title?: React.ReactNode, description?: React.ReactNode, actions?: React.ReactNode, children?: React.ReactNode, footer?: React.ReactNode, flush?: boolean, pop?: boolean, className?: string, ariaLabel?: string }} props
 */
export function Panel({ title, description, actions, children, footer, flush = false, pop = false, className = '', ariaLabel }) {
  const hasHead = Boolean(title || description || actions);
  return (
    <section className={`yc-panel${pop ? ' yc-panel--pop' : ''}${className ? ` ${className}` : ''}`} aria-label={ariaLabel}>
      {hasHead ? (
        <header className="yc-panel__head">
          <div>
            <h2 className="yc-panel__title">{title}</h2>
            {description ? <div className="yc-panel__desc">{description}</div> : null}
          </div>
          {actions ? <div className="yc-panel__actions">{actions}</div> : null}
        </header>
      ) : null}
      <div className={`yc-panel__body${flush ? ' yc-panel__body--flush' : ''}`}>{children}</div>
      {footer ? <footer className="yc-panel__foot">{footer}</footer> : null}
    </section>
  );
}

/**
 * 指标磁贴：底色统一品牌浅色，只让图标按语义着色。
 * @param {{ label: React.ReactNode, value: React.ReactNode, delta?: React.ReactNode, icon?: React.ReactNode, variant?: 'brand' | 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'violet' | 'teal', className?: string }} props
 */
export function Metric({ label, value, delta, icon, variant = 'brand', className = '' }) {
  return (
    <article className={`yc-metric yc-metric--${variant}${className ? ` ${className}` : ''}`}>
      {icon ? <span className="yc-metric__icon" aria-hidden="true">{icon}</span> : null}
      <div className="yc-metric__body">
        <div className="yc-metric__label">{label}</div>
        <div className="yc-metric__value">{value}</div>
        {delta ? <div className="yc-metric__delta">{delta}</div> : null}
      </div>
    </article>
  );
}

/**
 * 状态胶囊：颜色只作辅助，语义由紧邻文字承担。
 * @param {{ children?: React.ReactNode, tone?: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'violet' | 'teal', dot?: boolean, className?: string }} props
 */
export function StatusPill({ children, tone = 'neutral', dot = true, className = '' }) {
  return (
    <span className={`yc-status-pill yc-status-pill--${tone}${className ? ` ${className}` : ''}`}>
      {dot ? <span className="yc-status-pill__dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

/**
 * 进度条。
 * @param {{ value: number, max?: number, label?: React.ReactNode, meta?: React.ReactNode, tone?: 'brand' | 'success' | 'warning' | 'danger', className?: string, ariaLabel?: string }} props
 */
export function ProgressBar({ value, max = 100, label, meta, tone = 'brand', className = '', ariaLabel }) {
  const bounded = Math.max(0, Math.min(max, Number(value) || 0));
  const percent = max > 0 ? Math.round((bounded / max) * 100) : 0;
  return (
    <div className={`yc-progress yc-progress--${tone}${className ? ` ${className}` : ''}`}>
      {label || meta ? (
        <div className="yc-progress__meta">
          <span>{label}</span>
          {meta ? <span>{meta}</span> : null}
        </div>
      ) : null}
      <div className="yc-progress__track" role="progressbar" aria-label={ariaLabel} aria-valuemin={0} aria-valuemax={max} aria-valuenow={bounded}>
        <div className="yc-progress__bar" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

/**
 * 图标磁贴。
 * @param {{ icon?: React.ReactNode, tone?: 'brand' | 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'violet' | 'teal', size?: 'md' | 'sm', className?: string }} props
 */
export function IconTile({ icon, tone = 'neutral', size = 'md', className = '' }) {
  return (
    <span className={`yc-icon-tile yc-icon-tile--${tone}${size === 'sm' ? ' yc-icon-tile--sm' : ''}${className ? ` ${className}` : ''}`} aria-hidden="true">
      {icon}
    </span>
  );
}

/**
 * 空态。
 * @param {{ icon?: React.ReactNode, title?: React.ReactNode, description?: React.ReactNode, action?: React.ReactNode, className?: string }} props
 */
export function EmptyState({ icon, title, description, action, className = '' }) {
  return (
    <div className={`yc-empty${className ? ` ${className}` : ''}`}>
      {icon ? <div className="yc-empty__icon" aria-hidden="true">{icon}</div> : null}
      {title ? <div className="yc-empty__title">{title}</div> : null}
      {description ? <div className="yc-empty__desc">{description}</div> : null}
      {action ? <div className="yc-empty__action">{action}</div> : null}
    </div>
  );
}
