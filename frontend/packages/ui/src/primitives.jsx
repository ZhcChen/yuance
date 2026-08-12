// @ts-check
/* global Event, ResizeObserver, requestAnimationFrame */

import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

/** @param {{ children?: React.ReactNode, variant?: 'primary' | 'secondary' | 'danger' | 'ghost', size?: 'md' | 'sm', className?: string, loading?: boolean, disabled?: boolean, type?: 'button' | 'submit' | 'reset', form?: string, onClick?: React.MouseEventHandler<HTMLButtonElement>, ariaLabel?: string }} props */
export function Button({ children, variant = 'primary', size = 'md', className = '', loading = false, disabled = false, type = 'button', form, onClick, ariaLabel }) {
  const buttonClass = ['yc-button', `yc-button-${variant}`, size === 'sm' ? 'yc-button-sm' : '', className].filter(Boolean).join(' ');
  return <button className={buttonClass} type={type} form={form} disabled={disabled || loading} aria-busy={loading || undefined} aria-label={ariaLabel} onClick={onClick}>{loading ? <span className="yc-button-loading">处理中</span> : children}</button>;
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

/** @param {React.SelectHTMLAttributes<HTMLSelectElement> & { children?: React.ReactNode }} props */
export function Select({ children, className = '', id, value, defaultValue = '', disabled = false, onChange, ...selectProps }) {
  const generatedId = useId();
  const controlId = id || `yc-select-${generatedId}`;
  const rootRef = useRef(/** @type {HTMLSpanElement | null} */ (null));
  const nativeRef = useRef(/** @type {HTMLSelectElement | null} */ (null));
  const [open, setOpen] = useState(false);
  const [internalValue, setInternalValue] = useState(String(defaultValue ?? ''));
  const [activeIndex, setActiveIndex] = useState(-1);
  const options = flattenSelectOptions(children);
  const selectedValue = value === undefined ? internalValue : String(value ?? '');
  const selectedIndex = options.findIndex((option) => String(option.props.value ?? '') === selectedValue);
  const selectedOption = options[selectedIndex] || options[0];
  const listboxId = `${controlId}-listbox`;

  useEffect(() => {
    if (!open) return undefined;
    const root = rootRef.current;
    const ownerDocument = root?.ownerDocument;
    if (!root || !ownerDocument) return undefined;
    const closeOnOutsidePointer = (event) => {
      if (!root.contains(/** @type {Node} */ (event.target))) setOpen(false);
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
  }

  function handleNativeChange(event) {
    if (value === undefined) setInternalValue(event.currentTarget.value);
    onChange?.(event);
  }

  function openAt(index) {
    if (disabled) return;
    setActiveIndex(Math.max(0, index));
    setOpen(true);
  }

  function handleKeyDown(event) {
    if (disabled) return;
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
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
    let nextIndex = activeIndex;
    do nextIndex = (nextIndex + direction + options.length) % options.length;
    while (options[nextIndex]?.props.disabled && nextIndex !== activeIndex);
    setActiveIndex(nextIndex);
  }

  return (
    <span ref={rootRef} className={`yc-select${open ? ' is-open' : ''}${disabled ? ' is-disabled' : ''}${className ? ` ${className}` : ''}`} onKeyDown={handleKeyDown}>
      <select ref={nativeRef} className="yc-select-native" id={`${controlId}-native`} value={value} defaultValue={value === undefined ? defaultValue : undefined} disabled={disabled} onChange={handleNativeChange} tabIndex={-1} aria-hidden="true" {...selectProps}>{children}</select>
      <button id={controlId} className="yc-select-trigger" type="button" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} aria-controls={listboxId} aria-describedby={selectProps['aria-describedby']} aria-invalid={selectProps['aria-invalid']} onClick={() => open ? setOpen(false) : openAt(selectedIndex)}>
        <span className="yc-select-value">{selectedOption?.props.children || '请选择'}</span><span className="yc-select-caret" aria-hidden="true" />
      </button>
      <span id={listboxId} className="yc-select-menu" role="listbox" aria-hidden={!open}>
        {options.map((option, index) => {
          const optionValue = String(option.props.value ?? '');
          const selected = optionValue === selectedValue;
          return <span key={`${optionValue}:${index}`} className={`yc-select-option${selected ? ' is-selected' : ''}${activeIndex === index ? ' is-active' : ''}${option.props.disabled ? ' is-disabled' : ''}`} role="option" aria-selected={selected} aria-disabled={option.props.disabled || undefined} onPointerMove={() => { if (!option.props.disabled) setActiveIndex(index); }} onClick={() => chooseOption(index)}><span>{option.props.children}</span><span className="yc-select-check" aria-hidden="true">✓</span></span>;
        })}
      </span>
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

/** @param {{ children?: React.ReactNode, tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'violet' | 'sand' }} props */
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

  return <nav ref={tabsRef} className="yc-content-tabs" aria-label={ariaLabel}><span className="yc-content-tabs-indicator" aria-hidden="true" />{children}</nav>;
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
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog ref={ref} className={wide ? 'yc-modal yc-modal-wide' : 'yc-modal'} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }} onClose={onClose}>
      <div className="yc-modal-header"><h2 id={titleId}>{title}</h2><button type="button" aria-label="关闭" onClick={onClose}>×</button></div>
      <div className="yc-modal-body">{children}</div>
      {footer ? <div className="yc-modal-footer">{footer}</div> : null}
    </dialog>
  );
}

