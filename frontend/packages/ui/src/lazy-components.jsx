// @ts-check
/*
 * 按需加载的大型组件：时间排期甘特图、附件预览只在使用时下载对应代码，减小首屏主包。
 */

import React, { Suspense, lazy, useState } from 'react';

const TimeAllocationGanttImpl = lazy(() => import('./time-allocation-gantt.jsx').then((module) => ({ default: module.TimeAllocationGantt })));
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
