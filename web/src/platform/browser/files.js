// @ts-check

import {
  defineDownloadCapabilities,
  defineFileCapabilities,
  defineTransferCapabilities,
} from '@yuance/frontend-platform-contract';

const CONTENT_TYPES_BY_EXTENSION = new Map([
  ['.avif', 'image/avif'],
  ['.bmp', 'image/bmp'],
  ['.gif', 'image/gif'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
]);

const GENERIC_CONTENT_TYPES = new Set(['', 'application/octet-stream']);
/** @typedef {import('@yuance/frontend-platform-contract').FileCapability} FileCapability */
/** @typedef {import('@yuance/frontend-platform-contract').PastedFile} PastedFile */
/** @typedef {import('@yuance/frontend-platform-contract').SelectedFile} SelectedFile */
/** @typedef {import('@yuance/frontend-platform-contract').SignedTransferCapability} SignedTransferCapability */
/** @typedef {{ file: File, contentType: string }} BrowserFileEntry */

/**
 * @typedef {object} SignedObjectRequest
 * @property {string} method
 * @property {string} url
 * @property {ReadonlyArray<[string, string]>} headers
 */

/**
 * @param {{
 *   refreshCsrfToken: () => Promise<string>,
 *   chooseFile?: () => Promise<File | null>,
 *   fetchImpl?: typeof fetch,
 *   baseUrl?: string,
 *   origin?: string,
 *   allowedTransferOrigins?: string[],
 *   openDownload?: (url: string) => void,
 *   now?: () => number,
 * }} dependencies
 */
export function createBrowserFilePlatform({
  refreshCsrfToken,
  chooseFile = chooseFileFromDocument,
  fetchImpl = globalThis.fetch,
  baseUrl = globalThis.location?.href || 'http://localhost/',
  origin = globalThis.location?.origin || new URL(baseUrl).origin,
  allowedTransferOrigins = [],
  openDownload = openDownloadInDocument,
  now = Date.now,
}) {
  const filesByCapability = new WeakMap();
  const requestsByCapability = new WeakMap();

  /**
   * @param {PastedFile} file
   * @param {string} [checksumSha256]
   * @param {Uint8Array} [bytes]
   * @returns {SelectedFile}
   */
  function selectFile(file, checksumSha256, bytes) {
    const capability = /** @type {FileCapability} */ ({});
    const contentType = resolveContentType(file.type, file.name, bytes);
    filesByCapability.set(capability, /** @type {BrowserFileEntry} */ ({ file, contentType }));
    return {
      capability,
      filename: file.name || 'attachment.bin',
      contentType,
      byteSize: file.size,
      ...(checksumSha256 ? { checksumSha256 } : {}),
    };
  }

  /** @param {PastedFile} file @returns {Promise<SelectedFile | null>} */
  async function selectPastedFile(file) {
    if (!file || typeof file.arrayBuffer !== 'function') {
      throw new Error('剪贴板文件无效。');
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const checksumSha256 = Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes)), (byte) => byte.toString(16).padStart(2, '0')).join('');
    return selectFile(file, checksumSha256, bytes);
  }

  const transfers = defineTransferCapabilities({
    authorizeSignedRequest(rawRequest) {
      const authorization = normalizeTransferAuthorization(rawRequest, {
        baseUrl,
        origin,
        allowedTransferOrigins,
        now: now(),
      });
      const capability = /** @type {SignedTransferCapability} */ ({});
      requestsByCapability.set(capability, authorization);
      return capability;
    },
  });

  const files = defineFileCapabilities({
    async chooseFile() {
      const file = await chooseFile();
      if (!file) return null;
      return selectPastedFile(file);
    },
    async uploadSignedRequest(transferCapability, fileCapability) {
      const authorization = consumeTransferCapability(requestsByCapability, transferCapability, 'upload', now());
      const entry = filesByCapability.get(fileCapability);
      filesByCapability.delete(fileCapability);
      if (!entry) {
        throw new Error('上传 capability 无效或已不属于当前 Browser adapter。');
      }
      const { request } = authorization;
      const headers = filteredHeaders(request.headers);
      if (!headers.has('content-type') && entry.contentType) {
        headers.set('content-type', entry.contentType);
      }
      const url = new URL(request.url, baseUrl);
      if (url.origin === origin && !['GET', 'HEAD'].includes(request.method) && !headers.has('x-yuance-csrf-token')) {
        const token = await refreshCsrfToken();
        if (token) {
          headers.set('x-yuance-csrf-token', token);
        }
      }
      const response = await fetchImpl(url, {
        method: request.method,
        headers,
        body: entry.file,
        credentials: url.origin === origin ? 'same-origin' : 'omit',
      });
      if (!response.ok) {
        throw new Error(`对象存储上传失败：${response.status}`);
      }
    },
  });

  const downloads = defineDownloadCapabilities({
    async downloadSignedRequest(transferCapability) {
      const { request } = consumeTransferCapability(requestsByCapability, transferCapability, 'download', now());
      if (request.headers.length > 0) {
        throw new Error('当前下载签名包含浏览器无法附带的请求头。');
      }
      openDownload(new URL(request.url, baseUrl).toString());
    },
  });

  return { files, downloads, transfers, selectFile, selectPastedFile };
}

