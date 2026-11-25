// @ts-check
/*
 * 按需加载的大型组件：时间排期甘特图、附件预览只在使用时下载对应代码，减小首屏主包。
 */

import React, { Suspense, lazy, useState } from 'react';

const TimeAllocationGanttImpl = lazy(() => import('./time-allocation-gantt.jsx').then((module) => ({ default: module.TimeAllocationGantt })));
const loadRichText = () => import('./rich-text.jsx');
const RichTextEditorImpl = lazy(() => loadRichText().then((module) => ({ default: module.RichTextEditor })));
const AttachmentPreviewImpl = lazy(() => import('./attachment-preview.jsx').then((module) => ({ default: module.AttachmentPreview })));

function LazyFallback() {
  return <div className="yc-lazy-loading" role="status" aria-live="polite">加载中…</div>;
}

/** @param {any} props */
export function LazyTimeAllocationGantt(props) {
  return <Suspense fallback={<LazyFallback />}><TimeAllocationGanttImpl {...props} /></Suspense>;
}

/**
 * 首次打开前不加载预览代码；加载后保持挂载，以便关闭动画与再次打开不再等待。
 * @param {any} props
 */
export function LazyAttachmentPreview(props) {
  const [requested, setRequested] = useState(Boolean(props.open));
  if (props.open && !requested) setRequested(true);
  if (!requested && !props.open) return null;
  return <Suspense fallback={props.open ? <LazyFallback /> : null}><AttachmentPreviewImpl {...props} /></Suspense>;
}

/**
 * 富文本编辑器（含 DOMPurify、marked）按需加载；占位保持编辑区高度，避免布局跳动。
 * @param {any} props
 */
export function LazyRichTextEditor(props) {
  return <Suspense fallback={<div className="yc-rich-text-root yc-lazy-loading" role="status" aria-live="polite">编辑器加载中…</div>}><RichTextEditorImpl {...props} /></Suspense>;
}

/** 空闲时预取富文本编辑器代码，首次打开编辑弹窗时无需等待。 */
export function preloadRichTextEditor() {
  return loadRichText().then(() => undefined, () => undefined);
}
