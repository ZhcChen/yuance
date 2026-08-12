const FIT_WIDTH_PADDING = 72;
const MIN_FIT_SCALE = 0.75;
const MIN_FIT_PAGE_SCALE = 0.28;
const FIT_PAGE_VERTICAL_PADDING = 120;
const MAX_ZOOM_FACTOR = 2.4;
const MIN_ZOOM_FACTOR = 0.7;
const PAGE_MARKER_RATIO = 0.32;
const THUMBNAIL_WIDTH = 156;
const MAX_RENDER_OUTPUT_SCALE = 1.8;
const MAX_THUMB_OUTPUT_SCALE = 1.2;
const PAGE_RENDER_OVERSCAN_FACTOR = 1.2;
const PAGE_UNLOAD_OVERSCAN_FACTOR = 2.6;
const PAGE_RENDER_CONCURRENCY = 2;
const THUMBNAIL_RENDER_CONCURRENCY = 1;
const THUMBNAIL_QUEUE_DELAY_MS = 36;
const PAGE_CARD_PADDING = 24;
const PAGE_LABEL_SPACE = 26;
const PDF_FETCH_TIMEOUT_MS = 20000;
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d];
const GENERIC_FETCH_TIMEOUT_MS = 20000;
const TEXT_PREVIEW_MAX_BYTES = 2 * 1024 * 1024;
const SHEET_PREVIEW_MAX_ROWS = 300;
const SHEET_PREVIEW_MAX_COLS = 40;
const previewScriptLoaders = new Map();

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function computeFitWidthScale(viewportWidth, containerWidth) {
  const availableWidth = Math.max(240, Number(containerWidth || 0) - FIT_WIDTH_PADDING);
  return Math.max(MIN_FIT_SCALE, availableWidth / Math.max(1, Number(viewportWidth || 1)));
}

export function computeFitPageScale(viewportWidth, viewportHeight, containerWidth, containerHeight) {
  const availableWidth = Math.max(240, Number(containerWidth || 0) - FIT_WIDTH_PADDING);
  const availableHeight = Math.max(220, Number(containerHeight || 0) - FIT_PAGE_VERTICAL_PADDING);
  const widthScale = Math.max(MIN_FIT_PAGE_SCALE, availableWidth / Math.max(1, Number(viewportWidth || 1)));
  const heightScale = Math.max(MIN_FIT_PAGE_SCALE, availableHeight / Math.max(1, Number(viewportHeight || 1)));
  return Math.min(widthScale, heightScale);
}

function resolveZoomScale(baseWidth, baseHeight, containerWidth, containerHeight, zoomMode) {
  if (zoomMode === "actual-size") {
    return 1;
  }
  if (zoomMode === "fit-page") {
    return computeFitPageScale(baseWidth, baseHeight, containerWidth, containerHeight);
  }
  return computeFitWidthScale(baseWidth, containerWidth);
}

export function computeScaledPageSize(
  baseWidth,
  baseHeight,
  containerWidth,
  containerHeightOrZoomFactor,
  zoomMode = "fit-width",
  zoomFactor = 1,
) {
  const legacySignature = typeof containerHeightOrZoomFactor === "number" && arguments.length <= 4;
  const containerHeight = legacySignature ? 0 : Number(containerHeightOrZoomFactor || 0);
  const resolvedZoomMode = legacySignature ? "fit-width" : zoomMode;
  const resolvedZoomFactor = legacySignature ? Number(containerHeightOrZoomFactor || 1) : Number(zoomFactor || 1);
  const scale = resolveZoomScale(
    baseWidth,
    baseHeight,
    containerWidth,
    containerHeight,
    resolvedZoomMode,
  ) * resolvedZoomFactor;
  return {
    scale,
    width: Math.max(120, Math.round(baseWidth * scale)),
    height: Math.max(160, Math.round(baseHeight * scale)),
  };
}

export function pickCurrentPage(metrics, scrollTop, viewportHeight) {
  if (!Array.isArray(metrics) || metrics.length === 0) {
    return 1;
  }
  const marker = Number(scrollTop || 0) + Number(viewportHeight || 0) * PAGE_MARKER_RATIO;
  let closestPage = metrics[0].pageNumber;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const metric of metrics) {
    const top = Number(metric.top || 0);
    const height = Number(metric.height || 0);
    const bottom = top + height;
    if (marker >= top && marker <= bottom) {
      return metric.pageNumber;
    }
    const center = top + height / 2;
    const distance = Math.abs(marker - center);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestPage = metric.pageNumber;
    }
  }
  return closestPage;
}

export function collectPagesInRange(metrics, scrollTop, viewportHeight, overscanPx) {
  if (!Array.isArray(metrics) || metrics.length === 0) {
    return [];
  }
  const rangeTop = Math.max(0, Number(scrollTop || 0) - Number(overscanPx || 0));
  const rangeBottom = Number(scrollTop || 0) + Number(viewportHeight || 0) + Number(overscanPx || 0);
  const pages = [];
  for (const metric of metrics) {
    const top = Number(metric.top || 0);
    const bottom = top + Number(metric.height || 0);
    if (bottom >= rangeTop && top <= rangeBottom) {
      pages.push(metric.pageNumber);
    }
  }
  if (pages.length > 0) {
    return pages;
  }
  return [pickCurrentPage(metrics, scrollTop, viewportHeight)];
}

export function sortPageNumbersByDistance(pageNumbers, currentPage) {
  return [...pageNumbers].sort((left, right) => {
    const distanceDiff = Math.abs(left - currentPage) - Math.abs(right - currentPage);
    if (distanceDiff !== 0) {
      return distanceDiff;
    }
    return left - right;
  });
}

export function findActiveOutlineEntry(entries, currentPage) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return null;
  }
  let activeId = null;
  let activePage = -1;
  for (const entry of entries) {
    if (typeof entry.pageNumber !== "number") {
      continue;
    }
    if (entry.pageNumber <= currentPage && entry.pageNumber >= activePage) {
      activePage = entry.pageNumber;
      activeId = entry.id;
    }
  }
  return activeId;
}

export function collectOutlineAncestorIds(entries, entryId) {
  if (!Array.isArray(entries) || !entryId) {
    return [];
  }
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  const ancestors = [];
  let currentEntry = entryById.get(entryId) || null;
  while (currentEntry && currentEntry.parentId) {
    ancestors.unshift(currentEntry.parentId);
    currentEntry = entryById.get(currentEntry.parentId) || null;
  }
  return ancestors;
}

export function normalizeOutlineSearchKeyword(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function collectFilteredOutlineIds(entries, keyword, activeEntryId = null) {
  const normalizedKeyword = normalizeOutlineSearchKeyword(keyword);
  const visibleIds = new Set();
  if (!Array.isArray(entries) || entries.length === 0) {
    return visibleIds;
  }
  if (!normalizedKeyword) {
    for (const entry of entries) {
      visibleIds.add(entry.id);
    }
    return visibleIds;
  }
  for (const entry of entries) {
    if (!normalizeOutlineSearchKeyword(entry.title).includes(normalizedKeyword)) {
      continue;
    }
    visibleIds.add(entry.id);
    for (const ancestorId of collectOutlineAncestorIds(entries, entry.id)) {
      visibleIds.add(ancestorId);
    }
  }
  if (activeEntryId) {
    visibleIds.add(activeEntryId);
    for (const ancestorId of collectOutlineAncestorIds(entries, activeEntryId)) {
      visibleIds.add(ancestorId);
    }
  }
  return visibleIds;
}

function normalizeOutlineTitle(value, fallbackPageNumber) {
  const title = String(value || "").replace(/\s+/g, " ").trim();
  if (title) {
    return title;
  }
  if (typeof fallbackPageNumber === "number") {
    return "第 " + fallbackPageNumber + " 页";
  }
  return "未命名章节";
}

async function resolveOutlinePageNumber(pdfDocument, dest) {
  if (!pdfDocument || !dest) {
    return null;
  }
  try {
    let resolvedDest = dest;
    if (typeof resolvedDest === "string") {
      resolvedDest = await pdfDocument.getDestination(resolvedDest);
    }
    if (!Array.isArray(resolvedDest) || resolvedDest.length === 0) {
      return null;
    }
    const target = resolvedDest[0];
    if (typeof target === "number" && Number.isFinite(target)) {
      return target + 1;
    }
    if (!target) {
      return null;
    }
    const pageIndex = await pdfDocument.getPageIndex(target);
    return pageIndex + 1;
  } catch (_error) {
    return null;
  }
}

export async function resolveOutlineEntries(pdfDocument, outlineItems) {
  const entries = [];
  let idCounter = 0;

  async function walk(items, depth, parentId) {
    for (const item of items || []) {
      const pageNumber = await resolveOutlinePageNumber(pdfDocument, item.dest);
      const title = normalizeOutlineTitle(item.title, pageNumber);
      const id = "outline-" + String(idCounter += 1);
      const hasChildren = Array.isArray(item.items) && item.items.length > 0;
      entries.push({
        id,
        title,
        pageNumber,
        depth,
        hasChildren,
        parentId: parentId || null,
      });
      if (hasChildren) {
        await walk(item.items, depth + 1, id);
      }
    }
  }

  await walk(outlineItems || [], 0, null);
  return entries;
}

function createCanvas(doc) {
  return doc.createElement("canvas");
}

function clearWindowTimer(timerId) {
  if (!timerId) {
    return;
  }
  if (typeof window !== "undefined" && typeof window.clearTimeout === "function") {
    window.clearTimeout(timerId);
    return;
  }
  clearTimeout(timerId);
}

function normalizeInlineErrorMessage(value) {
  const normalized = String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return "";
  }
  return normalized.slice(0, 120);
}

