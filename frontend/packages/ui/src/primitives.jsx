// @ts-check

import React, { useEffect, useRef } from 'react';

/** @param {{ children?: React.ReactNode, variant?: 'primary' | 'secondary' | 'danger' | 'ghost', loading?: boolean, disabled?: boolean, type?: 'button' | 'submit' | 'reset', onClick?: React.MouseEventHandler<HTMLButtonElement>, ariaLabel?: string }} props */
export function Button({ children, variant = 'primary', loading = false, disabled = false, type = 'button', onClick, ariaLabel }) {
  return <button className={`yc-button yc-button-${variant}`} type={type} disabled={disabled || loading} aria-busy={loading || undefined} aria-label={ariaLabel} onClick={onClick}>{loading ? <span className="yc-button-loading">处理中</span> : children}</button>;
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

/** @param {{ tone?: 'info' | 'success' | 'warning' | 'danger', title: string, children?: React.ReactNode, action?: React.ReactNode }} props */
export function Feedback({ tone = 'info', title, children, action }) {
  return <section className={`yc-feedback yc-feedback-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}><div><strong>{title}</strong>{children ? <div>{children}</div> : null}</div>{action}</section>;
}

/** @param {{ open: boolean, title: string, children?: React.ReactNode, footer?: React.ReactNode, onClose(): void }} props */
export function Modal({ open, title, children, footer, onClose }) {
  const ref = useRef(/** @type {HTMLDialogElement | null} */ (null));
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog ref={ref} className="yc-modal" aria-labelledby="yc-modal-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onClose={onClose}>
      <div className="yc-modal-header"><h2 id="yc-modal-title">{title}</h2><button type="button" aria-label="关闭" onClick={onClose}>×</button></div>
      <div className="yc-modal-body">{children}</div>
      {footer ? <div className="yc-modal-footer">{footer}</div> : null}
    </dialog>
  );
}

/** @template T @param {{ columns: Array<{ key: string, label: string, render(row: T): React.ReactNode }>, rows: T[], rowKey(row: T): string | number, caption: string, emptyText?: string }} props */
export function DataTable({ columns, rows, rowKey, caption, emptyText = '暂无数据' }) {
  return <div className="yc-table-wrap"><table className="yc-table"><caption className="shell-live-region">{caption}</caption><thead><tr>{columns.map((column) => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row) => <tr key={rowKey(row)}>{columns.map((column) => <td key={column.key}>{column.render(row)}</td>)}</tr>) : <tr><td colSpan={columns.length} className="yc-table-empty">{emptyText}</td></tr>}</tbody></table></div>;
}

/** @param {{ page: number, totalPages: number, totalItems: number, onPageChange(page: number): void }} props */
export function Pagination({ page, totalPages, totalItems, onPageChange }) {
  const boundedTotal = Math.max(1, totalPages);
  return <nav className="yc-pagination" aria-label="分页"><span>共 {totalItems} 条</span><div><Button variant="secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>上一页</Button><span aria-current="page">第 {page} / {boundedTotal} 页</span><Button variant="secondary" disabled={page >= boundedTotal} onClick={() => onPageChange(page + 1)}>下一页</Button></div></nav>;
}

/** @param {{ lines?: number, label?: string }} props */
export function Skeleton({ lines = 3, label = '正在加载' }) {
  const count = Math.min(12, Math.max(1, Math.floor(lines)));
  return <div className="yc-skeleton" role="status" aria-label={label}>{Array.from({ length: count }, (_, index) => <span key={index} />)}</div>;
}
