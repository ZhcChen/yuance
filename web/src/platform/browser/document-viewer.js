// @ts-check

import { decryptFile, sha256Hex } from './file-crypto.js';

const FILE_VIEWER_IIFE_URL = "/static/vendor/file-viewer/flyfish-file-viewer-web-full.iife.js";
const PREVIEW_FETCH_TIMEOUT_MS = 30000;
const scriptLoaders = new Map();

const CONTENT_TYPES_BY_EXTENSION = new Map([
  ['bmp', 'image/bmp'],
  ['gif', 'image/gif'],
  ['ico', 'image/x-icon'],
  ['jpeg', 'image/jpeg'],
  ['jpg', 'image/jpeg'],
  ['png', 'image/png'],
  ['svg', 'image/svg+xml'],
  ['webp', 'image/webp'],
  ['mp4', 'video/mp4'],
  ['webm', 'video/webm'],
  ['txt', 'text/plain;charset=utf-8'],
  ['md', 'text/plain;charset=utf-8'],
  ['log', 'text/plain;charset=utf-8'],
  ['json', 'application/json;charset=utf-8'],
  ['xml', 'text/xml;charset=utf-8'],
  ['html', 'text/html;charset=utf-8'],
  ['csv', 'text/csv;charset=utf-8'],
]);

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

function decodeBase64(value) {
  let binary;
  try {
    binary = globalThis.atob(value);
  } catch {
    throw new Error("附件加密密钥格式无效。");
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function ensureClientDecryptQuery(url) {
  const baseUrl = typeof globalThis.location !== "undefined" && globalThis.location?.href
    ? globalThis.location.href
    : "http://localhost/";
  const parsed = new URL(String(url || ""), baseUrl);
  if (parsed.searchParams.get("client_decrypt") !== "1") {
    parsed.searchParams.set("client_decrypt", "1");
  }
  return parsed.toString();
}

function contentTypeForPreview(filename, contentType) {
  const knownType = String(contentType || "").trim();
  if (knownType && knownType !== "application/octet-stream") {
    return knownType;
  }
  const extension = String(filename || "").trim().toLowerCase().match(/\.([^.]+)$/u)?.[1] || "";
  return CONTENT_TYPES_BY_EXTENSION.get(extension) || "application/octet-stream";
}

async function fetchCiphertext(url, baseUrl) {
  const target = new URL(String(url || ""), baseUrl);
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  let timeoutId = 0;
  try {
    if (controller && typeof window !== "undefined" && typeof window.setTimeout === "function") {
      timeoutId = window.setTimeout(() => {
        controller.abort();
      }, PREVIEW_FETCH_TIMEOUT_MS);
    }
    const response = await fetch(target.toString(), {
      credentials: target.origin === new URL(baseUrl).origin ? "same-origin" : "omit",
      cache: "no-store",
      redirect: "follow",
      signal: controller ? controller.signal : undefined,
      headers: { Accept: "application/octet-stream,*/*;q=0.1" },
    });
    if (!response.ok) {
      throw new Error(`加密附件读取失败（HTTP ${response.status}）。`);
    }
    const ciphertext = new Uint8Array(await response.arrayBuffer());
    if (!ciphertext || ciphertext.byteLength === 0) {
      throw new Error("加密附件内容为空，当前无法预览。");
    }
    return ciphertext;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("加密附件读取超时，请刷新后重试。");
    }
    throw error;
  } finally {
    clearWindowTimer(timeoutId);
  }
}

function normalizeSha256(value) {
  if (!/^[0-9a-f]{64}$/u.test(String(value || ""))) {
    throw new Error("附件加密 SHA-256 校验值无效。");
  }
  return String(value).toLowerCase();
}

async function decryptEncryptedPreviewPayload(payload) {
  const encryption = payload && typeof payload === "object" ? payload.encryption : null;
  const url = payload && typeof payload.url === "string" ? payload.url : "";
  if (!url || !encryption || typeof encryption.key !== "string" || !encryption.file_object_id) {
    throw new Error("附件加密预览信息不完整。");
  }
  const baseUrl = typeof globalThis.location !== "undefined" && globalThis.location?.href
    ? globalThis.location.href
    : "http://localhost/";
  const ciphertext = await fetchCiphertext(url, baseUrl);
  if (Number(encryption.encrypted_byte_size) > 0 && ciphertext.byteLength !== Number(encryption.encrypted_byte_size)) {
    throw new Error("加密文件大小与登记不一致。");
  }
  if (encryption.encrypted_checksum_sha256 && (await sha256Hex(ciphertext)) !== normalizeSha256(encryption.encrypted_checksum_sha256)) {
    throw new Error("加密文件校验值不匹配。");
  }
  return decryptFile(
    decodeBase64(encryption.key),
    Number(encryption.file_object_id),
    ciphertext,
  );
}

function toArrayBuffer(bytes) {
  if (bytes instanceof ArrayBuffer) {
    return bytes;
  }
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
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
    const response = await fetch(ensureClientDecryptQuery(sourceUrl), {
      credentials: "same-origin",
      cache: "no-store",
      redirect: "follow",
      signal: controller ? controller.signal : undefined,
      headers: {
        Accept: "application/json,application/octet-stream,*/*;q=0.1",
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
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      let payload;
      try {
        payload = await response.json();
      } catch {
        throw new Error("附件加密预览信息格式无效。");
      }
      return decryptEncryptedPreviewPayload(payload);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes || bytes.byteLength === 0) {
      throw new Error("附件内容为空，当前无法预览。");
    }
    return bytes;
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
  const bytes = await fetchPreviewBytes(source);
  const viewer = await loadFileViewer();
  const type = viewerTypeFor(previewType, filename);
  return viewer.mountViewer(host, {
    buffer: toArrayBuffer(bytes),
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

/**
 * 解析协议 URL 为可直接渲染的 Blob URL（未加密内容同样转 Blob）。
 * @param {string} source
 * @param {{ filename?: string, contentType?: string }} [options]
 * @returns {Promise<string>}
 */
export async function resolveBrowserPreviewSource(source, options = {}) {
  const bytes = await fetchPreviewBytes(source);
  const blob = new Blob([toArrayBuffer(bytes)], {
    type: contentTypeForPreview(options.filename, options.contentType),
  });
  return URL.createObjectURL(blob);
}