function buildPdfFetchErrorMessage(statusCode, detail) {
  const normalizedDetail = normalizeInlineErrorMessage(detail);
  if (!normalizedDetail) {
    return "附件读取失败（HTTP " + statusCode + "），请刷新后重试。";
  }
  return "附件读取失败（HTTP " + statusCode + "）： " + normalizedDetail;
}

function hasPdfSignature(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < PDF_SIGNATURE.length) {
    return false;
  }
  for (let index = 0; index < PDF_SIGNATURE.length; index += 1) {
    if (bytes[index] !== PDF_SIGNATURE[index]) {
      return false;
    }
  }
  return true;
}

async function fetchPdfBytes(sourceUrl) {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  let timeoutId = 0;
  try {
    if (controller && typeof window !== "undefined" && typeof window.setTimeout === "function") {
      timeoutId = window.setTimeout(() => {
        controller.abort();
      }, PDF_FETCH_TIMEOUT_MS);
    }
    const response = await fetch(sourceUrl, {
      credentials: "same-origin",
      cache: "no-store",
      redirect: "follow",
      signal: controller ? controller.signal : undefined,
      headers: {
        Accept: "application/pdf,application/octet-stream;q=0.9,*/*;q=0.1",
      },
    });
    if (!response.ok) {
      let detail = "";
      try {
        detail = await response.text();
      } catch (_error) {
        detail = "";
      }
      throw new Error(buildPdfFetchErrorMessage(response.status, detail));
    }
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (bytes.byteLength === 0) {
      throw new Error("附件内容为空，无法预览 PDF。");
    }
    if (!hasPdfSignature(bytes)) {
      throw new Error("附件读取失败，返回内容不是有效的 PDF 文件。");
    }
    return bytes;
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error("PDF 预览加载超时，请刷新后重试。");
    }
    throw error;
  } finally {
    clearWindowTimer(timeoutId);
  }
}

function createPagePlaceholder(doc, pageNumber, hint) {
  const shell = doc.createElement("div");
  shell.className = "pdf-page-placeholder";
  const title = doc.createElement("span");
  title.className = "pdf-page-placeholder-copy";
  title.textContent = "第 " + pageNumber + " 页";
  const copy = doc.createElement("span");
  copy.className = "pdf-page-placeholder-hint";
  copy.textContent = hint;
  shell.append(title, copy);
  return shell;
}

function createThumbnailPlaceholder(doc, pageNumber, hint) {
  const shell = doc.createElement("div");
  shell.className = "pdf-thumb-placeholder";
  const title = doc.createElement("span");
  title.className = "pdf-thumb-placeholder-copy";
  title.textContent = "P" + pageNumber;
  const copy = doc.createElement("span");
  copy.className = "pdf-thumb-placeholder-hint";
  copy.textContent = hint;
  shell.append(title, copy);
  return shell;
}

function drawThumbnailFromCanvas(sourceCanvas, viewport, doc) {
  const thumbnailCanvas = createCanvas(doc);
  const ratio = viewport.height / Math.max(1, viewport.width);
  const deviceScale = Math.min(MAX_THUMB_OUTPUT_SCALE, Number(globalThis.devicePixelRatio || 1));
  const targetWidth = THUMBNAIL_WIDTH;
  const targetHeight = Math.max(60, Math.round(targetWidth * ratio));
  thumbnailCanvas.width = Math.round(targetWidth * deviceScale);
  thumbnailCanvas.height = Math.round(targetHeight * deviceScale);
  thumbnailCanvas.style.width = targetWidth + "px";
  thumbnailCanvas.style.height = targetHeight + "px";
  const context = thumbnailCanvas.getContext("2d");
  if (context) {
    context.drawImage(sourceCanvas, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height);
  }
  return thumbnailCanvas;
}

function scheduleAnimationFrame(callback) {
  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(callback);
    return;
  }
  callback();
}

function delay(ms) {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && typeof window.setTimeout === "function") {
      window.setTimeout(resolve, ms);
      return;
    }
    setTimeout(resolve, ms);
  });
}

function buildPageMetric(meta) {
  if (!meta.article) {
    return {
      pageNumber: meta.pageNumber,
      top: 0,
      height: meta.scaledHeight + PAGE_CARD_PADDING + PAGE_LABEL_SPACE,
    };
  }
  return {
    pageNumber: meta.pageNumber,
    top: meta.article.offsetTop,
    height: meta.article.offsetHeight,
  };
}

