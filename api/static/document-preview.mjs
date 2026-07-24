const FIT_WIDTH_PADDING = 72;
const MIN_FIT_SCALE = 0.75;
const MAX_ZOOM_FACTOR = 2.4;
const MIN_ZOOM_FACTOR = 0.7;
const PAGE_MARKER_RATIO = 0.32;
const THUMBNAIL_WIDTH = 156;

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function computeFitWidthScale(viewportWidth, containerWidth) {
  const availableWidth = Math.max(240, Number(containerWidth || 0) - FIT_WIDTH_PADDING);
  return Math.max(MIN_FIT_SCALE, availableWidth / Math.max(1, Number(viewportWidth || 1)));
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

  async function walk(items, depth) {
    for (const item of items || []) {
      const pageNumber = await resolveOutlinePageNumber(pdfDocument, item.dest);
      const title = normalizeOutlineTitle(item.title, pageNumber);
      entries.push({
        id: "outline-" + String(idCounter += 1),
        title,
        pageNumber,
        depth,
      });
      if (Array.isArray(item.items) && item.items.length > 0) {
        await walk(item.items, depth + 1);
      }
    }
  }

  await walk(outlineItems || [], 0);
  return entries;
}

function createCanvas(doc) {
  return doc.createElement("canvas");
}