/** @param {string} filename @returns {string | undefined} */
function contentTypeForFilename(filename) {
  const extension = filename.match(/\.([^.]+)$/u)?.[1]?.toLowerCase();
  return extension ? CONTENT_TYPES_BY_EXTENSION.get(`.${extension}`) : undefined;
}

/** @param {Uint8Array | undefined} bytes @returns {string | undefined} */
function contentTypeForBytes(bytes) {
  if (!bytes || bytes.length < 12) return undefined;
  const head = bytes.subarray(0, 12);
  if (
    head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47
    && head[4] === 0x0d && head[5] === 0x0a && head[6] === 0x1a && head[7] === 0x0a
  ) return 'image/png';
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
  if (head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x38
    && (head[4] === 0x37 || head[4] === 0x39) && head[5] === 0x61) return 'image/gif';
  if (head[0] === 0x42 && head[1] === 0x4d) return 'image/bmp';
  if (head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46
    && head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50) return 'image/webp';
  if (head[0] === 0x00 && head[1] === 0x00 && head[2] === 0x01 && head[3] === 0x00) return 'image/x-icon';
  if (head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70) {
    const brand = String.fromCharCode(head[8], head[9], head[10], head[11]);
    if (brand === 'avif' || brand === 'avis') return 'image/avif';
  }
  return undefined;
}

/**
 * @param {string} contentType
 * @param {string} filename
 * @param {Uint8Array} [bytes]
 * @returns {string}
 */
function resolveContentType(contentType, filename, bytes) {
  const normalized = baseContentType(contentType);
  if (normalized && !GENERIC_CONTENT_TYPES.has(normalized)) return normalized;
  return contentTypeForFilename(filename)
    || contentTypeForBytes(bytes)
    || normalized
    || 'application/octet-stream';
}

/** @param {string} contentType @returns {string} */
function baseContentType(contentType) {
  return contentType.split(';', 1)[0].trim().toLowerCase();
}

function chooseFileFromDocument() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.hidden = true;
    const finish = () => {
      window.removeEventListener('focus', onFocus);
      input.remove();
      resolve(input.files?.[0] || null);
    };
    const onFocus = () => setTimeout(() => { if (!input.files?.length) finish(); }, 0);
    input.addEventListener('change', finish, { once: true });
    window.addEventListener('focus', onFocus, { once: true });
    document.body.append(input);
    input.click();
  });
}

/**
 * @typedef {object} TransferAuthorization
 * @property {SignedObjectRequest} request
 * @property {'upload' | 'download'} purpose
 * @property {number} expiresAt
 */

/**
 * @param {unknown} rawAuthorization
 * @param {{ baseUrl: string, origin: string, allowedTransferOrigins: string[], now: number }} context
 * @returns {TransferAuthorization}
 */