export function initPdfPreview(options) {
  const pdfjsLib = options && options.pdfjsLib;
  const root = (options && options.root) || document;
  if (!pdfjsLib || !root) {
    return null;
  }

  const stage = root.querySelector("[data-pdf-preview]");
  const pagesWrap = root.getElementById("pdf-preview-pages");
  const scrollWrap = root.getElementById("pdf-preview-scroll");
  const status = root.getElementById("pdf-preview-status");
  const statusCopy = root.getElementById("pdf-preview-status-copy");
  const pageCount = root.getElementById("pdf-page-count");
  const pageInput = root.getElementById("pdf-page-input");
  const pageGo = root.getElementById("pdf-page-go");
  const pagePrev = root.getElementById("pdf-page-prev");
  const pageNext = root.getElementById("pdf-page-next");
  const pageRange = root.getElementById("pdf-page-range");
  const pageRangeLabel = root.getElementById("pdf-page-range-label");
  const pageRangeBubble = root.getElementById("pdf-page-range-bubble");
  const pageRangeShell = root.getElementById("pdf-page-range-shell");
  const zoomOut = root.getElementById("pdf-zoom-out");
  const zoomIn = root.getElementById("pdf-zoom-in");
  const zoomFitWidth = root.getElementById("pdf-zoom-fit-width");
  const zoomActual = root.getElementById("pdf-zoom-actual");
  const zoomFitPage = root.getElementById("pdf-zoom-fit-page");
  const thumbnailList = root.getElementById("pdf-thumbnail-list");
  const thumbnailEmpty = root.getElementById("pdf-thumbnail-empty");
  const outlineList = root.getElementById("pdf-outline-list");
  const outlineEmpty = root.getElementById("pdf-outline-empty");
  const outlineSearch = root.getElementById("pdf-outline-search");
  const outlineSearchClear = root.getElementById("pdf-outline-search-clear");
  const outlineSearchWrap = root.getElementById("pdf-outline-search-wrap");
  const outlineTab = root.querySelector('[data-pdf-sidebar-tab="outline"]');
  const pageTab = root.querySelector('[data-pdf-sidebar-tab="pages"]');
  const tabItems = root.querySelectorAll("[data-pdf-sidebar-tab]");
  const tabPanels = root.querySelectorAll("[data-pdf-sidebar-panel]");

  if (!stage || !pagesWrap || !scrollWrap) {
    return null;
  }

  const state = {
    currentPage: 1,
    outlineEntries: [],
    outlineButtons: new Map(),
    outlineCollapsedIds: new Set(),
    outlineEntryById: new Map(),
    outlineRows: new Map(),
    outlineToggles: new Map(),
    outlineTitleNodes: new Map(),
    outlineVisibleIds: new Set(),
    outlineSearchKeyword: "",
    pageArticles: new Map(),
    pageMetas: [],
    pageMetaByNumber: new Map(),
    pageMetrics: [],
    pdfDocument: null,
    renderGeneration: 0,
    renderQueue: [],
    pendingRenderPages: new Set(),
    activePageRenders: 0,
    activeThumbRenders: 0,
    resizeTimer: 0,
    scrollSyncFrame: 0,
    suppressScrollSyncUntil: 0,
    thumbnailButtons: new Map(),
    thumbnailQueue: [],
    pendingThumbnailPages: new Set(),
    pageRangeInteracting: false,
    zoomMode: "fit-width",
    zoomFactor: 1,
  };

  const zoomModeButtons = new Map([
    ["fit-width", zoomFitWidth],
    ["actual-size", zoomActual],
    ["fit-page", zoomFitPage],
  ]);

  function setStatus(message, visible) {
    if (statusCopy) {
      statusCopy.textContent = message;
    }
    if (status) {
      status.hidden = visible === false;
    }
  }

  function setSidebarTab(mode) {
    for (const tab of tabItems) {
      const isActive = tab.dataset.pdfSidebarTab === mode;
      tab.classList.toggle("is-active", isActive);
      tab.setAttribute("aria-selected", isActive ? "true" : "false");
      tab.tabIndex = isActive ? 0 : -1;
    }
    for (const panel of tabPanels) {
      panel.hidden = panel.dataset.pdfSidebarPanel !== mode;
    }
  }

  function setPageCount(pageNumber) {
    if (!pageCount || !state.pdfDocument) {
      return;
    }
    pageCount.textContent = "第 " + pageNumber + " / " + state.pdfDocument.numPages + " 页";
  }

  function updateZoomModeUi() {
    for (const [mode, button] of zoomModeButtons.entries()) {
      if (!button) {
        continue;
      }
      const isActive = state.zoomMode === mode;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    }
  }

  function updatePageRangeBubble(pageNumber) {
    if (!pageRangeBubble || !pageRangeShell || !state.pdfDocument) {
      return;
    }
    const maxPage = Math.max(1, state.pdfDocument.numPages);
    const boundedPage = clamp(pageNumber, 1, maxPage);
    const progress = maxPage <= 1 ? 0 : (boundedPage - 1) / (maxPage - 1);
    pageRangeShell.style.setProperty("--range-progress", String(progress));
    pageRangeBubble.textContent = "P" + boundedPage;
    pageRangeBubble.hidden = !state.pageRangeInteracting;
  }

  function setPageRangeInteraction(active) {
    state.pageRangeInteracting = Boolean(active);
    if (pageRangeBubble) {
      pageRangeBubble.hidden = !state.pageRangeInteracting;
    }
    updatePageRangeBubble(
      Number.parseInt(pageRange?.value || String(state.currentPage || 1), 10) || state.currentPage || 1,
    );
  }

  function setPageNavigationState(pageNumber) {
    if (!state.pdfDocument) {
      if (pagePrev) {
        pagePrev.disabled = true;
      }
      if (pageNext) {
        pageNext.disabled = true;
      }
      if (pageRange) {
        pageRange.disabled = true;
      }
      if (pageRangeLabel) {
        pageRangeLabel.textContent = "拖动快速定位";
      }
      if (pageRangeBubble) {
        pageRangeBubble.hidden = true;
      }
      return;
    }
    const boundedPage = clamp(pageNumber, 1, state.pdfDocument.numPages);
    if (pagePrev) {
      pagePrev.disabled = boundedPage <= 1;
    }
    if (pageNext) {
      pageNext.disabled = boundedPage >= state.pdfDocument.numPages;
    }
    if (pageRange) {
      pageRange.disabled = false;
      pageRange.max = String(state.pdfDocument.numPages);
      pageRange.value = String(boundedPage);
    }
    if (pageRangeLabel) {
      pageRangeLabel.textContent = "第 " + boundedPage + " / " + state.pdfDocument.numPages + " 页";
    }
    updatePageRangeBubble(boundedPage);
  }

  function scrollIntoViewIfNeeded(element, block = "nearest") {
    if (!element || typeof element.scrollIntoView !== "function") {
      return;
    }
    element.scrollIntoView({
      block,
      inline: "nearest",
    });
  }

  function isOutlineEntryHidden(entry) {
    if (state.outlineVisibleIds.size > 0 && !state.outlineVisibleIds.has(entry.id)) {
      return true;
    }
    if (!entry || !entry.parentId) {
      return false;
    }
    let currentParentId = entry.parentId;
    while (currentParentId) {
      if (state.outlineCollapsedIds.has(currentParentId)) {
        return true;
      }
      currentParentId = state.outlineEntryById.get(currentParentId)?.parentId || null;
    }
    return false;
  }

  function updateOutlineTree(activeOutlineId, pageChanged) {
    for (const entry of state.outlineEntries) {
      const row = state.outlineRows.get(entry.id);
      const button = state.outlineButtons.get(entry.id);
      const toggle = state.outlineToggles.get(entry.id);
      const titleNode = state.outlineTitleNodes.get(entry.id);
      if (row) {
        row.hidden = isOutlineEntryHidden(entry);
      }
      if (button) {
        const isActive = entry.id === activeOutlineId;
        button.classList.toggle("is-active", isActive);
        if (isActive && pageChanged && row && !row.hidden) {
          scrollIntoViewIfNeeded(row, "center");
        }
      }
      if (toggle) {
        const expanded = !state.outlineCollapsedIds.has(entry.id);
        toggle.classList.toggle("is-collapsed", !expanded);
        toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
        toggle.hidden = state.outlineVisibleIds.size > 0 && !state.outlineVisibleIds.has(entry.id);
      }
      if (titleNode) {
        renderOutlineTitle(titleNode, entry.title, state.outlineSearchKeyword);
      }
    }
  }

  function ensureOutlinePathExpanded(entryId) {
    for (const ancestorId of collectOutlineAncestorIds(state.outlineEntries, entryId)) {
      state.outlineCollapsedIds.delete(ancestorId);
    }
  }

  function syncActivePage(pageNumber) {
    const previousPage = state.currentPage;
    const pageChanged = previousPage !== pageNumber;
    state.currentPage = pageNumber;
    if (pageInput) {
      pageInput.value = String(pageNumber);
    }
    setPageCount(pageNumber);
    setPageNavigationState(pageNumber);
    for (const [entryPageNumber, article] of state.pageArticles.entries()) {
      article.classList.toggle("is-active", entryPageNumber === pageNumber);
    }
    for (const [entryPageNumber, button] of state.thumbnailButtons.entries()) {
      const isActive = entryPageNumber === pageNumber;
      button.classList.toggle("is-active", isActive);
      if (isActive && pageChanged) {
        scrollIntoViewIfNeeded(button, "center");
      }
    }
    const activeOutlineId = findActiveOutlineEntry(state.outlineEntries, pageNumber);
    ensureOutlinePathExpanded(activeOutlineId);
    state.outlineVisibleIds = collectFilteredOutlineIds(
      state.outlineEntries,
      state.outlineSearchKeyword,
      activeOutlineId,
    );
    updateOutlineEmptyState();
    updateOutlineTree(activeOutlineId, pageChanged);
    const activeMeta = state.pageMetaByNumber.get(pageNumber);
    if (activeMeta && !activeMeta.thumbReady) {
      enqueueThumbnail(activeMeta, true);
    }
  }

  function updateOutlineEmptyState() {
    if (!outlineEmpty) {
      return;
    }
    if (state.outlineEntries.length === 0) {
      outlineEmpty.hidden = false;
      outlineEmpty.textContent = "当前 PDF 未检测到可用目录。";
      return;
    }
    if (state.outlineVisibleIds.size === 0) {
      outlineEmpty.hidden = false;
      outlineEmpty.textContent = "未找到匹配的目录章节。";
      return;
    }
    outlineEmpty.hidden = true;
  }

  function renderOutlineTitle(node, title, keyword) {
    if (!node) {
      return;
    }
    const rawTitle = String(title || "");
    const normalizedKeyword = normalizeOutlineSearchKeyword(keyword);
    if (!normalizedKeyword) {
      node.textContent = rawTitle;
      return;
    }
    const loweredTitle = rawTitle.toLowerCase();
    let index = 0;
    let searchOffset = 0;
    const fragment = root.createDocumentFragment();
    while (searchOffset < rawTitle.length) {
      const matchIndex = loweredTitle.indexOf(normalizedKeyword, searchOffset);
      if (matchIndex === -1) {
        break;
      }
      if (matchIndex > index) {
        fragment.appendChild(root.createTextNode(rawTitle.slice(index, matchIndex)));
      }
      const mark = root.createElement("mark");
      mark.className = "pdf-outline-match";
      mark.textContent = rawTitle.slice(matchIndex, matchIndex + normalizedKeyword.length);
      fragment.appendChild(mark);
      index = matchIndex + normalizedKeyword.length;
      searchOffset = index;
    }
    if (index < rawTitle.length) {
      fragment.appendChild(root.createTextNode(rawTitle.slice(index)));
    }
    node.replaceChildren(fragment);
  }

  function applyOutlineFilter() {
    const activeOutlineId = findActiveOutlineEntry(state.outlineEntries, state.currentPage);
    state.outlineVisibleIds = collectFilteredOutlineIds(
      state.outlineEntries,
      state.outlineSearchKeyword,
      activeOutlineId,
    );
    if (outlineSearchClear) {
      outlineSearchClear.hidden = !state.outlineSearchKeyword;
    }
    updateOutlineEmptyState();
    updateOutlineTree(activeOutlineId, false);
  }

  function measurePageMetrics() {
    state.pageMetrics = state.pageMetas.map(buildPageMetric);
  }

  function createPageShell(meta) {
    const article = root.createElement("article");
    article.className = "pdf-page";
    article.dataset.pageNumber = String(meta.pageNumber);
    const surface = root.createElement("div");
    surface.className = "pdf-page-surface";
    const label = root.createElement("div");
    label.className = "pdf-page-label";
    label.textContent = "第 " + meta.pageNumber + " / " + state.pdfDocument.numPages + " 页";
    article.append(surface, label);
    meta.article = article;
    meta.surface = surface;
    meta.label = label;
    state.pageArticles.set(meta.pageNumber, article);
    pagesWrap.appendChild(article);
  }

  function setPagePlaceholder(meta, hint, loading) {
    if (!meta.surface || !meta.article) {
      return;
    }
    meta.surface.replaceChildren(createPagePlaceholder(root, meta.pageNumber, hint));
    meta.article.classList.toggle("is-loading", Boolean(loading));
    meta.article.classList.remove("is-rendered");
    meta.renderedCanvas = null;
    meta.renderedLayoutKey = "";
  }

  function applyPageLayout(meta) {
    if (!meta.surface) {
      return;
    }
    const size = computeScaledPageSize(
      meta.baseWidth,
      meta.baseHeight,
      scrollWrap.clientWidth,
      scrollWrap.clientHeight,
      state.zoomMode,
      state.zoomFactor,
    );
    meta.scale = size.scale;
    meta.scaledWidth = size.width;
    meta.scaledHeight = size.height;
    meta.layoutKey = size.width + "x" + size.height;
    meta.surface.style.width = size.width + "px";
    meta.surface.style.height = size.height + "px";
    if (meta.renderedLayoutKey && meta.renderedLayoutKey !== meta.layoutKey) {
      setPagePlaceholder(meta, "滚动到可视区域时自动渲染", false);
    } else if (!meta.renderedCanvas) {
      setPagePlaceholder(meta, meta.isRendering ? "正在渲染当前页面..." : "滚动到可视区域时自动渲染", meta.isRendering);
    }
  }

  function createThumbnailShell(meta) {
    if (!thumbnailList) {
      return;
    }
    const button = root.createElement("button");
    button.type = "button";
    button.className = "pdf-thumb is-loading";
    button.dataset.pageNumber = String(meta.pageNumber);
    const surface = root.createElement("span");
    surface.className = "pdf-thumb-surface";
    surface.appendChild(createThumbnailPlaceholder(root, meta.pageNumber, "等待缩略图"));
    const metaCopy = root.createElement("span");
    metaCopy.className = "pdf-thumb-meta";
    metaCopy.textContent = "第 " + meta.pageNumber + " 页";
    button.append(surface, metaCopy);
    button.addEventListener("click", () => {
      setSidebarTab("pages");
      scrollToPage(meta.pageNumber, "smooth");
    });
    thumbnailList.appendChild(button);
    meta.thumbButton = button;
    meta.thumbSurface = surface;
    state.thumbnailButtons.set(meta.pageNumber, button);
  }

  function setThumbnailPlaceholder(meta, hint, loading = true) {
    if (!meta.thumbSurface || !meta.thumbButton) {
      return;
    }
    meta.thumbSurface.replaceChildren(createThumbnailPlaceholder(root, meta.pageNumber, hint));
    meta.thumbButton.classList.toggle("is-loading", Boolean(loading));
    meta.thumbReady = false;
  }

  function computeRenderOverscan() {
    return Math.max(680, scrollWrap.clientHeight * PAGE_RENDER_OVERSCAN_FACTOR);
  }

  function computeUnloadOverscan() {
    return Math.max(1600, scrollWrap.clientHeight * PAGE_UNLOAD_OVERSCAN_FACTOR);
  }

  function isMetricWithinRange(metric, scrollTop, viewportHeight, overscanPx) {
    const rangeTop = Math.max(0, Number(scrollTop || 0) - Number(overscanPx || 0));
    const rangeBottom = Number(scrollTop || 0) + Number(viewportHeight || 0) + Number(overscanPx || 0);
    const top = Number(metric.top || 0);
    const bottom = top + Number(metric.height || 0);
    return bottom >= rangeTop && top <= rangeBottom;
  }

  function syncCurrentPageFromScroll() {
    if (!state.pdfDocument || state.pageMetrics.length === 0) {
      return;
    }
    if (Date.now() < state.suppressScrollSyncUntil) {
      return;
    }
    const pageNumber = pickCurrentPage(state.pageMetrics, scrollWrap.scrollTop, scrollWrap.clientHeight);
    syncActivePage(pageNumber);
  }

  function clearPendingPageQueue() {
    state.renderGeneration += 1;
    state.renderQueue = [];
    state.pendingRenderPages.clear();
  }

  function unloadPage(meta) {
    if (!meta.renderedCanvas && !meta.renderedLayoutKey) {
      return;
    }
    setPagePlaceholder(meta, "滚动到可视区域时自动渲染", false);
  }

  async function renderPage(meta, generation) {
    if (!meta || !state.pdfDocument || meta.isRendering) {
      return;
    }
    if (meta.renderedLayoutKey && meta.renderedLayoutKey === meta.layoutKey) {
      return;
    }
    const expectedLayoutKey = meta.layoutKey;
    meta.isRendering = true;
    setPagePlaceholder(meta, "正在渲染当前页面...", true);
    state.activePageRenders += 1;
    try {
      const page = await state.pdfDocument.getPage(meta.pageNumber);
      const viewport = page.getViewport({ scale: meta.scale });
      const outputScale = Math.min(MAX_RENDER_OUTPUT_SCALE, Number(globalThis.devicePixelRatio || 1));
      const canvas = createCanvas(root);
      const context = canvas.getContext("2d");
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = Math.floor(viewport.width) + "px";
      canvas.style.height = Math.floor(viewport.height) + "px";
      if (context) {
        await page.render({
          canvasContext: context,
          viewport,
          transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0],
        }).promise;
      }
      if (generation !== state.renderGeneration || meta.layoutKey !== expectedLayoutKey) {
        return;
      }
      if (!meta.surface || !meta.article) {
        return;
      }
      meta.surface.replaceChildren(canvas);
      meta.article.classList.remove("is-loading");
      meta.article.classList.add("is-rendered");
      meta.renderedCanvas = canvas;
      meta.renderedLayoutKey = expectedLayoutKey;
      if (!meta.thumbReady && meta.thumbSurface) {
        meta.thumbSurface.replaceChildren(drawThumbnailFromCanvas(canvas, viewport, root));
        meta.thumbReady = true;
        meta.thumbButton?.classList.remove("is-loading");
      }
    } catch (_error) {
      setPagePlaceholder(meta, "当前页面渲染失败，请稍后重试", false);
    } finally {
      meta.isRendering = false;
      state.activePageRenders = Math.max(0, state.activePageRenders - 1);
      processPageRenderQueue();
    }
  }

  function enqueuePageRender(meta, priority) {
    if (!meta || meta.isRendering || (meta.renderedLayoutKey && meta.renderedLayoutKey === meta.layoutKey)) {
      return;
    }
    if (state.pendingRenderPages.has(meta.pageNumber)) {
      return;
    }
    state.pendingRenderPages.add(meta.pageNumber);
    if (priority) {
      state.renderQueue.unshift(meta.pageNumber);
    } else {
      state.renderQueue.push(meta.pageNumber);
    }
  }

  function processPageRenderQueue() {
    while (state.activePageRenders < PAGE_RENDER_CONCURRENCY && state.renderQueue.length > 0) {
      const pageNumber = state.renderQueue.shift();
      state.pendingRenderPages.delete(pageNumber);
      const meta = state.pageMetaByNumber.get(pageNumber);
      if (!meta) {
        continue;
      }
      void renderPage(meta, state.renderGeneration);
    }
  }

  function scheduleVisiblePageWork() {
    if (!state.pageMetas.length || !state.pageMetrics.length) {
      return;
    }
    const scrollTop = scrollWrap.scrollTop;
    const viewportHeight = scrollWrap.clientHeight;
    const renderPages = new Set(
      collectPagesInRange(state.pageMetrics, scrollTop, viewportHeight, computeRenderOverscan()),
    );
    const orderedPages = sortPageNumbersByDistance(renderPages, state.currentPage);
    for (const pageNumber of orderedPages) {
      enqueuePageRender(state.pageMetaByNumber.get(pageNumber), pageNumber === state.currentPage);
    }
    const unloadOverscan = computeUnloadOverscan();
    for (const metric of state.pageMetrics) {
      if (renderPages.has(metric.pageNumber)) {
        continue;
      }
      if (isMetricWithinRange(metric, scrollTop, viewportHeight, unloadOverscan)) {
        continue;
      }
      unloadPage(state.pageMetaByNumber.get(metric.pageNumber));
    }
    processPageRenderQueue();
  }

  function scheduleScrollSync() {
    if (state.scrollSyncFrame) {
      return;
    }
    state.scrollSyncFrame = 1;
    scheduleAnimationFrame(() => {
      state.scrollSyncFrame = 0;
      syncCurrentPageFromScroll();
      scheduleVisiblePageWork();
    });
  }

  function scrollToPage(pageNumber, behavior) {
    const article = state.pageArticles.get(pageNumber);
    if (!article || !scrollWrap) {
      return false;
    }
    state.suppressScrollSyncUntil = Date.now() + 220;
    const targetTop = Math.max(0, article.offsetTop - 12);
    scrollWrap.scrollTo({
      top: targetTop,
      behavior: behavior || "smooth",
    });
    syncActivePage(pageNumber);
    scheduleVisiblePageWork();
    return true;
  }

  function jumpRelativePage(step) {
    if (!state.pdfDocument) {
      return;
    }
    const targetPage = clamp((state.currentPage || 1) + step, 1, state.pdfDocument.numPages);
    scrollToPage(targetPage, "smooth");
  }

  function handlePageJump() {
    if (!state.pdfDocument || !pageInput) {
      return;
    }
    const requestedPage = clamp(
      Number.parseInt(pageInput.value || "1", 10) || 1,
      1,
      state.pdfDocument.numPages,
    );
    pageInput.value = String(requestedPage);
    scrollToPage(requestedPage, "smooth");
  }

  function handlePageRangeInput() {
    if (!state.pdfDocument || !pageRange) {
      return;
    }
    const requestedPage = clamp(
      Number.parseInt(pageRange.value || "1", 10) || state.currentPage || 1,
      1,
      state.pdfDocument.numPages,
    );
    setPageNavigationState(requestedPage);
    scrollToPage(requestedPage, "auto");
  }

  async function renderThumbnail(meta) {
    if (!meta || !state.pdfDocument || meta.thumbReady || meta.thumbRendering) {
      return;
    }
    meta.thumbRendering = true;
    state.activeThumbRenders += 1;
    try {
      const page = await state.pdfDocument.getPage(meta.pageNumber);
      const viewport = page.getViewport({
        scale: THUMBNAIL_WIDTH / Math.max(1, meta.baseWidth),
      });
      const outputScale = Math.min(MAX_THUMB_OUTPUT_SCALE, Number(globalThis.devicePixelRatio || 1));
      const canvas = createCanvas(root);
      const context = canvas.getContext("2d");
      canvas.width = Math.round(viewport.width * outputScale);
      canvas.height = Math.round(viewport.height * outputScale);
      canvas.style.width = Math.round(viewport.width) + "px";
      canvas.style.height = Math.round(viewport.height) + "px";
      if (context) {
        await page.render({
          canvasContext: context,
          viewport,
          transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0],
        }).promise;
      }
      if (meta.thumbSurface) {
        meta.thumbSurface.replaceChildren(canvas);
      }
      meta.thumbReady = true;
      meta.thumbButton?.classList.remove("is-loading");
    } catch (_error) {
      setThumbnailPlaceholder(meta, "缩略图暂不可用", false);
    } finally {
      meta.thumbRendering = false;
      state.activeThumbRenders = Math.max(0, state.activeThumbRenders - 1);
      void processThumbnailQueue();
    }
  }

  function enqueueThumbnail(meta, priority) {
    if (!meta || meta.thumbReady || meta.thumbRendering) {
      return;
    }
    if (state.pendingThumbnailPages.has(meta.pageNumber)) {
      return;
    }
    state.pendingThumbnailPages.add(meta.pageNumber);
    if (priority) {
      state.thumbnailQueue.unshift(meta.pageNumber);
    } else {
      state.thumbnailQueue.push(meta.pageNumber);
    }
    void processThumbnailQueue();
  }

  async function processThumbnailQueue() {
    while (state.activeThumbRenders < THUMBNAIL_RENDER_CONCURRENCY && state.thumbnailQueue.length > 0) {
      const pageNumber = state.thumbnailQueue.shift();
      state.pendingThumbnailPages.delete(pageNumber);
      const meta = state.pageMetaByNumber.get(pageNumber);
      if (!meta) {
        continue;
      }
      void renderThumbnail(meta);
      if (state.thumbnailQueue.length > 0) {
        await delay(THUMBNAIL_QUEUE_DELAY_MS);
      }
    }
  }

  function refreshPageLayout() {
    clearPendingPageQueue();
    for (const meta of state.pageMetas) {
      applyPageLayout(meta);
    }
    measurePageMetrics();
    scheduleVisiblePageWork();
    syncActivePage(Math.min(state.currentPage, state.pageMetas.length || 1));
  }

  async function buildPageMetas() {
    const metas = [];
    const total = state.pdfDocument ? state.pdfDocument.numPages : 0;
    for (let pageNumber = 1; pageNumber <= total; pageNumber += 1) {
      setStatus("正在分析 PDF 页面结构（" + pageNumber + " / " + total + "）...", true);
      const page = await state.pdfDocument.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const meta = {
        article: null,
        baseHeight: viewport.height,
        baseWidth: viewport.width,
        isRendering: false,
        label: null,
        layoutKey: "",
        pageNumber,
        renderedCanvas: null,
        renderedLayoutKey: "",
        scale: 1,
        scaledHeight: Math.round(viewport.height),
        scaledWidth: Math.round(viewport.width),
        surface: null,
        thumbButton: null,
        thumbReady: false,
        thumbRendering: false,
        thumbSurface: null,
      };
      metas.push(meta);
      if (pageNumber % 10 === 0) {
        await delay(0);
      }
    }
    state.pageMetas = metas;
    state.pageMetaByNumber = new Map(metas.map((meta) => [meta.pageNumber, meta]));
  }

  async function renderOutline() {
    if (!state.pdfDocument || !outlineList || !outlineEmpty || !outlineTab) {
      return;
    }
    outlineList.replaceChildren();
    state.outlineButtons.clear();
    state.outlineCollapsedIds.clear();
    state.outlineEntryById.clear();
    state.outlineRows.clear();
    state.outlineToggles.clear();
    state.outlineTitleNodes.clear();
    let outlineEntries = [];
    try {
      const outline = await state.pdfDocument.getOutline();
      outlineEntries = await resolveOutlineEntries(state.pdfDocument, outline || []);
    } catch (_error) {
      outlineEntries = [];
    }
    state.outlineEntries = outlineEntries;
    state.outlineEntryById = new Map(outlineEntries.map((entry) => [entry.id, entry]));
    const hasOutline = outlineEntries.length > 0;
    outlineTab.hidden = !hasOutline;
    if (outlineSearchWrap) {
      outlineSearchWrap.hidden = !hasOutline;
    }
    if (outlineSearch) {
      outlineSearch.disabled = !hasOutline;
      outlineSearch.value = hasOutline ? state.outlineSearchKeyword : "";
    }
    if (outlineSearchClear) {
      outlineSearchClear.hidden = !hasOutline || !state.outlineSearchKeyword;
    }
    if (!hasOutline && pageTab) {
      setSidebarTab("pages");
    }
    if (!hasOutline) {
      state.outlineVisibleIds = new Set();
      updateOutlineEmptyState();
      return;
    }
    const fragment = root.createDocumentFragment();
    for (const entry of outlineEntries) {
      const row = root.createElement("div");
      row.className = "pdf-outline-row";
      row.style.setProperty("--outline-depth", String(entry.depth));
      const leading = root.createElement("span");
      leading.className = "pdf-outline-leading";
      if (entry.hasChildren) {
        const toggle = root.createElement("button");
        toggle.type = "button";
        toggle.className = "pdf-outline-toggle";
        toggle.setAttribute("aria-label", "折叠或展开目录");
        toggle.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (state.outlineCollapsedIds.has(entry.id)) {
            state.outlineCollapsedIds.delete(entry.id);
          } else {
            state.outlineCollapsedIds.add(entry.id);
          }
          updateOutlineTree(findActiveOutlineEntry(state.outlineEntries, state.currentPage), false);
        });
        leading.appendChild(toggle);
        state.outlineToggles.set(entry.id, toggle);
      } else {
        const spacer = root.createElement("span");
        spacer.className = "pdf-outline-spacer";
        leading.appendChild(spacer);
      }
      const button = root.createElement("button");
      button.type = "button";
      button.className = "pdf-outline-item";
      if (typeof entry.pageNumber !== "number") {
        button.classList.add("is-disabled");
        button.disabled = true;
      } else {
        button.addEventListener("click", () => {
          setSidebarTab("outline");
          scrollToPage(entry.pageNumber, "smooth");
        });
      }
      const title = root.createElement("span");
      title.className = "pdf-outline-title";
      renderOutlineTitle(title, entry.title, state.outlineSearchKeyword);
      const page = root.createElement("span");
      page.className = "pdf-outline-page";
      page.textContent = typeof entry.pageNumber === "number" ? "P" + entry.pageNumber : "—";
      button.append(title, page);
      row.append(leading, button);
      fragment.appendChild(row);
      state.outlineButtons.set(entry.id, button);
      state.outlineRows.set(entry.id, row);
      state.outlineTitleNodes.set(entry.id, title);
    }
    outlineList.appendChild(fragment);
    applyOutlineFilter();
  }

  function buildPageShells() {
    pagesWrap.replaceChildren();
    state.pageArticles.clear();
    for (const meta of state.pageMetas) {
      createPageShell(meta);
      applyPageLayout(meta);
    }
    measurePageMetrics();
  }

  function buildThumbnailShells() {
    if (!thumbnailList) {
      return;
    }
    thumbnailList.replaceChildren();
    state.thumbnailButtons.clear();
    for (const meta of state.pageMetas) {
      createThumbnailShell(meta);
      setThumbnailPlaceholder(meta, "等待缩略图", true);
    }
    if (thumbnailEmpty) {
      thumbnailEmpty.hidden = state.pageMetas.length > 0;
    }
  }

  function queueThumbnailPrefetch() {
    const orderedPages = sortPageNumbersByDistance(
      state.pageMetas.map((meta) => meta.pageNumber),
      state.currentPage || 1,
    );
    for (const pageNumber of orderedPages) {
      enqueueThumbnail(state.pageMetaByNumber.get(pageNumber), false);
    }
  }

  async function loadPdf() {
    const sourceUrl = stage.dataset.pdfUrl || "";
    if (!sourceUrl) {
      setStatus("缺少 PDF 预览地址。", true);
      return;
    }
    try {
      setStatus("正在读取 PDF 文件，请稍候...", true);
      const pdfData = await fetchPdfBytes(sourceUrl);
      setStatus("正在解析 PDF 结构，请稍候...", true);
      const loadingTask = pdfjsLib.getDocument({
        data: pdfData,
        cMapUrl: "/static/vendor/pdfjs/cmaps/",
        cMapPacked: true,
        standardFontDataUrl: "/static/vendor/pdfjs/standard_fonts/",
      });
      state.pdfDocument = await loadingTask.promise;
      setPageNavigationState(1);
      if (pageInput) {
        pageInput.disabled = false;
        pageInput.min = "1";
        pageInput.max = String(state.pdfDocument.numPages);
      }
      if (pageRange) {
        pageRange.disabled = false;
        pageRange.min = "1";
        pageRange.max = String(state.pdfDocument.numPages);
      }
      await renderOutline();
      await buildPageMetas();
      buildPageShells();
      buildThumbnailShells();
      syncActivePage(Math.min(state.currentPage || 1, state.pdfDocument.numPages));
      scheduleVisiblePageWork();
      queueThumbnailPrefetch();
      setStatus("", false);
    } catch (error) {
      const message = error && error.message ? error.message : "PDF 预览加载失败，请刷新后重试。";
      setStatus(message, true);
    }
  }

  if (pageTab) {
    pageTab.addEventListener("click", () => {
      setSidebarTab("pages");
    });
  }
  if (outlineTab) {
    outlineTab.addEventListener("click", () => {
      if (!outlineTab.hidden) {
        setSidebarTab("outline");
      }
    });
  }

  function setZoomMode(mode) {
    state.zoomMode = mode;
    state.zoomFactor = 1;
    updateZoomModeUi();
    refreshPageLayout();
  }

  if (zoomOut) {
    zoomOut.addEventListener("click", () => {
      state.zoomFactor = clamp(state.zoomFactor - 0.15, MIN_ZOOM_FACTOR, MAX_ZOOM_FACTOR);
      updateZoomModeUi();
      refreshPageLayout();
    });
  }
  if (zoomIn) {
    zoomIn.addEventListener("click", () => {
      state.zoomFactor = clamp(state.zoomFactor + 0.15, MIN_ZOOM_FACTOR, MAX_ZOOM_FACTOR);
      updateZoomModeUi();
      refreshPageLayout();
    });
  }
  if (zoomFitWidth) {
    zoomFitWidth.addEventListener("click", () => {
      setZoomMode("fit-width");
    });
  }
  if (zoomActual) {
    zoomActual.addEventListener("click", () => {
      setZoomMode("actual-size");
    });
  }
  if (zoomFitPage) {
    zoomFitPage.addEventListener("click", () => {
      setZoomMode("fit-page");
    });
  }
  if (outlineSearch) {
    outlineSearch.addEventListener("input", () => {
      state.outlineSearchKeyword = normalizeOutlineSearchKeyword(outlineSearch.value);
      applyOutlineFilter();
    });
  }
  if (outlineSearchClear) {
    outlineSearchClear.addEventListener("click", () => {
      state.outlineSearchKeyword = "";
      if (outlineSearch) {
        outlineSearch.value = "";
        outlineSearch.focus();
      }
      applyOutlineFilter();
    });
  }
  if (pageGo) {
    pageGo.addEventListener("click", handlePageJump);
  }
  if (pagePrev) {
    pagePrev.addEventListener("click", () => {
      jumpRelativePage(-1);
    });
  }
  if (pageNext) {
    pageNext.addEventListener("click", () => {
      jumpRelativePage(1);
    });
  }
  if (pageInput) {
    pageInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        handlePageJump();
      }
    });
    pageInput.addEventListener("blur", () => {
      if (!state.pdfDocument) {
        return;
      }
      const normalizedPage = clamp(
        Number.parseInt(pageInput.value || "1", 10) || state.currentPage || 1,
        1,
        state.pdfDocument.numPages,
      );
      pageInput.value = String(normalizedPage);
    });
  }
  if (pageRange) {
    pageRange.addEventListener("pointerdown", () => {
      setPageRangeInteraction(true);
    });
    pageRange.addEventListener("focus", () => {
      setPageRangeInteraction(true);
    });
    pageRange.addEventListener("input", handlePageRangeInput);
    pageRange.addEventListener("change", () => {
      setPageRangeInteraction(false);
    });
    pageRange.addEventListener("blur", () => {
      setPageRangeInteraction(false);
    });
  }
  if (typeof window !== "undefined") {
    window.addEventListener("pointerup", () => {
      setPageRangeInteraction(false);
    });
  }
  scrollWrap.addEventListener("scroll", scheduleScrollSync, { passive: true });
  if (typeof window !== "undefined") {
    window.addEventListener("resize", () => {
      if (!state.pdfDocument) {
        return;
      }
      window.clearTimeout(state.resizeTimer);
      state.resizeTimer = window.setTimeout(() => {
        refreshPageLayout();
      }, 120);
    });
  }

  updateZoomModeUi();
  setSidebarTab("pages");
  void loadPdf();
  return {
    refreshPageLayout,
    state,
  };
}

