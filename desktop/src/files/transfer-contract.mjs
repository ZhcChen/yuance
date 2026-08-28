import { isLoopbackHostname } from "../auth/profile.mjs";
import {
  FILE_CHUNK_SIZE,
  FILE_ENCRYPTION_FORMAT,
  encryptedTotalSize,
} from "./file-crypto.mjs";

const MAX_URL_LENGTH = 8 * 1024;
const MAX_HEADER_VALUE_LENGTH = 4 * 1024;
const MAX_TRANSFER_BYTES = 128 * 1024 * 1024;
const MAX_TTL_SECONDS = 60;
const MAX_CLOCK_SKEW_MS = 5_000;
const CONTRACT_KEYS = ["content_type", "expected_bytes", "expires_at", "expires_in_seconds", "purpose", "request", "schema_version", "sha256"];
const OPTIONAL_CONTRACT_KEYS = ["encryption"];
const REQUEST_KEYS = ["headers", "method", "url"];
const METHODS = Object.freeze({ upload: "PUT", download: "GET" });
const ALLOWED_HEADERS = Object.freeze({
  upload: new Set(["content-length", "content-md5", "content-type", "x-amz-checksum-sha256", "x-amz-content-sha256", "x-oss-content-sha256", "x-oss-forbid-overwrite"]),
  download: new Set(),
});

export function parseTransferContract(value, {
  apiOrigin,
  expectedPurpose,
  now = Date.now,
  allowLoopbackHttp = false,
  allowedRelativePath,
} = {}) {
  if (!isPlainObject(value) || !hasContractKeys(value)) throw contractError();
  if (value.schema_version !== 1 || !Object.hasOwn(METHODS, value.purpose) || value.purpose !== expectedPurpose) throw contractError();
  if (!isPlainObject(value.request) || !sameKeys(value.request, REQUEST_KEYS) || value.request.method !== METHODS[value.purpose]) throw contractError();
  const trustedApiOrigin = parseApiOrigin(apiOrigin, allowLoopbackHttp);
  const url = parseRequestUrl(value.request.url, value.purpose, trustedApiOrigin, allowLoopbackHttp, allowedRelativePath);
  const headers = parseHeaders(value.request.headers, value.purpose);
  const declaredExpectedBytes = requireInteger(value.expected_bytes, 0, MAX_TRANSFER_BYTES);
  const encryption = value.encryption === undefined ? null : parseEncryption(value.encryption, value.purpose);
  const expectedBytes = encryption === null
    ? declaredExpectedBytes
    : value.purpose === "upload"
      ? encryptedTotalSize(encryption.plaintextByteSize)
      : encryption.encryptedByteSize;
  if (declaredExpectedBytes !== expectedBytes) throw contractError();
  const contentType = encryption === null ? parseContentType(value.content_type) : parseContentType("application/octet-stream");
  if (encryption !== null && value.content_type !== "application/octet-stream") throw contractError();
  const headerMap = new Map(headers);
  if (value.purpose === "upload" && headerMap.get("content-type") !== contentType) throw contractError();
  if (headerMap.has("content-length") && headerMap.get("content-length") !== String(expectedBytes)) throw contractError();
  if (typeof value.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(value.sha256)) throw contractError();
  const sha256 = value.sha256;
  const ttlSeconds = requireInteger(value.expires_in_seconds, 1, MAX_TTL_SECONDS);
  const currentTime = now();
  if (typeof value.expires_at !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value.expires_at)) throw contractError();
  const serverExpiresAt = Date.parse(value.expires_at);
  if (!Number.isFinite(currentTime) || !Number.isFinite(serverExpiresAt) || serverExpiresAt <= currentTime || serverExpiresAt > currentTime + MAX_TTL_SECONDS * 1_000 + MAX_CLOCK_SKEW_MS) throw contractError();
  const expiresAt = Math.min(serverExpiresAt, currentTime + ttlSeconds * 1_000);
  return Object.freeze({
    version: 1,
    purpose: value.purpose,
    method: value.request.method,
    url: url.href,
    origin: url.origin,
    headers,
    expectedBytes,
    contentType,
    sha256,
    expiresAt,
    ...(encryption === null ? {} : { encryption }),
  });
}

