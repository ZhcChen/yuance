// @ts-check

const FILE_VIEWER_IIFE_URL = "/static/vendor/file-viewer/flyfish-file-viewer-web-full.iife.js";
const PREVIEW_FETCH_TIMEOUT_MS = 30000;
const scriptLoaders = new Map();

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

function normalizePreviewErrorMessage(value) {
  const normalized = String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized ? normalized.slice(0, 160) : "";
}

function buildPreviewFetchErrorMessage(statusCode, detail) {
  const normalizedDetail = normalizePreviewErrorMessage(detail);
  if (!normalizedDetail) {
    return "附件读取失败（HTTP " + statusCode + "），请刷新后重试。";
  }
  return "附件读取失败（HTTP " + statusCode + "）： " + normalizedDetail;
}

function extensionFromFilename(filename) {
  const name = String(filename || "").trim();
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === name.length - 1) {
    return "";
  }
  return name.slice(dotIndex + 1).toLowerCase();
}

export function viewerTypeFor(previewType, filename) {
  const extension = extensionFromFilename(filename);
  switch (previewType) {
    case "legacy-doc":
      return "doc";
    case "legacy-ppt":
      return "ppt";
    case "spreadsheet":
      return extension || "xlsx";
    case "text":
      return extension || "txt";
    default:
      return previewType || extension || "bin";
  }
}

function loadScriptOnce(src, globalName) {
  const cached = scriptLoaders.get(src);
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
      existing.addEventListener(
        "load",
        () => {
          resolve(globalName ? globalThis[globalName] : undefined);
        },
        { once: true },
      );
      existing.addEventListener(
        "error",
        () => {
          reject(new Error("加载预览脚本失败。"));
        },
        { once: true },
      );
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.previewScript = src;
    script.addEventListener(
      "load",
      () => {
        resolve(globalName ? globalThis[globalName] : undefined);
      },
      { once: true },
    );
    script.addEventListener(
      "error",
      () => {
        reject(new Error("加载预览脚本失败。"));
      },
      { once: true },
    );
    document.head.appendChild(script);
  });
  scriptLoaders.set(src, promise);
  return promise;
}

async function loadFileViewer() {
  const viewer = await loadScriptOnce(FILE_VIEWER_IIFE_URL, "FlyfishFileViewerWebFull");
  if (!viewer || typeof viewer.mountViewer !== "function") {
    throw new Error("站内预览器初始化失败。");
  }
  return viewer;
}

async function fetchPreviewBytes(sourceUrl) {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  let timeoutId = 0;
  try {
    if (controller && typeof window !== "undefined" && typeof window.setTimeout === "function") {
      timeoutId = window.setTimeout(() => {
        controller.abort();
      }, PREVIEW_FETCH_TIMEOUT_MS);
    }
    const response = await fetch(sourceUrl, {
      credentials: "same-origin",
      cache: "no-store",
      redirect: "follow",
      signal: controller ? controller.signal : undefined,
      headers: {
        Accept: "application/octet-stream,*/*;q=0.1",
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
    if (!buffer || buffer.byteLength === 0) {
      throw new Error("附件内容为空，当前无法预览。");
    }
    return buffer;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("附件读取超时，请刷新后重试。");
    }
    throw error;
  } finally {
    clearWindowTimer(timeoutId);
  }
}

/**
 * @param {HTMLElement} host
 * @param {{ source: string, filename: string, previewType: string }} options
 * @returns {Promise<{ destroy: () => unknown }>}
 */
export async function mountBrowserDocumentViewer(host, { source, filename, previewType }) {
  const buffer = await fetchPreviewBytes(source);
  const viewer = await loadFileViewer();
  const type = viewerTypeFor(previewType, filename);
  return viewer.mountViewer(host, {
    buffer,
    filename,
    type,
    options: {
      locale: "zh-CN",
      theme: "light",
      styleIsolation: "auto",
      toolbar: {
        download: false,
        print: false,
        exportHtml: false,
        zoom: true,
        theme: true,
      },
    },
  });
}