function normalizePreviewErrorMessage(value) {
  const normalized = String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.slice(0, 160);
}

function buildPreviewFetchErrorMessage(statusCode, detail) {
  const normalized = normalizePreviewErrorMessage(detail);
  if (!normalized) {
    return "附件读取失败（HTTP " + statusCode + "），请刷新后重试。";
  }
  return "附件读取失败（HTTP " + statusCode + "）： " + normalized;
}

export async function fetchPreviewBytes(sourceUrl, accept = "*/*") {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  let timeoutId = 0;
  try {
    if (controller && typeof window !== "undefined" && typeof window.setTimeout === "function") {
      timeoutId = window.setTimeout(() => {
        controller.abort();
      }, GENERIC_FETCH_TIMEOUT_MS);
    }
    const response = await fetch(sourceUrl, {
      credentials: "same-origin",
      cache: "no-store",
      redirect: "follow",
      signal: controller ? controller.signal : undefined,
      headers: {
        Accept: accept,
      },
    });
    if (!response.ok) {
      let detail = "";
      try {
        detail = await response.text();
      } catch (_error) {
        detail = "";
      }
      throw new Error(buildPreviewFetchErrorMessage(response.status, detail));
    }
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (bytes.byteLength === 0) {
      throw new Error("附件内容为空，当前无法预览。");
    }
    return bytes;
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error("附件读取超时，请刷新后重试。");
    }
    throw error;
  } finally {
    clearWindowTimer(timeoutId);
  }
}

