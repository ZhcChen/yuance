const SCROLLBAR_SIZE = 8;
const MIN_THUMB_SIZE = 32;
const SCROLLBAR_AXES = ["vertical", "horizontal"];
let targetSequence = 0;
const activeManagers = new WeakMap();

function isScrollOverflow(value) {
  return value === "auto" || value === "scroll" || value === "overlay";
}

function isDocumentTarget(target, documentRef) {
  return target === documentRef.scrollingElement;
}

function viewportRect(view) {
  return { top: 0, right: view.innerWidth, bottom: view.innerHeight, left: 0, width: view.innerWidth, height: view.innerHeight };
}

function visibleRect(rect, view) {
  const top = Math.max(0, rect.top);
  const right = Math.min(view.innerWidth, rect.right);
  const bottom = Math.min(view.innerHeight, rect.bottom);
  const left = Math.max(0, rect.left);
  if (right <= left || bottom <= top) return null;
  return { top, right, bottom, left, width: right - left, height: bottom - top };
}

function targetRect(target, documentRef, view) {
  return isDocumentTarget(target, documentRef) ? viewportRect(view) : visibleRect(target.getBoundingClientRect(), view);
}

function overlayPortalHost(target, documentRef) {
  const dialog = target.closest("dialog") || target.getRootNode?.().host?.closest?.("dialog");
  if (dialog) return dialog;
  const root = target.getRootNode?.();
  return root && root.nodeType === 11 ? root : documentRef.body;
}

function isFixedPortalHost(host, documentRef) {
  return host === documentRef.body || host?.nodeType === 11;
}

function isOverlayScrollbarNode(element) {
  return Boolean(element?.classList?.contains("yc-overlay-scrollbar"));
}

function isOverlayScrollbarStyleNode(node) {
  return node?.nodeType === 1 && node.hasAttribute("data-yc-overlay-scrollbar-styles");
}

function shadowScrollbarStyles(shadowRoot) {
  if (shadowRoot.querySelector("style[data-yc-overlay-scrollbar-styles]")) return null;
  const style = shadowRoot.ownerDocument.createElement("style");
  style.setAttribute("data-yc-overlay-scrollbar-styles", "true");
  style.textContent = `
    * {
      scrollbar-width: none !important;
      -ms-overflow-style: none;
    }
    *::-webkit-scrollbar {
      width: 0 !important;
      height: 0 !important;
      display: none !important;
    }
    .yc-overlay-scrollbar {
      position: fixed;
      z-index: 2147483000;
      pointer-events: auto;
    }
    .yc-overlay-scrollbar[hidden] {
      display: none !important;
    }
    .yc-overlay-scrollbar-vertical {
      width: ${SCROLLBAR_SIZE}px;
    }
    .yc-overlay-scrollbar-horizontal {
      height: ${SCROLLBAR_SIZE}px;
    }
    .yc-overlay-scrollbar-thumb {
      position: absolute;
      inset: 0;
      border: 2px solid transparent;
      border-radius: 999px;
      background: color-mix(in srgb, var(--muted, #64748b) 30%, transparent);
      background-clip: padding-box;
      cursor: grab;
      outline: none;
      touch-action: none;
      user-select: none;
    }
    .yc-overlay-scrollbar-thumb:hover,
    .yc-overlay-scrollbar-thumb:focus-visible {
      background: color-mix(in srgb, var(--muted-strong, #475569) 44%, transparent);
      background-clip: padding-box;
    }
    .yc-overlay-scrollbar-thumb:focus-visible {
      box-shadow: 0 0 0 2px rgb(59 130 246 / 34%);
    }
    .yc-overlay-scrollbar-thumb:active {
      cursor: grabbing;
    }
  `;
  shadowRoot.appendChild(style);
  return style;
}

function hostTop(value, hostRect, host) {
  return hostRect ? value - hostRect.top - host.clientTop : value;
}

function hostLeft(value, hostRect, host) {
  return hostRect ? value - hostRect.left - host.clientLeft : value;
}

function setInlineStyle(element, property, value) {
  if (element.style.getPropertyValue(property) !== value) element.style.setProperty(property, value);
}

function targetScroll(target, axis, documentRef, view) {
  if (isDocumentTarget(target, documentRef)) return axis === "vertical" ? view.scrollY : view.scrollX;
  return axis === "vertical" ? target.scrollTop : target.scrollLeft;
}