function drawThumbnailFromCanvas(sourceCanvas, viewport, doc) {
  const thumbnailCanvas = createCanvas(doc);
  const ratio = viewport.height / Math.max(1, viewport.width);
  const deviceScale = Math.min(2, Number(globalThis.devicePixelRatio || 1));
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
  const zoomOut = root.getElementById("pdf-zoom-out");
  const zoomIn = root.getElementById("pdf-zoom-in");
  const zoomReset = root.getElementById("pdf-zoom-reset");
  const thumbnailList = root.getElementById("pdf-thumbnail-list");
  const thumbnailEmpty = root.getElementById("pdf-thumbnail-empty");
  const outlineList = root.getElementById("pdf-outline-list");
  const outlineEmpty = root.getElementById("pdf-outline-empty");
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
    pageArticles: new Map(),
    pageMetrics: [],
    pdfDocument: null,
    renderToken: 0,
    resizeTimer: 0,
    scrollSyncFrame: 0,
    suppressScrollSyncUntil: 0,
    thumbnailButtons: new Map(),
    outlineButtons: new Map(),
    zoomFactor: 1,
  };

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

  function scrollIntoViewIfNeeded(element) {
    if (!element || typeof element.scrollIntoView !== "function") {
      return;
    }
    element.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
  }

  function syncActivePage(pageNumber) {
    const previousPage = state.currentPage;
    const pageChanged = previousPage !== pageNumber;
    state.currentPage = pageNumber;
    if (pageInput) {
      pageInput.value = String(pageNumber);
    }
    setPageCount(pageNumber);
    for (const [entryPageNumber, article] of state.pageArticles.entries()) {
      article.classList.toggle("is-active", entryPageNumber === pageNumber);
    }
    for (const [entryPageNumber, button] of state.thumbnailButtons.entries()) {
      const isActive = entryPageNumber === pageNumber;
      button.classList.toggle("is-active", isActive);
      if (isActive && pageChanged) {
        scrollIntoViewIfNeeded(button);
      }
    }
    const activeOutlineId = findActiveOutlineEntry(state.outlineEntries, pageNumber);
    for (const [id, button] of state.outlineButtons.entries()) {
      const isActive = id === activeOutlineId;
      button.classList.toggle("is-active", isActive);
      if (isActive && pageChanged) {
        scrollIntoViewIfNeeded(button);
      }
    }
  }

  function measurePageMetrics() {
    if (!scrollWrap) {
      state.pageMetrics = [];
      return;
    }
    const scrollRect = scrollWrap.getBoundingClientRect();
    state.pageMetrics = Array.from(state.pageArticles.entries()).map(([pageNumber, article]) => {
      const rect = article.getBoundingClientRect();
      return {
        pageNumber,
        top: rect.top - scrollRect.top + scrollWrap.scrollTop,
        height: rect.height,
      };
    });
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

  function scheduleScrollSync() {
    if (state.scrollSyncFrame) {
      return;
    }
    state.scrollSyncFrame = 1;
    scheduleAnimationFrame(() => {
      state.scrollSyncFrame = 0;
      syncCurrentPageFromScroll();
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
    return true;
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

  function renderThumbnail(sourceCanvas, viewport, pageNumber) {
    if (!thumbnailList) {
      return;
    }
    const button = root.createElement("button");
    button.type = "button";
    button.className = "pdf-thumb";
    button.dataset.pageNumber = String(pageNumber);
    const surface = root.createElement("span");
    surface.className = "pdf-thumb-surface";
    surface.appendChild(drawThumbnailFromCanvas(sourceCanvas, viewport, root));
    const meta = root.createElement("span");
    meta.className = "pdf-thumb-meta";
    meta.textContent = "第 " + pageNumber + " 页";
    button.append(surface, meta);
    button.addEventListener("click", () => {
      setSidebarTab("pages");
      scrollToPage(pageNumber, "smooth");
    });
    thumbnailList.appendChild(button);
    state.thumbnailButtons.set(pageNumber, button);
  }

  async function renderOutline() {
    if (!state.pdfDocument || !outlineList || !outlineEmpty || !outlineTab) {
      return;
    }
    outlineList.replaceChildren();
    state.outlineButtons.clear();
    let outlineEntries = [];
    try {
      const outline = await state.pdfDocument.getOutline();
      outlineEntries = await resolveOutlineEntries(state.pdfDocument, outline || []);
    } catch (_error) {
      outlineEntries = [];
    }
    state.outlineEntries = outlineEntries;
    const hasOutline = outlineEntries.length > 0;
    outlineTab.hidden = !hasOutline;
    if (!hasOutline && pageTab) {
      setSidebarTab("pages");
    }
    outlineEmpty.hidden = hasOutline;
    if (!hasOutline) {
      return;
    }
    const fragment = root.createDocumentFragment();
    for (const entry of outlineEntries) {
      const button = root.createElement("button");
      button.type = "button";
      button.className = "pdf-outline-item";
      button.style.setProperty("--outline-depth", String(entry.depth));
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
      title.textContent = entry.title;
      const page = root.createElement("span");
      page.className = "pdf-outline-page";
      page.textContent = typeof entry.pageNumber === "number" ? "P" + entry.pageNumber : "—";
      button.append(title, page);
      fragment.appendChild(button);
      state.outlineButtons.set(entry.id, button);
    }
    outlineList.appendChild(fragment);
  }

  async function renderPdf() {
    if (!state.pdfDocument) {
      return;
    }
    const currentToken = state.renderToken + 1;
    state.renderToken = currentToken;
    pagesWrap.replaceChildren();
    state.pageArticles.clear();
    state.pageMetrics = [];
    state.thumbnailButtons.clear();
    if (thumbnailList) {
      thumbnailList.replaceChildren();
    }
    if (thumbnailEmpty) {
      thumbnailEmpty.hidden = false;
    }
    setStatus("正在渲染 PDF 页面，请稍候...", true);

    const pageTotal = state.pdfDocument.numPages;
    for (let pageNumber = 1; pageNumber <= pageTotal; pageNumber += 1) {
      if (currentToken !== state.renderToken) {
        return;
      }
      setStatus("正在渲染第 " + pageNumber + " / " + pageTotal + " 页...", true);
      const page = await state.pdfDocument.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const fitScale = computeFitWidthScale(baseViewport.width, scrollWrap.clientWidth) * state.zoomFactor;
      const viewport = page.getViewport({ scale: fitScale });
      const outputScale = Number(globalThis.devicePixelRatio || 1);
      const article = root.createElement("article");
      article.className = "pdf-page";
      article.dataset.pageNumber = String(pageNumber);
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
      const label = root.createElement("div");
      label.className = "pdf-page-label";
      label.textContent = "第 " + pageNumber + " / " + pageTotal + " 页";
      article.append(canvas, label);
      pagesWrap.appendChild(article);
      state.pageArticles.set(pageNumber, article);
      renderThumbnail(canvas, viewport, pageNumber);
      if (pageNumber === 1) {
        syncActivePage(1);
      }
    }

    measurePageMetrics();
    if (state.currentPage > pageTotal) {
      state.currentPage = pageTotal;
    }
    syncActivePage(state.currentPage || 1);
    setStatus("", false);
  }

  async function loadPdf() {
    const sourceUrl = stage.dataset.pdfUrl || "";
    if (!sourceUrl) {
      setStatus("缺少 PDF 预览地址。", true);
      return;
    }
    try {
      setStatus("正在加载 PDF 预览，请稍候...", true);
      const loadingTask = pdfjsLib.getDocument({
        url: sourceUrl,
        cMapUrl: "/static/vendor/pdfjs/cmaps/",
        cMapPacked: true,
        standardFontDataUrl: "/static/vendor/pdfjs/standard_fonts/",
      });
      state.pdfDocument = await loadingTask.promise;
      if (pageInput) {
        pageInput.disabled = false;
        pageInput.min = "1";
        pageInput.max = String(state.pdfDocument.numPages);
      }
      await Promise.all([renderPdf(), renderOutline()]);
      syncActivePage(state.currentPage || 1);
      if (thumbnailEmpty) {
        thumbnailEmpty.hidden = state.thumbnailButtons.size > 0;
      }
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
  if (zoomOut) {
    zoomOut.addEventListener("click", () => {
      state.zoomFactor = clamp(state.zoomFactor - 0.15, MIN_ZOOM_FACTOR, MAX_ZOOM_FACTOR);
      renderPdf();
    });
  }
  if (zoomIn) {
    zoomIn.addEventListener("click", () => {
      state.zoomFactor = clamp(state.zoomFactor + 0.15, MIN_ZOOM_FACTOR, MAX_ZOOM_FACTOR);
      renderPdf();
    });
  }
  if (zoomReset) {
    zoomReset.addEventListener("click", () => {
      state.zoomFactor = 1;
      renderPdf();
    });
  }
  if (pageGo) {
    pageGo.addEventListener("click", handlePageJump);
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
  scrollWrap.addEventListener("scroll", scheduleScrollSync, { passive: true });
  if (typeof window !== "undefined") {
    window.addEventListener("resize", () => {
      if (!state.pdfDocument) {
        return;
      }
      window.clearTimeout(state.resizeTimer);
      state.resizeTimer = window.setTimeout(() => {
        renderPdf();
      }, 120);
    });
  }

  setSidebarTab("pages");
  loadPdf();
  return {
    rerender: renderPdf,
    state,
  };
}