function previewMetricNodes(root) {
  return [
    root.querySelector('[data-preview-metric="primary"]'),
    root.querySelector('[data-preview-metric="secondary"]'),
    root.querySelector('[data-preview-metric="tertiary"]'),
  ].filter(Boolean);
}

export function setPreviewMetrics(root, values) {
  const metrics = previewMetricNodes(root);
  const labels = Array.isArray(values) ? values.filter(Boolean) : [];
  metrics.forEach((node, index) => {
    const value = labels[index] || "";
    node.textContent = value;
    node.hidden = !value;
  });
}

function previewStatusNodes(root) {
  return {
    shell: root.querySelector("[data-preview-status]"),
    copy: root.querySelector("[data-preview-status-copy]"),
  };
}

export function setPreviewStatus(root, message, tone = "info") {
  const status = previewStatusNodes(root);
  if (!status.shell || !status.copy) {
    return;
  }
  status.copy.textContent = message || "";
  status.shell.hidden = !message;
  status.shell.classList.toggle("is-error", tone === "error");
}

function previewHost(root) {
  return root.querySelector("[data-preview-host]");
}

export function clearPreviewHost(root, officeMode = false) {
  const host = previewHost(root);
  if (!host) {
    return null;
  }
  host.classList.toggle("is-office", officeMode);
  host.replaceChildren();
  return host;
}

