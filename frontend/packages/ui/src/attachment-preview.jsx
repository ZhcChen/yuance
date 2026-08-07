// @ts-check

import React, { useEffect, useRef } from 'react';

/**
 * @param {{ open: boolean, title: string, source: string, kind: 'image' | 'video' | 'document' | null, fileType: string | null, loading?: boolean, error?: string, position?: number, total?: number, hasPrevious?: boolean, hasNext?: boolean, onPrevious?: () => void, onNext?: () => void, onDownload: () => void, onClose: () => void }} props
 */
export function AttachmentPreview({ open, title, source, kind, fileType, loading = false, error = '', position = 0, total = 0, hasPrevious = false, hasNext = false, onPrevious, onNext, onDownload, onClose }) {
  const dialogRef = useRef(/** @type {HTMLDialogElement | null} */ (null));
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    const cancel = (event) => { event.preventDefault(); onClose(); };
    dialog.addEventListener('cancel', cancel);
    return () => dialog.removeEventListener('cancel', cancel);
  }, [onClose]);

  return (
    <dialog ref={dialogRef} className="attachment-preview" aria-labelledby="attachment-preview-title" onClose={() => { if (open) onClose(); }}>
      <header className="attachment-preview-header">
        <div><h2 id="attachment-preview-title">{title || '附件预览'}</h2>{total > 0 ? <span>{position} / {total}</span> : null}</div>
        <button type="button" aria-label="关闭附件预览" onClick={onClose}>×</button>
      </header>
      <div className="attachment-preview-stage" aria-live="polite">
        {loading ? <p className="attachment-preview-message">正在加载预览…</p> : null}
        {!loading && error ? <p className="attachment-preview-error" role="alert">{error}</p> : null}
        {!loading && !error && kind === 'image' && source ? <img src={source} alt={title} /> : null}
        {!loading && !error && kind === 'video' && source ? <video src={source} controls preload="metadata" aria-label={title} /> : null}
        {!loading && !error && kind === 'document' ? <div className="attachment-preview-document"><strong>{fileType?.toUpperCase() || 'DOCUMENT'}</strong><p>此文档暂不支持内嵌渲染，可下载后查看。</p></div> : null}
        {!loading && !error && !kind ? <p className="attachment-preview-message">此文件类型不支持预览。</p> : null}
      </div>
      <footer className="attachment-preview-footer">
        <div><button type="button" disabled={!hasPrevious || loading} onClick={onPrevious}>上一个</button><button type="button" disabled={!hasNext || loading} onClick={onNext}>下一个</button></div>
        <button type="button" onClick={onDownload}>下载</button>
      </footer>
    </dialog>
  );
}
