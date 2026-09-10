// @ts-check
/* global ResizeObserver, MutationObserver */

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** @typedef {{ top: number, right: number, bottom: number, left: number, width: number, height: number }} OverlayScrollbarRect */
/** @typedef {{ thumbSize: number, position: number, trackSize: number, maxScroll: number, scrollPosition: number }} OverlayScrollbarAxisMetrics */
/** @typedef {{ thumbSize: number, trackSize: number, maxScroll: number, clientSize: number }} OverlayScrollbarManagerAxisMetrics */
/** @typedef {{ rect: OverlayScrollbarRect | null, vertical: OverlayScrollbarAxisMetrics | null, horizontal: OverlayScrollbarAxisMetrics | null }} OverlayScrollbarMetrics */

/** @type {OverlayScrollbarMetrics} */
const EMPTY_METRICS = { rect: null, vertical: null, horizontal: null };
const MIN_THUMB_SIZE = 32;
const SCROLLBAR_SIZE = 8;
let targetSequence = 0;
const explicitlyManagedTargets = new WeakSet();

/** @param {number} value @param {number} minimum @param {number} maximum */
function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

/** @param {unknown} left @param {unknown} right */
function sameMetrics(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** @param {DOMRect} rect @param {Window} view @returns {OverlayScrollbarRect | null} */
function visibleRectFor(rect, view) {
  const top = Math.max(0, rect.top);
  const right = Math.min(view.innerWidth, rect.right);
  const bottom = Math.min(view.innerHeight, rect.bottom);
  const left = Math.max(0, rect.left);
  if (right <= left || bottom <= top) return null;
  return { top, right, bottom, left, width: right - left, height: bottom - top };
}

/** @param {HTMLElement} target @returns {string} */
function ensureTargetId(target) {
  if (target.id) return target.id;
  target.id = `yc-overlay-scroll-target-${++targetSequence}`;
  return target.id;
}

/** @param {Element | null} element @returns {boolean} */
function isOverlayScrollbarNode(element) {
  return Boolean(element?.classList?.contains('yc-overlay-scrollbar'));
}

/**
 * 为指定滚动容器提供不参与布局的浮层滚动条。
 * 原生滚动条在 Chromium 中无法稳定地覆盖滚动内容，因此由这个 hook 负责同步位置、尺寸和拖动行为。
 *
 * @template {HTMLElement} T
 * @param {{ axis?: 'vertical' | 'horizontal' | 'both', targetRef?: React.MutableRefObject<T | null>, enabled?: boolean, label?: string, refreshKey?: unknown }} [options]
 * @returns {{ ref: React.MutableRefObject<T | null>, scrollbar: React.ReactNode }}
 */
export function useOverlayScrollbar({ axis = 'both', targetRef, enabled = true, label = '滚动区域', refreshKey = null } = {}) {
  const internalRef = useRef(/** @type {T | null} */ (null));
  const ref = targetRef || internalRef;
  const [metrics, setMetrics] = useState(/** @type {OverlayScrollbarMetrics} */ (EMPTY_METRICS));
  const metricsRef = useRef(metrics);
  const dragRef = useRef(/** @type {{ axis: 'vertical' | 'horizontal', pointerId: number, startCoordinate: number, startScroll: number } | null} */ (null));
  metricsRef.current = metrics;

  useLayoutEffect(() => {
    const target = ref.current;
    if (!target) return undefined;
    explicitlyManagedTargets.add(target);
    return () => { explicitlyManagedTargets.delete(target); };
  }, [ref, refreshKey]);

  useLayoutEffect(() => {
    if (!enabled) {
      setMetrics(EMPTY_METRICS);
      return undefined;
    }
    const target = ref.current;
    const view = target?.ownerDocument.defaultView;
    if (!target || !view) return undefined;
    const hadOverlayTargetClass = target.classList.contains('yc-overlay-scroll-target');
    if (!hadOverlayTargetClass) target.classList.add('yc-overlay-scroll-target');
    ensureTargetId(target);
    setMetrics(EMPTY_METRICS);

    let frame = 0;
    /** @param {FrameRequestCallback} callback */
    const scheduleFrame = (callback) => {
      if (frame) return;
      frame = typeof view.requestAnimationFrame === 'function'
        ? view.requestAnimationFrame(callback)
        : view.setTimeout(() => { frame = 0; callback(0); }, 0);
    };
    const cancelFrame = () => {
      if (!frame) return;
      if (typeof view.cancelAnimationFrame === 'function') view.cancelAnimationFrame(frame);
      else view.clearTimeout(frame);
      frame = 0;
    };

    const sync = () => {
      frame = 0;
      const rect = visibleRectFor(target.getBoundingClientRect(), view);
      /** @type {OverlayScrollbarMetrics} */
      const next = {
        rect,
        vertical: null,
        horizontal: null,
      };
      const nextRect = next.rect;
      const hasVerticalOverflow = Boolean(nextRect && (axis === 'vertical' || axis === 'both') && target.scrollHeight > target.clientHeight + 1);
      const hasHorizontalOverflow = Boolean(nextRect && (axis === 'horizontal' || axis === 'both') && target.scrollWidth > target.clientWidth + 1);
      if (hasVerticalOverflow && nextRect) {
        const trackSize = Math.max(0, nextRect.height - (hasHorizontalOverflow ? SCROLLBAR_SIZE : 0));
        const thumbSize = Math.min(trackSize, Math.max(MIN_THUMB_SIZE, (target.clientHeight / target.scrollHeight) * trackSize));
        const maxScroll = target.scrollHeight - target.clientHeight;
        next.vertical = {
          thumbSize,
          position: maxScroll > 0 ? (target.scrollTop / maxScroll) * Math.max(0, trackSize - thumbSize) : 0,
          trackSize,
          maxScroll,
          scrollPosition: target.scrollTop,
        };
      }
      if (hasHorizontalOverflow && nextRect) {
        const trackSize = Math.max(0, nextRect.width - (hasVerticalOverflow ? SCROLLBAR_SIZE : 0));
        const thumbSize = Math.min(trackSize, Math.max(MIN_THUMB_SIZE, (target.clientWidth / target.scrollWidth) * trackSize));
        const maxScroll = target.scrollWidth - target.clientWidth;
        next.horizontal = {
          thumbSize,
          position: maxScroll > 0 ? (target.scrollLeft / maxScroll) * Math.max(0, trackSize - thumbSize) : 0,
          trackSize,
          maxScroll,
          scrollPosition: target.scrollLeft,
        };
      }
      setMetrics((current) => sameMetrics(current, next) ? current : next);
    };
    const schedule = () => scheduleFrame(sync);
    const portalHost = overlayPortalHost(target, target.ownerDocument);

    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    resizeObserver?.observe(target);
    const mutationObserver = typeof MutationObserver === 'function' ? new MutationObserver(schedule) : null;
    mutationObserver?.observe(target, { childList: true, subtree: true, characterData: true, attributes: true });
    target.addEventListener('scroll', schedule, { passive: true });
    view.addEventListener('resize', schedule);
    view.addEventListener('scroll', schedule, true);
    portalHost.addEventListener('transitionend', schedule);
    portalHost.addEventListener('animationend', schedule);
    schedule();

    return () => {
      cancelFrame();
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      target.removeEventListener('scroll', schedule);
      view.removeEventListener('resize', schedule);
      view.removeEventListener('scroll', schedule, true);
      portalHost.removeEventListener('transitionend', schedule);
      portalHost.removeEventListener('animationend', schedule);
      dragRef.current = null;
      if (!hadOverlayTargetClass) target.classList.remove('yc-overlay-scroll-target');
      setMetrics(EMPTY_METRICS);
    };
  }, [axis, enabled, ref, refreshKey]);

  /** @param {'vertical' | 'horizontal'} scrollbarAxis */
  function scrollPositionFor(scrollbarAxis) {
    const target = ref.current;
    if (!target) return 0;
    return scrollbarAxis === 'vertical' ? target.scrollTop : target.scrollLeft;
  }

  /** @param {'vertical' | 'horizontal'} scrollbarAxis @param {number} value */
  function setScrollPosition(scrollbarAxis, value) {
    const target = ref.current;
    if (!target) return;
    const data = metricsRef.current[scrollbarAxis];
    if (!data) return;
    const next = clamp(value, 0, data.maxScroll);
    if (scrollbarAxis === 'vertical') target.scrollTop = next;
    else target.scrollLeft = next;
  }

  /** @param {'vertical' | 'horizontal'} scrollbarAxis @param {React.PointerEvent<HTMLDivElement>} event */
  function handleTrackPointerDown(scrollbarAxis, event) {
    if (event.target !== event.currentTarget) return;
    const target = ref.current;
    const data = metricsRef.current[scrollbarAxis];
    if (!target || !data) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const coordinate = scrollbarAxis === 'vertical' ? event.clientY - bounds.top : event.clientX - bounds.left;
    const travel = Math.max(0, data.trackSize - data.thumbSize);
    const position = clamp(coordinate - data.thumbSize / 2, 0, travel);
    setScrollPosition(scrollbarAxis, travel > 0 ? (position / travel) * data.maxScroll : 0);
  }

  /** @param {'vertical' | 'horizontal'} scrollbarAxis @param {React.PointerEvent<HTMLDivElement>} event */
  function handleThumbPointerDown(scrollbarAxis, event) {
    const target = ref.current;
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });
    dragRef.current = {
      axis: scrollbarAxis,
      pointerId: event.pointerId,
      startCoordinate: scrollbarAxis === 'vertical' ? event.clientY : event.clientX,
      startScroll: scrollPositionFor(scrollbarAxis),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  /** @param {'vertical' | 'horizontal'} scrollbarAxis @param {React.PointerEvent<HTMLDivElement>} event */
  function handleThumbPointerMove(scrollbarAxis, event) {
    const drag = dragRef.current;
    const data = metricsRef.current[scrollbarAxis];
    if (!drag || drag.axis !== scrollbarAxis || drag.pointerId !== event.pointerId || !data) return;
    const coordinate = scrollbarAxis === 'vertical' ? event.clientY : event.clientX;
    const travel = data.trackSize - data.thumbSize;
    if (travel <= 0) return;
    setScrollPosition(scrollbarAxis, drag.startScroll + ((coordinate - drag.startCoordinate) / travel) * data.maxScroll);
  }

  /** @param {React.PointerEvent<HTMLDivElement>} event */
  function handleThumbPointerUp(event) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  /** @param {'vertical' | 'horizontal'} scrollbarAxis @param {React.KeyboardEvent<HTMLDivElement>} event */
  function handleThumbKeyDown(scrollbarAxis, event) {
    const data = metricsRef.current[scrollbarAxis];
    if (!data) return;
    const isVertical = scrollbarAxis === 'vertical';
    const forward = isVertical ? ['ArrowDown', 'PageDown'] : ['ArrowRight', 'PageDown'];
    const backward = isVertical ? ['ArrowUp', 'PageUp'] : ['ArrowLeft', 'PageUp'];
    if (event.key === 'Home') {
      event.preventDefault();
      setScrollPosition(scrollbarAxis, 0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setScrollPosition(scrollbarAxis, data.maxScroll);
    } else if (forward.includes(event.key)) {
      event.preventDefault();
      setScrollPosition(scrollbarAxis, scrollPositionFor(scrollbarAxis) + (event.key === 'PageDown' ? data.trackSize : 40));
    } else if (backward.includes(event.key)) {
      event.preventDefault();
      setScrollPosition(scrollbarAxis, scrollPositionFor(scrollbarAxis) - (event.key === 'PageUp' ? data.trackSize : 40));
    }
  }

  const target = ref.current;
  const ownerDocument = target?.ownerDocument;
  if (!enabled || !target || !ownerDocument?.body || !metrics.rect) return { ref, scrollbar: null };

  const scrollbarAxes = /** @type {Array<'vertical' | 'horizontal'>} */ (['vertical', 'horizontal']);
  const portalHost = overlayPortalHost(target, ownerDocument);
  const hostRect = portalHost === ownerDocument.body ? null : portalHost.getBoundingClientRect();
  const portalPosition = /** @type {React.CSSProperties['position']} */ (portalHost === ownerDocument.body ? 'fixed' : 'absolute');
  const scrollbarNodes = scrollbarAxes.map((scrollbarAxis) => {
    const data = metrics[scrollbarAxis];
    const rect = metrics.rect;
    if (!data || !rect) return null;
    const isVertical = scrollbarAxis === 'vertical';
    const className = `yc-overlay-scrollbar yc-overlay-scrollbar-${scrollbarAxis}`;
    const trackStyle = isVertical
      ? { position: portalPosition, top: hostTop(rect.top, hostRect, portalHost), left: hostLeft(rect.right - SCROLLBAR_SIZE, hostRect, portalHost), height: Math.max(0, rect.height - (metrics.horizontal ? SCROLLBAR_SIZE : 0)) }
      : { position: portalPosition, left: hostLeft(rect.left, hostRect, portalHost), top: hostTop(rect.bottom - SCROLLBAR_SIZE, hostRect, portalHost), width: Math.max(0, rect.width - (metrics.vertical ? SCROLLBAR_SIZE : 0)) };
    const thumbStyle = isVertical
      ? { height: data.thumbSize, transform: `translateY(${data.position}px)` }
      : { width: data.thumbSize, transform: `translateX(${data.position}px)` };
    return <div key={scrollbarAxis} className={className} style={trackStyle} onPointerDown={(event) => handleTrackPointerDown(scrollbarAxis, event)}>
      <div
        className="yc-overlay-scrollbar-thumb"
        role="scrollbar"
        tabIndex={0}
        aria-label={`${label}${isVertical ? '垂直' : '水平'}滚动条`}
        aria-orientation={scrollbarAxis}
        aria-valuemin={0}
        aria-valuemax={Math.round(data.maxScroll)}
        aria-valuenow={Math.round(data.scrollPosition)}
        aria-controls={target.id || undefined}
        style={thumbStyle}
        onPointerDown={(event) => handleThumbPointerDown(scrollbarAxis, event)}
        onPointerMove={(event) => handleThumbPointerMove(scrollbarAxis, event)}
        onPointerUp={handleThumbPointerUp}
        onPointerCancel={handleThumbPointerUp}
        onKeyDown={(event) => handleThumbKeyDown(scrollbarAxis, event)}
      />
    </div>;
  });

  return { ref, scrollbar: createPortal(scrollbarNodes, portalHost) };
}

function isScrollOverflow(value) {
  return value === 'auto' || value === 'scroll' || value === 'overlay';
}

function isDocumentTarget(target, documentRef) {
  return target === documentRef.scrollingElement;
}

function targetRect(target, documentRef, view) {
  if (isDocumentTarget(target, documentRef)) return { top: 0, right: view.innerWidth, bottom: view.innerHeight, left: 0, width: view.innerWidth, height: view.innerHeight };
  return visibleRectFor(target.getBoundingClientRect(), view);
}

/** @param {HTMLElement} target @param {Document} ownerDocument */
function overlayPortalHost(target, ownerDocument) {
  const dialog = target.closest('dialog');
  return dialog ? /** @type {HTMLElement} */ (dialog) : ownerDocument.body;
}

/** @param {number} value @param {DOMRect | null} hostRect @param {HTMLElement} host */
function hostTop(value, hostRect, host) {
  return hostRect ? value - hostRect.top - host.clientTop : value;
}

/** @param {number} value @param {DOMRect | null} hostRect @param {HTMLElement} host */
function hostLeft(value, hostRect, host) {
  return hostRect ? value - hostRect.left - host.clientLeft : value;
}

function targetScroll(target, axis, documentRef, view) {
  if (isDocumentTarget(target, documentRef)) return axis === 'vertical' ? view.scrollY : view.scrollX;
  return axis === 'vertical' ? target.scrollTop : target.scrollLeft;
}

function setTargetScroll(target, axis, value, documentRef, view) {
  if (isDocumentTarget(target, documentRef)) {
    if (axis === 'vertical') view.scrollTo(view.scrollX, value);
    else view.scrollTo(value, view.scrollY);
    return;
  }
  if (axis === 'vertical') target.scrollTop = value;
  else target.scrollLeft = value;
}

/** @typedef {{ target: HTMLElement, ownerDocument: Document, view: Window, metrics: { vertical: OverlayScrollbarManagerAxisMetrics | null, horizontal: OverlayScrollbarManagerAxisMetrics | null }, tracks: Record<'vertical' | 'horizontal', { track: HTMLDivElement, thumb: HTMLDivElement }>, frame: number, drag: { axis: 'vertical' | 'horizontal', pointerId: number, startCoordinate: number, startScroll: number } | null, resizeObserver: ResizeObserver | null, schedule: () => void }} OverlayScrollbarManagerRecord */

/** @param {HTMLElement} target @param {'vertical' | 'horizontal'} axis @param {string} label @param {OverlayScrollbarManagerRecord} record */
function createManagerTrack(target, axis, label, record) {
  const track = record.ownerDocument.createElement('div');
  track.className = `yc-overlay-scrollbar yc-overlay-scrollbar-${axis}`;
  track.dataset.ycOverlayScrollbar = axis;

  const thumb = record.ownerDocument.createElement('div');
  thumb.className = 'yc-overlay-scrollbar-thumb';
  thumb.setAttribute('role', 'scrollbar');
  thumb.tabIndex = -1;
  thumb.setAttribute('aria-label', `${label}${axis === 'vertical' ? '垂直' : '水平'}滚动条`);
  thumb.setAttribute('aria-orientation', axis);
  thumb.setAttribute('aria-valuemin', '0');
  thumb.setAttribute('aria-valuemax', '0');
  thumb.setAttribute('aria-valuenow', '0');
  thumb.addEventListener('pointerdown', (event) => {
    const data = record.metrics[axis];
    if (!data) return;
    event.preventDefault();
    event.stopPropagation();
    thumb.focus({ preventScroll: true });
    record.drag = { axis, pointerId: event.pointerId, startCoordinate: axis === 'vertical' ? event.clientY : event.clientX, startScroll: targetScroll(target, axis, record.ownerDocument, record.view) };
    thumb.setPointerCapture(event.pointerId);
  });
  thumb.addEventListener('pointermove', (event) => {
    const drag = record.drag;
    const data = record.metrics[axis];
    if (!drag || drag.axis !== axis || drag.pointerId !== event.pointerId || !data) return;
    const coordinate = axis === 'vertical' ? event.clientY : event.clientX;
    const travel = data.trackSize - data.thumbSize;
    if (travel <= 0) return;
    setTargetScroll(target, axis, drag.startScroll + ((coordinate - drag.startCoordinate) / travel) * data.maxScroll, record.ownerDocument, record.view);
    record.schedule();
  });
  const releasePointer = (event) => {
    if (record.drag?.pointerId !== event.pointerId) return;
    record.drag = null;
    if (thumb.hasPointerCapture(event.pointerId)) thumb.releasePointerCapture(event.pointerId);
  };
  thumb.addEventListener('pointerup', releasePointer);
  thumb.addEventListener('pointercancel', releasePointer);
  thumb.addEventListener('keydown', (event) => {
    const data = record.metrics[axis];
    if (!data) return;
    const current = targetScroll(target, axis, record.ownerDocument, record.view);
    const forward = axis === 'vertical' ? ['ArrowDown', 'PageDown'] : ['ArrowRight', 'PageDown'];
    const backward = axis === 'vertical' ? ['ArrowUp', 'PageUp'] : ['ArrowLeft', 'PageUp'];
    if (event.key === 'Home') {
      event.preventDefault();
      setTargetScroll(target, axis, 0, record.ownerDocument, record.view);
    } else if (event.key === 'End') {
      event.preventDefault();
      setTargetScroll(target, axis, data.maxScroll, record.ownerDocument, record.view);
    } else if (forward.includes(event.key)) {
      event.preventDefault();
      setTargetScroll(target, axis, current + (event.key === 'PageDown' ? data.clientSize : 40), record.ownerDocument, record.view);
    } else if (backward.includes(event.key)) {
      event.preventDefault();
      setTargetScroll(target, axis, current - (event.key === 'PageUp' ? data.clientSize : 40), record.ownerDocument, record.view);
    } else {
      return;
    }
    record.schedule();
  });
  track.addEventListener('pointerdown', (event) => {
    if (event.target !== track) return;
    const data = record.metrics[axis];
    if (!data) return;
    const bounds = track.getBoundingClientRect();
    const coordinate = axis === 'vertical' ? event.clientY - bounds.top : event.clientX - bounds.left;
    const travel = Math.max(0, data.trackSize - data.thumbSize);
    const position = clamp(coordinate - data.thumbSize / 2, 0, travel);
    setTargetScroll(target, axis, travel > 0 ? (position / travel) * data.maxScroll : 0, record.ownerDocument, record.view);
    record.schedule();
  });
  track.appendChild(thumb);
  overlayPortalHost(target, record.ownerDocument).appendChild(track);
  return { track, thumb };
}

function scheduleManagerRecord(record) {
  if (record.frame) return;
  const requestFrame = record.view.requestAnimationFrame || ((callback) => record.view.setTimeout(() => callback(0), 0));
  record.frame = requestFrame(() => {
    record.frame = 0;
    syncManagerRecord(record);
  });
}

function syncManagerRecord(record) {
  const { target, ownerDocument: documentRef, view } = record;
  const style = view.getComputedStyle(target);
  const rect = targetRect(target, documentRef, view);
  if (!rect) {
    record.metrics.vertical = null;
    record.metrics.horizontal = null;
    for (const axis of ['vertical', 'horizontal']) {
      record.tracks[axis].track.hidden = true;
      record.tracks[axis].thumb.tabIndex = -1;
    }
    return;
  }
  const rootTarget = isDocumentTarget(target, documentRef);
  const clientWidth = rootTarget ? view.innerWidth : target.clientWidth;
  const clientHeight = rootTarget ? view.innerHeight : target.clientHeight;
  const scrollWidth = rootTarget ? Math.max(documentRef.documentElement.scrollWidth, documentRef.body?.scrollWidth || 0, view.innerWidth) : target.scrollWidth;
  const scrollHeight = rootTarget ? Math.max(documentRef.documentElement.scrollHeight, documentRef.body?.scrollHeight || 0, view.innerHeight) : target.scrollHeight;
  const verticalEnabled = rootTarget || isScrollOverflow(style.overflowY);
  const horizontalEnabled = rootTarget || isScrollOverflow(style.overflowX);
  const hasVertical = verticalEnabled && scrollHeight > clientHeight + 1;
  const hasHorizontal = horizontalEnabled && scrollWidth > clientWidth + 1;
  const width = Math.max(0, rect.width);
  const height = Math.max(0, rect.height);
  const verticalTrackSize = Math.max(0, height - (hasHorizontal ? SCROLLBAR_SIZE : 0));
  const horizontalTrackSize = Math.max(0, width - (hasVertical ? SCROLLBAR_SIZE : 0));
  record.metrics.vertical = hasVertical ? { trackSize: verticalTrackSize, thumbSize: Math.min(verticalTrackSize, Math.max(MIN_THUMB_SIZE, (clientHeight / scrollHeight) * verticalTrackSize)), maxScroll: scrollHeight - clientHeight, clientSize: clientHeight } : null;
  record.metrics.horizontal = hasHorizontal ? { trackSize: horizontalTrackSize, thumbSize: Math.min(horizontalTrackSize, Math.max(MIN_THUMB_SIZE, (clientWidth / scrollWidth) * horizontalTrackSize)), maxScroll: scrollWidth - clientWidth, clientSize: clientWidth } : null;
  const portalHost = overlayPortalHost(target, documentRef);
  const hostRect = portalHost === documentRef.body ? null : portalHost.getBoundingClientRect();

  for (const axis of ['vertical', 'horizontal']) {
    const data = record.metrics[axis];
    const isVertical = axis === 'vertical';
    const track = record.tracks[axis].track;
    const thumb = record.tracks[axis].thumb;
    if (!data) {
      track.hidden = true;
      thumb.tabIndex = -1;
      continue;
    }
    const scrollPosition = targetScroll(target, axis, documentRef, view);
    const travel = Math.max(0, data.trackSize - data.thumbSize);
    const position = data.maxScroll > 0 ? (scrollPosition / data.maxScroll) * travel : 0;
    if (track.parentElement !== portalHost) portalHost.appendChild(track);
    track.hidden = false;
    track.style.position = portalHost === documentRef.body ? 'fixed' : 'absolute';
    track.style.top = `${isVertical ? hostTop(rect.top, hostRect, portalHost) : hostTop(rect.bottom - SCROLLBAR_SIZE, hostRect, portalHost)}px`;
    track.style.left = `${isVertical ? hostLeft(rect.right - SCROLLBAR_SIZE, hostRect, portalHost) : hostLeft(rect.left, hostRect, portalHost)}px`;
    track.style.width = `${isVertical ? SCROLLBAR_SIZE : data.trackSize}px`;
    track.style.height = `${isVertical ? data.trackSize : SCROLLBAR_SIZE}px`;
    thumb.style.width = isVertical ? '100%' : `${data.thumbSize}px`;
    thumb.style.height = isVertical ? `${data.thumbSize}px` : '100%';
    thumb.style.transform = isVertical ? `translateY(${position}px)` : `translateX(${position}px)`;
    thumb.tabIndex = 0;
    thumb.setAttribute('aria-valuemax', String(Math.round(data.maxScroll)));
    thumb.setAttribute('aria-valuenow', String(Math.round(clamp(scrollPosition, 0, data.maxScroll))));
    if (target.id) thumb.setAttribute('aria-controls', target.id);
    else thumb.removeAttribute('aria-controls');
  }
}

function isManagerScrollCandidate(element, documentRef, view) {
  if (!(element instanceof view.HTMLElement)) return false;
  if (explicitlyManagedTargets.has(element)) return false;
  if (element.classList.contains('yc-overlay-scroll-target') || element.dataset.ycOverlayScrollbar) return false;
  if (isOverlayScrollbarNode(element) || element.closest('.yc-overlay-scrollbar')) return false;
  if (isDocumentTarget(element, documentRef)) return true;
  const style = view.getComputedStyle(element);
  return isScrollOverflow(style.overflowX) || isScrollOverflow(style.overflowY);
}

function destroyManagerRecord(record) {
  if (record.frame) {
    if (record.view.cancelAnimationFrame) record.view.cancelAnimationFrame(record.frame);
    else record.view.clearTimeout(record.frame);
  }
  for (const axis of ['vertical', 'horizontal']) record.tracks[axis].track.remove();
  record.target.removeEventListener('scroll', record.schedule);
  record.resizeObserver?.unobserve(record.target);
}

function initOverlayScrollbarManager(documentRef) {
  const view = documentRef.defaultView;
  if (!documentRef.body || !view) return () => {};
  const records = new Map();
  const resizeObserver = typeof view.ResizeObserver === 'function' ? new view.ResizeObserver(() => {
    for (const record of records.values()) scheduleManagerRecord(record);
  }) : null;
  let scanFrame = 0;
  const scanTargets = () => {
    scanFrame = 0;
    const targets = /** @type {Set<HTMLElement>} */ (new Set([documentRef.scrollingElement, documentRef.body].filter(Boolean)));
    for (const element of documentRef.querySelectorAll('*')) targets.add(element);
    for (const target of targets) {
      if (!target || !isManagerScrollCandidate(target, documentRef, view)) continue;
      if (records.has(target)) {
        scheduleManagerRecord(records.get(target));
        continue;
      }
      const record = /** @type {OverlayScrollbarManagerRecord} */ (/** @type {unknown} */ ({
        target,
        ownerDocument: documentRef,
        view,
        metrics: { vertical: null, horizontal: null },
        tracks: { vertical: null, horizontal: null },
        frame: 0,
        drag: null,
        resizeObserver,
        schedule: null,
      }));
      ensureTargetId(target);
      record.schedule = () => scheduleManagerRecord(record);
      record.tracks.vertical = createManagerTrack(target, 'vertical', '滚动区域', record);
      record.tracks.horizontal = createManagerTrack(target, 'horizontal', '滚动区域', record);
      target.addEventListener('scroll', record.schedule, { passive: true });
      resizeObserver?.observe(target);
      records.set(target, record);
      scheduleManagerRecord(record);
    }
    for (const [target, record] of records) {
      if (!target.isConnected || !isManagerScrollCandidate(target, documentRef, view)) {
        destroyManagerRecord(record);
        records.delete(target);
      }
    }
  };
  const scheduleScan = () => {
    if (scanFrame) return;
    scanFrame = view.requestAnimationFrame(scanTargets);
  };
  const scheduleRecords = () => {
    for (const record of records.values()) scheduleManagerRecord(record);
  };
  const mutationNeedsScan = (mutation) => {
    const mutationTarget = mutation.target instanceof view.Element ? mutation.target : mutation.target.parentElement;
    if (isOverlayScrollbarNode(mutationTarget) || mutationTarget?.closest('.yc-overlay-scrollbar')) return false;
    if (mutation.type !== 'childList') return true;
    return [...mutation.addedNodes, ...mutation.removedNodes].some((node) => {
      if (!(node instanceof view.Element)) return true;
      return !isOverlayScrollbarNode(node) && !node.closest('.yc-overlay-scrollbar');
    });
  };
  const handleMutations = (mutations) => {
    if (mutations.some(mutationNeedsScan)) scheduleScan();
  };
  documentRef.documentElement.classList.add('yc-overlay-scrollbars-enabled');
  const mutationObserver = typeof view.MutationObserver === 'function' ? new view.MutationObserver(handleMutations) : null;
  mutationObserver?.observe(documentRef.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
  view.addEventListener('resize', scheduleScan);
  view.addEventListener('scroll', scheduleRecords, true);
  scanTargets();

  return () => {
    if (scanFrame) view.cancelAnimationFrame(scanFrame);
    mutationObserver?.disconnect();
    resizeObserver?.disconnect();
    view.removeEventListener('resize', scheduleScan);
    view.removeEventListener('scroll', scheduleRecords, true);
    for (const record of records.values()) destroyManagerRecord(record);
    records.clear();
    documentRef.documentElement.classList.remove('yc-overlay-scrollbars-enabled');
  };
}

/**
 * 为 React 应用中动态生成的滚动容器提供统一浮层滚动条。
 * 已由 useOverlayScrollbar 显式管理的容器会保留自身实现，管理器负责其余嵌套区域。
 *
 * @param {{ enabled?: boolean, targetRef?: React.MutableRefObject<HTMLElement | null> }} [options]
 */
export function useOverlayScrollbars({ enabled = true, targetRef } = {}) {
  useEffect(() => {
    const documentRef = targetRef?.current?.ownerDocument;
    if (!enabled || !documentRef) return undefined;
    return initOverlayScrollbarManager(documentRef);
  }, [enabled, targetRef]);
}