function normalizeTransferAuthorization(rawAuthorization, context) {
  if (!rawAuthorization || typeof rawAuthorization !== 'object') {
    throw new Error('签名请求格式无效。');
  }
  const envelope = /** @type {{ request?: unknown, purpose?: unknown, expiresInSeconds?: unknown }} */ (rawAuthorization);
  if (envelope.purpose !== 'upload' && envelope.purpose !== 'download') {
    throw new Error('签名请求缺少有效用途。');
  }
  const expiresInSeconds = Number(envelope.expiresInSeconds);
  if (!Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0 || expiresInSeconds > 86400) {
    throw new Error('签名请求有效期无效。');
  }
  const request = normalizeSignedRequest(envelope.request, context.baseUrl);
  if (request.method !== (envelope.purpose === 'upload' ? 'PUT' : 'GET')) {
    throw new Error('签名请求方法与用途不匹配。');
  }
  const url = new URL(request.url);
  const allowedOrigins = new Set([context.origin, ...context.allowedTransferOrigins]);
  const storageScope = parseAliyunOssScope(url);
  if (!allowedOrigins.has(url.origin) && !storageScope) {
    throw new Error('签名请求目标不在 Browser transfer allowlist 中。');
  }
  validateSignedHeaders(request.headers);
  return Object.freeze({
    request,
    purpose: envelope.purpose,
    expiresAt: context.now + expiresInSeconds * 1000,
    storageOrigin: url.origin,
    storageBucket: storageScope?.bucket || null,
    storageEndpoint: storageScope?.endpoint || null,
  });
}

/** @param {URL} url */
function parseAliyunOssScope(url) {
  if (url.protocol !== 'https:') return null;
  const match = url.hostname.match(/^([a-z0-9][a-z0-9-]{1,61}[a-z0-9])\.(oss-[a-z0-9-]+\.aliyuncs\.com)$/);
  if (!match) return null;
  return { bucket: match[1], endpoint: match[2] };
}

/** @param {unknown} rawRequest @param {string} baseUrl @returns {SignedObjectRequest} */
function normalizeSignedRequest(rawRequest, baseUrl) {
  if (!rawRequest || typeof rawRequest !== 'object') {
    throw new Error('签名请求格式无效。');
  }
  const raw = /** @type {{ method?: unknown, url?: unknown, headers?: unknown }} */ (rawRequest);
  if (typeof raw.url !== 'string' || !raw.url.trim()) {
    throw new Error('签名请求缺少目标地址。');
  }
  const url = new URL(raw.url, baseUrl);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('签名请求协议不受支持。');
  }
  const method = typeof raw.method === 'string' ? raw.method.toUpperCase() : 'GET';
  if (!['GET', 'PUT'].includes(method)) {
    throw new Error('签名请求方法不受支持。');
  }
  if (!Array.isArray(raw.headers)) {
    throw new Error('签名请求头格式无效。');
  }
  const headers = raw.headers.map((pair) => {
    if (!Array.isArray(pair) || pair.length !== 2) {
      throw new Error('签名请求头格式无效。');
    }
    return /** @type {[string, string]} */ ([String(pair[0]), String(pair[1])]);
  });
  return Object.freeze({ method, url: url.toString(), headers: Object.freeze(headers) });
}

/** @param {ReadonlyArray<[string, string]>} headers */
function validateSignedHeaders(headers) {
  for (const [key] of headers) {
    const normalized = key.toLowerCase();
    if (!['content-type', 'content-md5', 'content-length'].includes(normalized)
      && !normalized.startsWith('x-oss-')
      && !['x-amz-checksum-sha256', 'x-amz-content-sha256'].includes(normalized)) {
      throw new Error(`签名请求头不受支持：${key}`);
    }
  }
}

/**
 * @param {WeakMap<object, TransferAuthorization>} capabilities
 * @param {SignedTransferCapability} capability
 * @param {'upload' | 'download'} purpose
 * @param {number} now
 */
function consumeTransferCapability(capabilities, capability, purpose, now) {
  const authorization = capabilities.get(capability);
  capabilities.delete(capability);
  if (!authorization) {
    throw new Error(`${purpose === 'upload' ? '上传' : '下载'} capability 无效或已消费。`);
  }
  if (authorization.purpose !== purpose) {
    throw new Error('传输 capability 用途不匹配。');
  }
  if (authorization.expiresAt <= now) {
    throw new Error('传输 capability 已过期。');
  }
  return authorization;
}

/** @param {ReadonlyArray<[string, string]>} pairs */
function filteredHeaders(pairs) {
  const headers = new Headers();
  for (const [key, value] of pairs) {
    const normalizedKey = key.toLowerCase();
    if (!key || normalizedKey === 'host' || normalizedKey === 'content-length') {
      continue;
    }
    headers.set(key, value);
  }
  return headers;
}

/** @param {string} url */
function openDownloadInDocument(url) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}
