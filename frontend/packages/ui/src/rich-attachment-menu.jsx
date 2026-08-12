// @ts-check

import React, { useEffect, useLayoutEffect, useRef } from 'react';

import { copyTextToClipboard, documentPreviewUrlFromSource, downloadUrlViaAnchor, openDocumentPreviewWindow } from './rich-attachment-actions.js';

/**
 * @param {{
 *   open: boolean,
 *   title: string,
 *   x: number,
 *   y: number,
 *   downloadUrl: string,
 *   canPreview?: boolean,
 *   onClose: () => void,
 *   onDownload?: () => void,
 *   onStatus?: (result: { tone: 'success' | 'error', text: string }) => void,
 * }} props
 */
export function RichAttachmentMenu({ open, title, x, y, downloadUrl, canPreview = false, onClose, onDownload, onStatus }) {
  const menuRef = useRef(/** @type {HTMLDivElement | null} */ (null));

  useLayoutEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    const view = menu?.ownerDocument.defaultView;
    if (!menu || !view) return;
    const margin = 10;
    const rect = menu.getBoundingClientRect();
    const left = Math.min(Math.max(margin, x), Math.max(margin, view.innerWidth - rect.width - margin));
    const top = Math.min(Math.max(margin, y), Math.max(margin, view.innerHeight - rect.height - margin));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }, [open, x, y]);

  useEffect(() => {
    if (!open) return undefined;
    const menu = menuRef.current;
    const ownerDocument = menu?.ownerDocument;
    const view = ownerDocument?.defaultView;
    if (!menu || !ownerDocument || !view) return undefined;
    const closeOnPointerDown = (event) => {
      if (!menu.contains(/** @type {Node} */ (event.target))) onClose();
    };
    const closeOnKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    const closeOnViewportChange = () => onClose();
    ownerDocument.addEventListener('pointerdown', closeOnPointerDown);
    ownerDocument.addEventListener('keydown', closeOnKeyDown);
    view.addEventListener('resize', closeOnViewportChange);
    view.addEventListener('scroll', closeOnViewportChange, true);
    return () => {
      ownerDocument.removeEventListener('pointerdown', closeOnPointerDown);
      ownerDocument.removeEventListener('keydown', closeOnKeyDown);
      view.removeEventListener('resize', closeOnViewportChange);
      view.removeEventListener('scroll', closeOnViewportChange, true);
    };
  }, [open, onClose]);

  function handleCopy() {
    const view = menuRef.current?.ownerDocument.defaultView;
    if (!view) return;
    copyTextToClipboard(view, downloadUrl)
      .then(() => onStatus?.({ tone: 'success', text: '附件链接已复制。' }))
      .catch(() => onStatus?.({ tone: 'error', text: '复制失败，请重试。' }));
  }

  function handlePreview() {
    const view = menuRef.current?.ownerDocument.defaultView;
    if (!view) return;
    if (!canPreview) {
      onStatus?.({ tone: 'error', text: '该附件不支持预览。' });
      return;
    }
    const previewUrl = documentPreviewUrlFromSource(view, downloadUrl);
    if (!previewUrl || !openDocumentPreviewWindow(view, previewUrl)) {
      onStatus?.({ tone: 'error', text: '浏览器阻止了新标签页预览，请允许弹出新页面后重试。' });
    }
  }

  function handleDownload() {
    if (onDownload) {
      onDownload();
      return;
    }
    const view = menuRef.current?.ownerDocument.defaultView;
    if (!view) return;
    downloadUrlViaAnchor(view, downloadUrl, title);
  }

  if (!open) return null;
  return (
    <div
      ref={menuRef}
      className="rich-attachment-menu"
      role="menu"
      aria-label={`附件操作：${title}`}
      style={{ left: x, top: y }}
    >
      <div className="rich-attachment-menu-title">{title}</div>
      <button type="button" role="menuitem" onClick={() => { handleCopy(); onClose(); }}><span>复制链接</span><em>复制附件访问地址</em></button>
      {canPreview ? <button type="button" role="menuitem" onClick={() => { handlePreview(); onClose(); }}><span>预览</span><em>查看文档</em></button> : null}
      <button type="button" role="menuitem" onClick={() => { handleDownload(); onClose(); }}><span>下载</span><em>保存到本地</em></button>
    </div>
  );
}