/** @template T @param {{ columns: Array<{ key: string, label: string, render(row: T): React.ReactNode }>, rows: T[], rowKey(row: T): string | number, caption: string, emptyText?: string }} props */
export function DataTable({ columns, rows, rowKey, caption, emptyText = '暂无数据' }) {
  return <div className="yc-table-wrap"><table className="yc-table"><caption className="shell-live-region">{caption}</caption><thead><tr>{columns.map((column) => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row) => <tr key={rowKey(row)}>{columns.map((column) => <td key={column.key}>{column.render(row)}</td>)}</tr>) : <tr><td colSpan={columns.length} className="yc-table-empty">{emptyText}</td></tr>}</tbody></table></div>;
}

/** @param {{ page: number, totalPages: number, totalItems: number, onPageChange(page: number): void, ariaLabel?: string, itemLabel?: string, rangeLabel?: string, pageSize?: number, pageSizes?: number[], onPageSizeChange?: React.ChangeEventHandler<HTMLSelectElement> }} props */
export function Pagination({ page, totalPages, totalItems, onPageChange, ariaLabel = '分页', itemLabel = '条', rangeLabel = '', pageSize, pageSizes = [10, 20, 50], onPageSizeChange }) {
  const boundedTotal = Math.max(1, totalPages);
  return <nav className="yc-pagination" aria-label={ariaLabel}><span className="yc-pagination-meta"><span>共 <strong>{totalItems}</strong> {itemLabel}</span>{rangeLabel ? <small>{rangeLabel}</small> : null}</span><div className="yc-pagination-pages"><button type="button" aria-label="上一页" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>‹</button><span aria-current="page">{page} / {boundedTotal}</span><button type="button" aria-label="下一页" disabled={page >= boundedTotal} onClick={() => onPageChange(page + 1)}>›</button></div>{pageSize && onPageSizeChange ? <div className="yc-pagination-controls"><label><span>每页</span><select value={String(pageSize)} onChange={onPageSizeChange}>{pageSizes.map((value) => <option key={value} value={String(value)}>{value}</option>)}</select></label></div> : null}</nav>;
}

/** @param {{ lines?: number, label?: string }} props */
export function Skeleton({ lines = 3, label = '正在加载' }) {
  const count = Math.min(12, Math.max(1, Math.floor(lines)));
  return <div className="yc-skeleton" role="status" aria-label={label}>{Array.from({ length: count }, (_, index) => <span key={index} />)}</div>;
}