function setTargetScroll(target, axis, value, documentRef, view) {
  if (isDocumentTarget(target, documentRef)) {
    if (axis === "vertical") view.scrollTo(view.scrollX, value);
    else view.scrollTo(value, view.scrollY);
    return;
  }
  if (axis === "vertical") target.scrollTop = value;
  else target.scrollLeft = value;
}

function createTrack(documentRef, axis, label, record) {
  const track = documentRef.createElement("div");
  track.className = `yc-overlay-scrollbar yc-overlay-scrollbar-${axis}`;
  track.dataset.ycOverlayScrollbar = axis;

  const thumb = documentRef.createElement("div");
  thumb.className = "yc-overlay-scrollbar-thumb";
  thumb.setAttribute("role", "scrollbar");
  thumb.tabIndex = -1;
  thumb.setAttribute("aria-label", `${label}${axis === "vertical" ? "垂直" : "水平"}滚动条`);
  thumb.setAttribute("aria-orientation", axis);
  thumb.setAttribute("aria-valuemin", "0");
  thumb.setAttribute("aria-valuemax", "0");
  thumb.setAttribute("aria-valuenow", "0");
  thumb.addEventListener("pointerdown", (event) => {
    const data = record.metrics[axis];
    if (!data) return;
    event.preventDefault();
    event.stopPropagation();
    thumb.focus({ preventScroll: true });
    record.drag = { axis, pointerId: event.pointerId, startCoordinate: axis === "vertical" ? event.clientY : event.clientX, startScroll: targetScroll(record.target, axis, record.document, record.view) };
    thumb.setPointerCapture(event.pointerId);
  });
  thumb.addEventListener("pointermove", (event) => {
    const drag = record.drag;
    const data = record.metrics[axis];
    if (!drag || drag.axis !== axis || drag.pointerId !== event.pointerId || !data) return;
    const coordinate = axis === "vertical" ? event.clientY : event.clientX;
    const travel = data.trackSize - data.thumbSize;
    if (travel <= 0) return;
    setTargetScroll(record.target, axis, drag.startScroll + ((coordinate - drag.startCoordinate) / travel) * data.maxScroll, record.document, record.view);
    scheduleRecord(record);
  });
  const releasePointer = (event) => {
    if (record.drag?.pointerId !== event.pointerId) return;
    record.drag = null;
    if (thumb.hasPointerCapture(event.pointerId)) thumb.releasePointerCapture(event.pointerId);
  };
  thumb.addEventListener("pointerup", releasePointer);
  thumb.addEventListener("pointercancel", releasePointer);
  thumb.addEventListener("keydown", (event) => {
    const data = record.metrics[axis];
    if (!data) return;
    const current = targetScroll(record.target, axis, record.document, record.view);
    const forward = axis === "vertical" ? ["ArrowDown", "PageDown"] : ["ArrowRight", "PageDown"];
    const backward = axis === "vertical" ? ["ArrowUp", "PageUp"] : ["ArrowLeft", "PageUp"];
    if (event.key === "Home") {
      event.preventDefault();
      setTargetScroll(record.target, axis, 0, record.document, record.view);
    } else if (event.key === "End") {
      event.preventDefault();
      setTargetScroll(record.target, axis, data.maxScroll, record.document, record.view);
    } else if (forward.includes(event.key)) {
      event.preventDefault();
      setTargetScroll(record.target, axis, current + (event.key === "PageDown" ? data.clientSize : 40), record.document, record.view);
    } else if (backward.includes(event.key)) {
      event.preventDefault();
      setTargetScroll(record.target, axis, current - (event.key === "PageUp" ? data.clientSize : 40), record.document, record.view);
    } else {
      return;
    }
    scheduleRecord(record);
  });
  track.addEventListener("pointerdown", (event) => {
    if (event.target !== track) return;
    const data = record.metrics[axis];
    if (!data) return;
    const bounds = track.getBoundingClientRect();
    const coordinate = axis === "vertical" ? event.clientY - bounds.top : event.clientX - bounds.left;
    const travel = Math.max(0, data.trackSize - data.thumbSize);
    const position = Math.min(travel, Math.max(0, coordinate - data.thumbSize / 2));
    setTargetScroll(record.target, axis, travel > 0 ? (position / travel) * data.maxScroll : 0, record.document, record.view);
    scheduleRecord(record);
  });
  track.appendChild(thumb);
  overlayPortalHost(record.target, documentRef).appendChild(track);
  return { track, thumb };
}