export function buildPreviewEmptyState(doc, title, detail) {
  const shell = doc.createElement("div");
  shell.className = "document-preview-empty";
  const copy = doc.createElement("div");
  const strong = doc.createElement("strong");
  strong.textContent = title;
  copy.appendChild(strong);
  if (detail) {
    const description = doc.createElement("div");
    description.style.marginTop = "8px";
    description.textContent = detail;
    copy.appendChild(description);
  }
  shell.appendChild(copy);
  return shell;
}

export function formatPreviewByteSize(byteSize) {
  const value = Number(byteSize || 0);
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }
  if (value < 1024) {
    return Math.round(value) + " B";
  }
  const units = ["KB", "MB", "GB"];
  let current = value;
  let unitIndex = -1;
  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024;
    unitIndex += 1;
  }
  return (Math.round(current * 10) / 10).toString() + " " + units[unitIndex];
}

function replacementCharacterRatio(value) {
  const text = String(value || "");
  if (!text) {
    return 0;
  }
  const replacementCount = (text.match(/\uFFFD/g) || []).length;
  return replacementCount / text.length;
}

function decodePreviewText(bytes) {
  const utf8Decoder = new TextDecoder("utf-8", { fatal: false });
  const utf8Text = utf8Decoder.decode(bytes).replace(/\r\n/g, "\n");
  let best = {
    encoding: "UTF-8",
    text: utf8Text,
    score: replacementCharacterRatio(utf8Text),
  };
  for (const encoding of ["gb18030", "utf-16le"]) {
    try {
      const decoder = new TextDecoder(encoding, { fatal: false });
      const text = decoder.decode(bytes).replace(/\r\n/g, "\n");
      const score = replacementCharacterRatio(text);
      if (score < best.score) {
        best = {
          encoding: encoding.toUpperCase(),
          text,
          score,
        };
      }
    } catch (_error) {
      // Ignore unsupported decoders.
    }
  }
  return {
    encoding: best.encoding,
    text: best.text,
  };
}

