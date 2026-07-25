import {
  buildPreviewEmptyState,
  clearPreviewHost,
  fetchPreviewBytes,
  formatPreviewByteSize,
  setPreviewMetrics,
  setPreviewStatus,
} from "/static/document-preview.mjs";

const LEGACY_DOC_EXTRA_CSS = `
.legacy-doc-stage {
  min-height: 100%;
  background: linear-gradient(180deg, rgb(248 250 252 / 96%), rgb(241 245 249 / 92%));
}

.legacy-doc-stage .msdoc-root img {
  max-width: 100%;
  height: auto;
}

.legacy-doc-stage .msdoc-stage {
  min-height: 100%;
}
`;

const LEGACY_PPT_EXTRA_CSS = `
.legacy-ppt-stage {
  min-height: 100%;
}

.legacy-ppt-stage .ppt-binary-shell {
  min-height: 100%;
}
`;

function nextAnimationFrame() {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 16);
  });
}

function previewArrayBuffer(bytes) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function setLegacyPreviewError(root, message) {
  const host = clearPreviewHost(root, false);
  if (host) {
    host.appendChild(
      buildPreviewEmptyState(
        document,
        "当前无法加载实验性预览。",
        message || "请刷新后重试，或下载原文件查看。",
      ),
    );
  }
  setPreviewMetrics(root, []);
  setPreviewStatus(root, message || "当前无法加载实验性预览。", "error");
}

async function cleanupLegacyPreview(root) {
  const cleanup = root && root.__legacyPreviewCleanup;
  if (typeof cleanup !== "function") {
    return;
  }
  delete root.__legacyPreviewCleanup;
  try {
    await cleanup();
  } catch (_error) {
    // Ignore preview cleanup failures during page transitions.
  }
}

async function renderLegacyDocPreview(root, sourceUrl) {
  setPreviewStatus(root, "正在加载旧版 Word 文档预览，请稍候...");
  const bytes = await fetchPreviewBytes(
    sourceUrl,
    "application/msword,application/octet-stream,*/*;q=0.1",
  );
  const host = clearPreviewHost(root, true);
  if (!host) {
    return;
  }
  const stage = document.createElement("div");
  stage.className = "legacy-doc-stage";
  host.appendChild(stage);
  await nextAnimationFrame();
  const { parseMsDocToHtml } = await import("/static/vendor/legacy-doc/index.js");
  const rendered = await parseMsDocToHtml(previewArrayBuffer(bytes));
  stage.innerHTML =
    '<style data-legacy-doc-preview>' +
    rendered.css +
    LEGACY_DOC_EXTRA_CSS +
    "</style>" +
    '<div class="msdoc-root">' +
    rendered.html +
    "</div>";
  const warnings = Array.isArray(rendered.warnings) ? rendered.warnings.length : 0;
  setPreviewMetrics(root, [
    "DOC · 实验性",
    formatPreviewByteSize(bytes.byteLength),
    warnings > 0 ? "兼容提示 " + warnings : "",
  ]);
  setPreviewStatus(root, "");
}

async function renderLegacyPptPreview(root, sourceUrl) {
  setPreviewStatus(root, "正在加载旧版演示文稿预览，请稍候...");
  const bytes = await fetchPreviewBytes(
    sourceUrl,
    "application/vnd.ms-powerpoint,application/octet-stream,*/*;q=0.1",
  );
  const host = clearPreviewHost(root, true);
  if (!host) {
    return;
  }
  const stage = document.createElement("div");
  stage.className = "legacy-ppt-stage";
  const style = document.createElement("style");
  style.dataset.legacyPptPreview = "true";
  style.textContent = LEGACY_PPT_EXTRA_CSS;
  host.append(style, stage);
  await nextAnimationFrame();
  const { createPptViewer } = await import("/static/vendor/legacy-ppt/index.mjs");
  const runtime = await createPptViewer({
    worker: "auto",
    workerUrl: new URL("/static/vendor/legacy-ppt/worker.mjs", window.location.href),
    wasmUrl: new URL("/static/vendor/legacy-ppt/ppt-native.wasm", window.location.href),
    fontUrl: new URL("/static/vendor/legacy-ppt/ppt-font-cjk.otf", window.location.href),
  });
  const mounted = await runtime.mount(stage, previewArrayBuffer(bytes), {
    scale: 1,
    pixelRatio: window.devicePixelRatio || 1,
    virtualize: true,
    rootMargin: "150% 0px",
    releaseDelayMs: 1200,
  });
  root.__legacyPreviewCleanup = async function cleanupLegacyPptRuntime() {
    await mounted.close();
    await runtime.close();
  };
  window.addEventListener(
    "pagehide",
    () => {
      void cleanupLegacyPreview(root);
    },
    { once: true },
  );
  setPreviewMetrics(root, [
    mounted.document.slideCount + " 张幻灯片",
    formatPreviewByteSize(bytes.byteLength),
    "含运行时水印",
  ]);
  setPreviewStatus(root, "");
}

export async function renderLegacyDocumentPreview(root, sourceUrl, previewType) {
  await cleanupLegacyPreview(root);
  try {
    if (previewType === "legacy-doc") {
      await renderLegacyDocPreview(root, sourceUrl);
      return;
    }
    if (previewType === "legacy-ppt") {
      await renderLegacyPptPreview(root, sourceUrl);
      return;
    }
    setLegacyPreviewError(root, "当前实验性预览类型未实现。");
  } catch (error) {
    const message = error && error.message ? error.message : "当前无法加载实验性预览。";
    setLegacyPreviewError(root, message);
  }
}