function scheduleRecord(record) {
  if (record.frame) return;
  const requestFrame = record.view.requestAnimationFrame || ((callback) => record.view.setTimeout(callback, 0));
  record.frame = requestFrame(() => {
    record.frame = 0;
    syncRecord(record);
  });
}

function syncRecord(record) {
  const { target, document: documentRef, view } = record;
  const style = view.getComputedStyle(target);
  const rect = targetRect(target, documentRef, view);
  if (!rect) {
    record.metrics.vertical = null;
    record.metrics.horizontal = null;
    for (const axis of SCROLLBAR_AXES) {
      record.tracks[axis].track.hidden = true;
      record.tracks[axis].thumb.tabIndex = -1;
    }
    return;
  }
  const width = Math.max(0, rect.width);
  const height = Math.max(0, rect.height);
  const rootTarget = isDocumentTarget(target, documentRef);
  const clientWidth = rootTarget ? view.innerWidth : target.clientWidth;
  const clientHeight = rootTarget ? view.innerHeight : target.clientHeight;
  const scrollWidth = rootTarget ? Math.max(documentRef.documentElement.scrollWidth, documentRef.body?.scrollWidth || 0, view.innerWidth) : target.scrollWidth;
  const scrollHeight = rootTarget ? Math.max(documentRef.documentElement.scrollHeight, documentRef.body?.scrollHeight || 0, view.innerHeight) : target.scrollHeight;
  const verticalEnabled = rootTarget || isScrollOverflow(style.overflowY);
  const horizontalEnabled = rootTarget || isScrollOverflow(style.overflowX);
  const hasVertical = verticalEnabled && height > 0 && scrollHeight > clientHeight + 1;
  const hasHorizontal = horizontalEnabled && width > 0 && scrollWidth > clientWidth + 1;
  const verticalTrackSize = Math.max(0, height - (hasHorizontal ? SCROLLBAR_SIZE : 0));
  const horizontalTrackSize = Math.max(0, width - (hasVertical ? SCROLLBAR_SIZE : 0));
  const vertical = hasVertical
    ? { trackSize: verticalTrackSize, thumbSize: Math.min(verticalTrackSize, Math.max(MIN_THUMB_SIZE, (clientHeight / scrollHeight) * verticalTrackSize)), maxScroll: scrollHeight - clientHeight, clientSize: clientHeight }
    : null;
  const horizontal = hasHorizontal
    ? { trackSize: horizontalTrackSize, thumbSize: Math.min(horizontalTrackSize, Math.max(MIN_THUMB_SIZE, (clientWidth / scrollWidth) * horizontalTrackSize)), maxScroll: scrollWidth - clientWidth, clientSize: clientWidth }
    : null;
  record.metrics.vertical = vertical;
  record.metrics.horizontal = horizontal;
  const portalHost = overlayPortalHost(target, documentRef);
  const hostRect = isFixedPortalHost(portalHost, documentRef) ? null : portalHost.getBoundingClientRect();

  for (const axis of SCROLLBAR_AXES) {
    const data = record.metrics[axis];
    const isVertical = axis === "vertical";
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
    if (track.parentNode !== portalHost) portalHost.appendChild(track);
    track.hidden = false;
    setInlineStyle(track, "position", isFixedPortalHost(portalHost, documentRef) ? "fixed" : "absolute");
    setInlineStyle(track, "top", `${isVertical ? hostTop(rect.top, hostRect, portalHost) : hostTop(rect.bottom - SCROLLBAR_SIZE, hostRect, portalHost)}px`);
    setInlineStyle(track, "left", `${isVertical ? hostLeft(rect.right - SCROLLBAR_SIZE, hostRect, portalHost) : hostLeft(rect.left, hostRect, portalHost)}px`);
    setInlineStyle(track, "width", `${isVertical ? SCROLLBAR_SIZE : data.trackSize}px`);
    setInlineStyle(track, "height", `${isVertical ? data.trackSize : SCROLLBAR_SIZE}px`);
    setInlineStyle(thumb, "width", isVertical ? "100%" : `${data.thumbSize}px`);
    setInlineStyle(thumb, "height", isVertical ? `${data.thumbSize}px` : "100%");
    setInlineStyle(thumb, "transform", isVertical ? `translateY(${position}px)` : `translateX(${position}px)`);
    thumb.tabIndex = 0;
    thumb.setAttribute("aria-valuemax", String(Math.round(data.maxScroll)));
    thumb.setAttribute("aria-valuenow", String(Math.round(Math.max(0, Math.min(data.maxScroll, scrollPosition)))));
    thumb.setAttribute("aria-controls", target.id);
  }
}