function previewArrayBuffer(bytes) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function loadScriptOnce(src, globalName) {
  const cached = previewScriptLoaders.get(src);
  if (cached) {
    return cached;
  }
  const promise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-preview-script="' + src + '"]');
    if (existing) {
      if (!globalName || globalThis[globalName]) {
        resolve(globalName ? globalThis[globalName] : undefined);
        return;
      }
      existing.addEventListener("load", () => {
        resolve(globalName ? globalThis[globalName] : undefined);
      }, { once: true });
      existing.addEventListener("error", () => {
        reject(new Error("加载预览脚本失败。"));
      }, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.previewScript = src;
    script.addEventListener("load", () => {
      resolve(globalName ? globalThis[globalName] : undefined);
    }, { once: true });
    script.addEventListener("error", () => {
      reject(new Error("加载预览脚本失败。"));
    }, { once: true });
    document.head.appendChild(script);
  });
  previewScriptLoaders.set(src, promise);
  return promise;
}

async function ensureSheetJs() {
  const xlsx = await loadScriptOnce("/static/vendor/sheetjs/xlsx.full.min.js", "XLSX");
  if (!xlsx || !xlsx.utils || typeof xlsx.read !== "function") {
    throw new Error("表格预览模块初始化失败。");
  }
  return xlsx;
}

function appendPreviewNote(target, text) {
  const note = document.createElement("div");
  note.className = "preview-note-banner";
  note.textContent = text;
  target.appendChild(note);
}

async function renderTextPreview(root, sourceUrl) {
  setPreviewStatus(root, "正在读取文本内容，请稍候...");
  const bytes = await fetchPreviewBytes(sourceUrl, "text/plain,application/octet-stream;q=0.9,*/*;q=0.1");
  const truncated = bytes.byteLength > TEXT_PREVIEW_MAX_BYTES;
  const previewBytes = truncated ? bytes.slice(0, TEXT_PREVIEW_MAX_BYTES) : bytes;
  const decoded = decodePreviewText(previewBytes);
  const host = clearPreviewHost(root, false);
  if (!host) {
    return;
  }
  const shell = document.createElement("div");
  shell.className = "text-preview";
  const pre = document.createElement("pre");
  pre.textContent = decoded.text;
  shell.appendChild(pre);
  if (truncated) {
    appendPreviewNote(shell, "当前仅展示前 2 MB 内容，请下载原文件查看完整文本。");
  }
  host.appendChild(shell);
  const lineCount = decoded.text ? decoded.text.split("\n").length : 0;
  setPreviewMetrics(root, [
    lineCount + " 行",
    decoded.encoding,
    formatPreviewByteSize(bytes.byteLength),
  ]);
  setPreviewStatus(root, "");
}

function sheetCellDisplayValue(cell) {
  if (!cell) {
    return "";
  }
  if (cell.w != null && cell.w !== "") {
    return String(cell.w);
  }
  if (cell.v == null) {
    return "";
  }
  return String(cell.v);
}

