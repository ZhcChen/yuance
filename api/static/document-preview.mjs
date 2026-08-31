import { fetchPreviewBytes } from "./document-preview-crypto.mjs";

const FILE_VIEWER_IIFE_URL = "/static/vendor/file-viewer/flyfish-file-viewer-web-full.iife.js";
const previewScriptLoaders = new Map();

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