function parseEncryption(value, purpose) {
  if (!isPlainObject(value)) throw contractError();
  const keys = Object.keys(value).sort();
  const expected = ["algorithm", "chunk_size", "encrypted_byte_size", "encrypted_checksum_sha256", "file_object_id", "format", "key", "plaintext_byte_size", "plaintext_sha256"].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) throw contractError();
  if (value.algorithm !== "AES-256-GCM" || value.format !== FILE_ENCRYPTION_FORMAT) throw contractError();
  if (!Number.isSafeInteger(value.chunk_size) || value.chunk_size !== FILE_CHUNK_SIZE) throw contractError();
  if (!Number.isSafeInteger(value.file_object_id) || value.file_object_id < 1) throw contractError();
  if (typeof value.key !== "string" || value.key.length === 0) throw contractError();
  const key = Buffer.from(value.key, "base64");
  if (key.length !== 32) throw contractError();
  const plaintextByteSize = requireInteger(value.plaintext_byte_size, 0, MAX_TRANSFER_BYTES);
  if (typeof value.plaintext_sha256 !== "string" || !/^[0-9a-f]{64}$/.test(value.plaintext_sha256)) throw contractError();
  const declaredEncryptedSize = requireInteger(value.encrypted_byte_size, 0, MAX_TRANSFER_BYTES);
  const encryptedByteSize = purpose === "upload" ? encryptedTotalSize(plaintextByteSize) : declaredEncryptedSize;
  if (purpose === "download" && declaredEncryptedSize <= 0) throw contractError();
  if (typeof value.encrypted_checksum_sha256 !== "string" || (purpose === "download" && !/^[0-9a-f]{64}$/.test(value.encrypted_checksum_sha256))) throw contractError();
  return Object.freeze({
    format: value.format,
    algorithm: value.algorithm,
    chunkSize: value.chunk_size,
    key,
    fileObjectId: value.file_object_id,
    plaintextByteSize,
    plaintextSha256: value.plaintext_sha256,
    encryptedByteSize,
    encryptedChecksumSha256: value.encrypted_checksum_sha256,
  });
}

function parseApiOrigin(value, allowLoopbackHttp) {
  if (typeof value !== "string") throw new TypeError("apiOrigin is required");
  let parsed;
  try { parsed = new URL(value); } catch { throw new TypeError("apiOrigin is invalid"); }
  if (parsed.origin !== value || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) throw new TypeError("apiOrigin is invalid");
  if (parsed.protocol !== "https:" && !(allowLoopbackHttp && parsed.protocol === "http:" && isLoopbackHostname(parsed.hostname))) throw new TypeError("apiOrigin is invalid");
  return parsed.origin;
}

function parseRequestUrl(value, purpose, apiOrigin, allowLoopbackHttp, allowedRelativePath) {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_URL_LENGTH || !/^[\x21-\x7e]+$/.test(value) || value.includes("\\")) throw contractError();
  const relative = value.startsWith("/");
  let parsed;
  try { parsed = new URL(value, apiOrigin); } catch { throw contractError(); }
  if (parsed.username || parsed.password || parsed.hash) throw contractError();
  if (relative) {
    const expectedPath = allowedRelativePath ?? `/api/v1/device-file-transfer/canary/${purpose}`;
    if (typeof expectedPath !== "string" || !/^\/api\/v1\/[a-z0-9/-]+$/u.test(expectedPath)) throw new TypeError("allowedRelativePath is invalid");
    if (parsed.origin !== apiOrigin || parsed.pathname !== expectedPath || !value.startsWith(`${expectedPath}?`) || parsed.search.length < 2) throw contractError();
  } else {
    if (parsed.protocol !== "https:" && !(allowLoopbackHttp && parsed.protocol === "http:" && isLoopbackHostname(parsed.hostname) && parsed.origin === apiOrigin)) throw contractError();
    if (!/^[A-Za-z0-9.-]+$/.test(parsed.hostname) && !/^\[[0-9a-f:]+\]$/i.test(parsed.hostname)) throw contractError();
    if (parsed.href !== value) throw contractError();
  }
  return parsed;
}

function parseHeaders(value, purpose) {
  if (!Array.isArray(value) || value.length > 16) throw contractError();
  const seen = new Set();
  const headers = value.map((entry) => {
    if (!Array.isArray(entry) || entry.length !== 2) throw contractError();
    const [name, headerValue] = entry;
    if (typeof name !== "string" || !/^[a-z0-9][a-z0-9-]{0,127}$/.test(name) || !ALLOWED_HEADERS[purpose].has(name) || seen.has(name)) throw contractError();
    if (typeof headerValue !== "string" || headerValue.length === 0 || headerValue.length > MAX_HEADER_VALUE_LENGTH || headerValue.trim() !== headerValue || /[\u0000-\u001f\u007f]/.test(headerValue)) throw contractError();
    seen.add(name);
    return Object.freeze([name, headerValue]);
  });
  return Object.freeze(headers);
}

function parseContentType(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 255 || /[\u0000-\u001f\u007f]/.test(value) || !/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*(?:; [a-z0-9!#$&^_.+-]+=[a-z0-9!#$&^_.+\-]+)*$/i.test(value)) throw contractError();
  return value;
}

function requireInteger(value, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw contractError();
  return value;
}

function isPlainObject(value) { return value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype; }
function sameKeys(value, expected) {
  const keys = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return keys.length === sortedExpected.length && keys.every((key, index) => key === sortedExpected[index]);
}
function hasContractKeys(value) {
  const keys = Object.keys(value);
  const allowed = new Set([...CONTRACT_KEYS, ...OPTIONAL_CONTRACT_KEYS]);
  return keys.every((key) => allowed.has(key)) && CONTRACT_KEYS.every((key) => keys.includes(key));
}
function contractError() { return Object.assign(new Error("Transfer request is invalid"), { code: "file_transfer_contract_invalid" }); }