function isScrollCandidate(element, documentRef, view) {
  if (!(element instanceof view.HTMLElement) || element.dataset.ycOverlayScrollbar || isOverlayScrollbarNode(element)) return false;
  if (element.closest("[data-yc-overlay-scrollbar]")) return false;
  if (isDocumentTarget(element, documentRef)) return true;
  const style = view.getComputedStyle(element);
  return isScrollOverflow(style.overflowX) || isScrollOverflow(style.overflowY);
}

function destroyRecord(record) {
  if (record.frame) {
    if (record.view.cancelAnimationFrame) record.view.cancelAnimationFrame(record.frame);
    else record.view.clearTimeout(record.frame);
  }
  for (const axis of SCROLLBAR_AXES) record.tracks[axis].track.remove();
  record.target.removeEventListener("scroll", record.schedule);
  record.resizeObserver?.unobserve(record.target);
  if (record.generatedTargetId && record.target.id === record.targetId) record.target.removeAttribute("id");
}

function scanTargets(root, documentRef, view, records, resizeObserver, shadowStyles) {
  const targets = new Set();
  const pendingRoots = [root];
  const scannedRoots = new Set();
  while (pendingRoots.length) {
    const currentRoot = pendingRoots.shift();
    if (!currentRoot || scannedRoots.has(currentRoot)) continue;
    scannedRoots.add(currentRoot);
    if (currentRoot.nodeType === 9) {
      if (documentRef.scrollingElement) targets.add(documentRef.scrollingElement);
      if (documentRef.body) targets.add(documentRef.body);
    }
    if (currentRoot instanceof view.Element) targets.add(currentRoot);
    if (currentRoot.nodeType === 11) {
      const style = shadowScrollbarStyles(currentRoot);
      if (style) shadowStyles.set(currentRoot, style);
    }
    const descendants = currentRoot.querySelectorAll ? currentRoot.querySelectorAll("*") : [];
    for (const element of descendants) {
      targets.add(element);
      if (element.shadowRoot) pendingRoots.push(element.shadowRoot);
    }
  }

  for (const target of targets) {
    if (!isScrollCandidate(target, documentRef, view)) continue;
    if (records.has(target)) {
      scheduleRecord(records.get(target));
      continue;
    }
    const generatedTargetId = !target.id;
    const targetId = target.id || `yc-overlay-scroll-target-${++targetSequence}`;
    if (generatedTargetId) target.id = targetId;
    const record = {
      target,
      document: documentRef,
      view,
      metrics: { vertical: null, horizontal: null },
      tracks: { vertical: null, horizontal: null },
      frame: 0,
      drag: null,
      resizeObserver,
      generatedTargetId,
      targetId,
      schedule: null,
    };
    record.schedule = () => scheduleRecord(record);
    record.tracks.vertical = createTrack(documentRef, "vertical", "滚动区域", record);
    record.tracks.horizontal = createTrack(documentRef, "horizontal", "滚动区域", record);
    record.tracks.vertical.track.dataset.ycOverlayScrollbarTarget = targetId;
    record.tracks.horizontal.track.dataset.ycOverlayScrollbarTarget = targetId;
    target.addEventListener("scroll", record.schedule, { passive: true });
    resizeObserver?.observe(target);
    records.set(target, record);
    scheduleRecord(record);
  }
  return scannedRoots;
}

