const FILE_VIEWER_IIFE_URL = "/static/vendor/file-viewer/flyfish-file-viewer-web-full.iife.js";
const PREVIEW_FETCH_TIMEOUT_MS = 30000;
const previewScriptLoaders = new Map();

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

export async function fetchPreviewBytes(sourceUrl) {
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
    if (error && error.name === "AbortError") {
      throw new Error("附件读取超时，请刷新后重试。");
    }
    throw error;
  } finally {
    clearWindowTimer(timeoutId);
  }
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
  host.classList.toggle("is-office", Boolean(officeMode));
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

export function setPreviewMetrics(_root, _values) {
  // file-viewer 自带工具栏与状态面板，不再使用旧的分栏指标节点。
}

function extensionFromFilename(filename) {
  const name = String(filename || "").trim();
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === name.length - 1) {
    return "";
  }
  return name.slice(dotIndex + 1).toLowerCase();
}

function viewerTypeFor(previewType, filename) {
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
  previewScriptLoaders.set(src, promise);
  return promise;
}

async function loadFileViewer() {
  const viewer = await loadScriptOnce(FILE_VIEWER_IIFE_URL, "FlyfishFileViewerWebFull");
  if (!viewer || typeof viewer.mountViewer !== "function") {
    throw new Error("站内预览器初始化失败。");
  }
  return viewer;
}

function viewerErrorMessage(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (error && typeof error.message === "string") {
    return error.message;
  }
  return "当前文件无法预览，请刷新后重试或下载原文件查看。";
}

function renderPreviewError(root, message) {
  const host = clearPreviewHost(root);
  if (host) {
    host.appendChild(
      buildPreviewEmptyState(
        document,
        "当前无法加载预览。",
        message || "请刷新后重试，或下载原文件查看。",
      ),
    );
  }
  setPreviewStatus(root, message || "当前无法加载预览。", "error");
}

function mountFileViewer(root, buffer, filename, previewType) {
  return loadFileViewer().then((viewer) => {
    const host = clearPreviewHost(root, true);
    if (!host) {
      return null;
    }
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
      onStateChange(state, event) {
        if (!state) {
          return;
        }
        if (event && event.type === "load-complete") {
          setPreviewStatus(root, "");
          return;
        }
        if (state.error) {
          renderPreviewError(root, viewerErrorMessage(state.error));
        }
      },
    });
  });
}

async function initFileViewerPreview(root) {
  const previewRoot = root.querySelector("[data-document-preview-root]");
  if (!previewRoot) {
    return false;
  }
  const sourceUrl = String(previewRoot.dataset.previewUrl || "").trim();
  const filename = String(previewRoot.dataset.previewTitle || "").trim();
  const previewType = String(previewRoot.dataset.previewType || "").trim().toLowerCase();
  if (!sourceUrl || !filename || !previewType) {
    renderPreviewError(previewRoot, "缺少预览地址或文件信息，请刷新后重试。");
    return true;
  }
  setPreviewStatus(previewRoot, "正在加载预览，请稍候...");
  try {
    const buffer = await fetchPreviewBytes(sourceUrl);
    await mountFileViewer(previewRoot, buffer, filename, previewType);
  } catch (error) {
    renderPreviewError(previewRoot, viewerErrorMessage(error));
  }
  return true;
}

export async function initDocumentPreview(options = {}) {
  const root = options.root || document;
  await initFileViewerPreview(root);
}