function buildSheetTable(XLSX, worksheet) {
  if (!worksheet || !worksheet["!ref"]) {
    return {
      table: null,
      totalRows: 0,
      totalCols: 0,
      truncated: false,
    };
  }
  const range = XLSX.utils.decode_range(worksheet["!ref"]);
  const totalRows = Math.max(0, range.e.r - range.s.r + 1);
  const totalCols = Math.max(0, range.e.c - range.s.c + 1);
  const renderRows = Math.min(totalRows, SHEET_PREVIEW_MAX_ROWS);
  const renderCols = Math.min(totalCols, SHEET_PREVIEW_MAX_COLS);
  const truncated = renderRows < totalRows || renderCols < totalCols;
  const table = document.createElement("table");
  table.className = "sheet-preview-table";
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  const corner = document.createElement("th");
  corner.textContent = "#";
  headRow.appendChild(corner);
  for (let columnIndex = 0; columnIndex < renderCols; columnIndex += 1) {
    const header = document.createElement("th");
    header.textContent = XLSX.utils.encode_col(range.s.c + columnIndex);
    headRow.appendChild(header);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (let rowIndex = 0; rowIndex < renderRows; rowIndex += 1) {
    const row = document.createElement("tr");
    const rowLabel = document.createElement("th");
    rowLabel.scope = "row";
    rowLabel.textContent = String(range.s.r + rowIndex + 1);
    row.appendChild(rowLabel);
    for (let columnIndex = 0; columnIndex < renderCols; columnIndex += 1) {
      const cell = document.createElement("td");
      const cellRef = XLSX.utils.encode_cell({
        r: range.s.r + rowIndex,
        c: range.s.c + columnIndex,
      });
      cell.textContent = sheetCellDisplayValue(worksheet[cellRef]);
      row.appendChild(cell);
    }
    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  return {
    table,
    totalRows,
    totalCols,
    truncated,
  };
}

async function renderSpreadsheetPreview(root, sourceUrl) {
  setPreviewStatus(root, "正在解析表格内容，请稍候...");
  const bytes = await fetchPreviewBytes(
    sourceUrl,
    "application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,application/octet-stream;q=0.9,*/*;q=0.1",
  );
  const XLSX = await ensureSheetJs();
  let workbook = null;
  try {
    workbook = XLSX.read(previewArrayBuffer(bytes), {
      type: "array",
      cellFormula: false,
      cellHTML: false,
      cellText: true,
      dense: false,
    });
  } catch (_error) {
    throw new Error("当前表格文件无法解析，请下载原文件查看。");
  }
  const sheetNames = Array.isArray(workbook?.SheetNames) ? workbook.SheetNames : [];
  if (sheetNames.length === 0) {
    throw new Error("表格内容为空，当前无法预览。");
  }

  const host = clearPreviewHost(root, false);
  if (!host) {
    return;
  }
  const shell = document.createElement("div");
  shell.className = "sheet-preview";
  const tabs = document.createElement("div");
  tabs.className = "sheet-preview-tabs";
  const tableWrap = document.createElement("div");
  tableWrap.className = "sheet-preview-table-wrap";
  const note = document.createElement("div");
  note.className = "preview-note-banner sheet-preview-note";
  note.hidden = true;

  function renderSheet(sheetName) {
    tabs.querySelectorAll(".sheet-preview-tab").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.sheetName === sheetName);
    });
    tableWrap.replaceChildren();
    note.hidden = true;
    note.textContent = "";
    const worksheet = workbook.Sheets[sheetName];
    const tableResult = buildSheetTable(XLSX, worksheet);
    if (!tableResult.table) {
      tableWrap.appendChild(
        buildPreviewEmptyState(document, "当前工作表没有可展示的内容。", "可以切换其他工作表或下载原文件查看。"),
      );
      setPreviewMetrics(root, [
        sheetNames.length + " 个工作表",
        "0 行",
        "0 列",
      ]);
      return;
    }
    tableWrap.appendChild(tableResult.table);
    if (tableResult.truncated) {
      note.hidden = false;
      note.textContent = "当前仅展示部分行列，请下载原文件查看完整表格。";
    }
    setPreviewMetrics(root, [
      sheetNames.length + " 个工作表",
      tableResult.totalRows + " 行",
      tableResult.totalCols + " 列",
    ]);
  }

  for (const sheetName of sheetNames) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sheet-preview-tab";
    button.dataset.sheetName = sheetName;
    button.textContent = sheetName;
    button.addEventListener("click", () => {
      renderSheet(sheetName);
    });
    tabs.appendChild(button);
  }

  shell.append(tabs, tableWrap, note);
  host.appendChild(shell);
  renderSheet(sheetNames[0]);
  setPreviewStatus(root, "");
}

function nextAnimationFrame() {
  return new Promise((resolve) => {
    scheduleAnimationFrame(resolve);
  });
}

function officePreviewErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (error instanceof Error) {
    console.error("[document-preview] Office 预览失败", error);
  }
  if (/numbering\.bodyOffsetPt must be finite and non-negative|Paragraph source boundaries must align with retained lines/iu.test(message)) {
    return "该文档包含当前预览引擎暂不支持的复杂版式，请下载原文件查看。";
  }
  return message || "当前无法加载预览。";
}

async function renderOfficePreview(root, sourceUrl, previewType) {
  const label = previewType === "pptx" ? "演示文稿" : "Word 文档";
  setPreviewStatus(root, "正在加载" + label + "预览，请稍候...");
  const bytes = await fetchPreviewBytes(sourceUrl, "application/octet-stream,*/*;q=0.1");
  const host = clearPreviewHost(root, true);
  if (!host) {
    return;
  }
  const stage = document.createElement("div");
  stage.className = "office-preview-stage";
  host.appendChild(stage);
  await nextAnimationFrame();
  try {
    if (previewType === "docx") {
      const { DocxScrollViewer } = await import("/static/vendor/ooxml/docx.mjs");
      const viewer = new DocxScrollViewer(stage);
      await viewer.load(previewArrayBuffer(bytes));
      if (typeof viewer.relayout === "function") {
        viewer.relayout();
      }
      setPreviewMetrics(root, [
        (viewer.pageCount || 0) + " 页",
        formatPreviewByteSize(bytes.byteLength),
      ]);
    } else {
      const { PptxScrollViewer } = await import("/static/vendor/ooxml/pptx.mjs");
      const viewer = new PptxScrollViewer(stage);
      await viewer.load(previewArrayBuffer(bytes));
      if (typeof viewer.relayout === "function") {
        viewer.relayout();
      }
      setPreviewMetrics(root, [
        (viewer.slideCount || 0) + " 张幻灯片",
        formatPreviewByteSize(bytes.byteLength),
      ]);
    }
  } catch (error) {
    throw new Error(officePreviewErrorMessage(error));
  }
  setPreviewStatus(root, "");
}

function renderPreviewError(root, message) {
  const host = clearPreviewHost(root, false);
  if (host) {
    host.appendChild(
      buildPreviewEmptyState(document, "当前无法加载预览。", message || "请刷新后重试，或下载原文件查看。"),
    );
  }
  setPreviewMetrics(root, []);
  setPreviewStatus(root, message || "当前无法加载预览。", "error");
}

async function initNonPdfPreview(root) {
  const previewRoot = root.querySelector("[data-document-preview-root]");
  if (!previewRoot) {
    return false;
  }
  const previewType = String(previewRoot.dataset.previewType || "").trim().toLowerCase();
  const sourceUrl = String(previewRoot.dataset.previewUrl || "").trim();
  if (!previewType || !sourceUrl) {
    renderPreviewError(previewRoot, "缺少预览地址，请刷新后重试。");
    return true;
  }
  try {
    switch (previewType) {
      case "text":
        await renderTextPreview(previewRoot, sourceUrl);
        break;
      case "spreadsheet":
        await renderSpreadsheetPreview(previewRoot, sourceUrl);
        break;
      case "docx":
      case "pptx":
        await renderOfficePreview(previewRoot, sourceUrl, previewType);
        break;
      case "legacy-doc":
      case "legacy-ppt": {
        const { renderLegacyDocumentPreview } = await import("/static/document-preview-legacy.mjs");
        await renderLegacyDocumentPreview(previewRoot, sourceUrl, previewType);
        break;
      }
      default:
        renderPreviewError(previewRoot, "当前文件类型暂不支持站内预览。");
        break;
    }
  } catch (error) {
    const message = error && error.message ? error.message : "当前无法加载预览。";
    renderPreviewError(previewRoot, message);
  }
  return true;
}

async function initPdfPreviewPage(root) {
  const pdfStage = root.querySelector("[data-pdf-preview]");
  if (!pdfStage) {
    return false;
  }
  const pdfjsLib = await import("/static/vendor/pdfjs/build/pdf.min.mjs");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/static/vendor/pdfjs/build/pdf.worker.min.mjs";
  initPdfPreview({
    pdfjsLib,
    root,
  });
  return true;
}

export async function initDocumentPreview(options = {}) {
  const root = options.root || document;
  if (await initNonPdfPreview(root)) {
    return;
  }
  await initPdfPreviewPage(root);
}