export function initOverlayScrollbars({ root = document } = {}) {
  const documentRef = root.nodeType === 9 ? root : root.ownerDocument;
  const view = documentRef?.defaultView;
  if (!documentRef || !view) return () => {};
  if (!documentRef.body) {
    let cleanup = null;
    let cancelled = false;
    const start = () => {
      if (cancelled) return;
      cleanup = initOverlayScrollbars({ root });
    };
    documentRef.addEventListener("DOMContentLoaded", start, { once: true });
    return () => {
      cancelled = true;
      documentRef.removeEventListener("DOMContentLoaded", start);
      cleanup?.();
    };
  }
  const existing = activeManagers.get(documentRef);
  if (existing) return existing;
  const records = new Map();
  const resizeObserver = typeof view.ResizeObserver === "function" ? new view.ResizeObserver(() => {
    for (const record of records.values()) scheduleRecord(record);
  }) : null;
  const shadowStyles = new Map();
  const mutationObservers = new Map();
  let scanFrame = 0;
  const requestFrame = (callback) => typeof view.requestAnimationFrame === "function"
    ? view.requestAnimationFrame(callback)
    : view.setTimeout(() => callback(0), 0);
  const cancelFrame = (frame) => {
    if (typeof view.cancelAnimationFrame === "function") view.cancelAnimationFrame(frame);
    else view.clearTimeout(frame);
  };
  const scheduleRecords = () => {
    for (const record of records.values()) scheduleRecord(record);
  };
  const mutationNeedsScan = (mutation) => {
    const mutationTarget = mutation.target instanceof view.Element ? mutation.target : null;
    if (isOverlayScrollbarNode(mutationTarget) || mutationTarget?.closest("[data-yc-overlay-scrollbar]") || isOverlayScrollbarStyleNode(mutationTarget)) return false;
    if (mutation.type !== "childList") return true;
    return [...mutation.addedNodes, ...mutation.removedNodes].some((node) => {
      if (node.nodeType !== 1) return true;
      return !isOverlayScrollbarNode(node) && !isOverlayScrollbarStyleNode(node) && !node.closest("[data-yc-overlay-scrollbar]");
    });
  };
  const scheduleScan = () => {
    if (scanFrame) return;
    scanFrame = requestFrame(scan);
  };
  const handleMutations = (mutations) => {
    if (mutations.some(mutationNeedsScan)) scheduleScan();
  };
  const observeRoot = (currentRoot) => {
    const observationRoot = currentRoot.nodeType === 9 ? documentRef.body : currentRoot;
    if (!observationRoot || mutationObservers.has(observationRoot) || typeof view.MutationObserver !== "function") return;
    const observer = new view.MutationObserver(handleMutations);
    observer.observe(observationRoot, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class", "style", "hidden"] });
    mutationObservers.set(observationRoot, observer);
  };
  const syncMutationObservers = (roots) => {
    for (const currentRoot of roots) observeRoot(currentRoot);
    const activeObservationRoots = new Set([...roots].map((currentRoot) => currentRoot.nodeType === 9 ? documentRef.body : currentRoot));
    for (const [observationRoot, observer] of mutationObservers) {
      if (activeObservationRoots.has(observationRoot)) continue;
      observer.disconnect();
      mutationObservers.delete(observationRoot);
    }
  };
  const scan = () => {
    scanFrame = 0;
    const scannedRoots = scanTargets(root, documentRef, view, records, resizeObserver, shadowStyles);
    syncMutationObservers(scannedRoots);
    for (const [target, record] of records) {
      if (!target.isConnected || !isScrollCandidate(target, documentRef, view)) {
        destroyRecord(record);
        records.delete(target);
      }
    }
  };
  documentRef.documentElement.classList.add("yc-overlay-scrollbars-enabled");
  view.addEventListener("resize", scheduleScan);
  view.addEventListener("scroll", scheduleRecords, true);
  scan();

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    if (scanFrame) cancelFrame(scanFrame);
    for (const observer of mutationObservers.values()) observer.disconnect();
    mutationObservers.clear();
    resizeObserver?.disconnect();
    view.removeEventListener("resize", scheduleScan);
    view.removeEventListener("scroll", scheduleRecords, true);
    for (const record of records.values()) destroyRecord(record);
    records.clear();
    for (const style of shadowStyles.values()) style.remove();
    shadowStyles.clear();
    documentRef.documentElement.classList.remove("yc-overlay-scrollbars-enabled");
    if (activeManagers.get(documentRef) === cleanup) activeManagers.delete(documentRef);
  };
  activeManagers.set(documentRef, cleanup);
  return cleanup;
}
