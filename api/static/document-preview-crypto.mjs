// 附件预览专用解密模块：服务端返回密文签名 URL 与加密元数据，
// 浏览器在端侧用 WebCrypto 解密后交给预览器渲染。

const MAGIC_BYTES = new TextEncoder().encode("YUANCE-ENC-v1");
const FORMAT_VERSION = 1;
const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;
const SHA256_LENGTH = 32;
const HEADER_FIXED_LENGTH =
  MAGIC_BYTES.length + 4 + 4 + 8 + SHA256_LENGTH + 4;
const PREVIEW_FETCH_TIMEOUT_MS = 30000;

function clearWindowTimer(timerId) {
  if (!timerId) return;
  if (typeof window !== "undefined" && typeof window.clearTimeout === "function") {
    window.clearTimeout(timerId);
    return;
  }
  clearTimeout(timerId);
}

function buildFetchErrorMessage(statusCode, detail) {
  const normalized = String(detail || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  if (!normalized) {
    return "附件读取失败（HTTP " + statusCode + "），请刷新后重试。";
  }
  return "附件读取失败（HTTP " + statusCode + "）： " + normalized;
}

function ensureClientDecryptQuery(url) {
  const baseUrl =
    typeof globalThis.location !== "undefined" && globalThis.location?.href
      ? globalThis.location.href
      : "http://localhost/";
  const parsed = new URL(String(url || ""), baseUrl);
  if (parsed.searchParams.get("client_decrypt") !== "1") {
    parsed.searchParams.set("client_decrypt", "1");
  }
  return parsed.toString();
}

async function fetchWithTimeout(url, options) {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  let timeoutId = 0;
  try {
    if (controller && typeof window !== "undefined" && typeof window.setTimeout === "function") {
      timeoutId = window.setTimeout(() => {
        controller.abort();
      }, PREVIEW_FETCH_TIMEOUT_MS);
    }
    return await fetch(url, {
      ...options,
      signal: controller ? controller.signal : undefined,
    });
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error("附件读取超时，请刷新后重试。");
    }
    throw error;
  } finally {
    clearWindowTimer(timeoutId);
  }
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

function normalizeSha256(value) {
  if (!/^[0-9a-f]{64}$/u.test(String(value || ""))) {
    throw new Error("附件加密 SHA-256 校验值无效。");
  }
  return String(value).toLowerCase();
}

function bufferSource(bytes) {
  return /** @type {BufferSource} */ (bytes);
}

function bytesEqual(left, right) {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function hexFromBytes(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(bytes) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bufferSource(bytes));
  return hexFromBytes(new Uint8Array(digest));
}

function chunkAadWithSeparator(fileObjectId, chunkIndex, separator) {
  const prefix = new TextEncoder().encode("yuance-file-enc:v1:");
  const aad = new Uint8Array(prefix.byteLength + 8 + 1 + 4);
  aad.set(prefix, 0);
  const view = new DataView(aad.buffer);
  view.setBigUint64(prefix.byteLength, BigInt(fileObjectId), false);
  view.setUint8(prefix.byteLength + 8, separator);
  view.setUint32(prefix.byteLength + 9, chunkIndex, false);
  return aad;
}

function chunkAad(fileObjectId, chunkIndex) {
  return chunkAadWithSeparator(fileObjectId, chunkIndex, 0x3a);
}

function legacyChunkAad(fileObjectId, chunkIndex) {
  return chunkAadWithSeparator(fileObjectId, chunkIndex, 0);
}

function parseEncryptionHeader(ciphertext) {
  if (ciphertext.byteLength < HEADER_FIXED_LENGTH) {
    throw new Error("加密文件头无效");
  }
  const view = new DataView(
    ciphertext.buffer,
    ciphertext.byteOffset,
    ciphertext.byteLength,
  );
  let cursor = 0;
  if (!bytesEqual(ciphertext.subarray(0, MAGIC_BYTES.length), MAGIC_BYTES)) {
    throw new Error("加密文件头无效");
  }
  cursor += MAGIC_BYTES.length;
  if (view.getUint32(cursor, false) !== FORMAT_VERSION) {
    throw new Error("加密文件版本不受支持");
  }
  cursor += 4;
  const chunkSize = view.getUint32(cursor, false);
  cursor += 4;
  if (chunkSize === 0) {
    throw new Error("加密文件分块大小无效");
  }
  const plaintextByteSize = Number(view.getBigUint64(cursor, false));
  cursor += 8;
  const plaintextSha256 = hexFromBytes(ciphertext.subarray(cursor, cursor + SHA256_LENGTH));
  cursor += SHA256_LENGTH;
  const chunkCount = view.getUint32(cursor, false);
  cursor += 4;
  const noncesLength = chunkCount * NONCE_LENGTH;
  const headerLength = cursor + noncesLength;
  if (ciphertext.byteLength < headerLength) {
    throw new Error("加密文件 nonce 表不完整");
  }
  const nonces = ciphertext.subarray(cursor, headerLength);
  return Object.freeze({
    chunkSize,
    plaintextByteSize,
    plaintextSha256,
    chunkCount,
    nonces,
    headerLength,
  });
}

function chunkPlaintextLengthAt(chunkSize, plaintextByteSize, chunkIndex) {
  const offset = chunkIndex * chunkSize;
  if (offset >= plaintextByteSize) return 0;
  return Math.min(plaintextByteSize - offset, chunkSize);
}

function importAesGcmKey(keyBytes) {
  if (keyBytes.byteLength !== 32) {
    throw new Error("文件数据密钥长度无效");
  }
  return globalThis.crypto.subtle.importKey(
    "raw",
    bufferSource(keyBytes),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

function decryptChunk(key, nonce, aad, ciphertextWithTag) {
  return globalThis.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: bufferSource(nonce),
      additionalData: bufferSource(aad),
    },
    key,
    bufferSource(ciphertextWithTag),
  );
}

async function decryptFile(dataKey, fileObjectId, ciphertext) {
  const header = parseEncryptionHeader(ciphertext);
  const key = await importAesGcmKey(dataKey);
  const chunks = [];
  let bodyOffset = header.headerLength;
  for (let chunkIndex = 0; chunkIndex < header.chunkCount; chunkIndex += 1) {
    const chunkPlaintextLength = chunkPlaintextLengthAt(
      header.chunkSize,
      header.plaintextByteSize,
      chunkIndex,
    );
    const chunk = ciphertext.subarray(
      bodyOffset,
      bodyOffset + chunkPlaintextLength + TAG_LENGTH,
    );
    const nonce = header.nonces.subarray(
      chunkIndex * NONCE_LENGTH,
      (chunkIndex + 1) * NONCE_LENGTH,
    );
    try {
      chunks.push(
        new Uint8Array(
          await decryptChunk(
            key,
            nonce,
            chunkAad(fileObjectId, chunkIndex),
            chunk,
          ),
        ),
      );
    } catch {
      try {
        chunks.push(
          new Uint8Array(
            await decryptChunk(
              key,
              nonce,
              legacyChunkAad(fileObjectId, chunkIndex),
              chunk,
            ),
          ),
        );
      } catch {
        throw new Error("加密文件分块解密失败或数据被篡改");
      }
    }
    bodyOffset += chunk.byteLength;
  }
  const plaintext = concatBytes(chunks);
  const actualSha256 = await sha256Hex(plaintext);
  if (actualSha256 !== header.plaintextSha256) {
    throw new Error("加密文件明文校验值不匹配");
  }
  return plaintext;
}

function concatBytes(parts) {
  const length = parts.reduce((total, part) => total + part.byteLength, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

async function decryptEncryptedPreviewPayload(payload) {
  const encryption = payload && typeof payload === "object" ? payload.encryption : null;
  const url = payload && typeof payload.url === "string" ? payload.url : "";
  if (!url || !encryption || typeof encryption.key !== "string" || !encryption.file_object_id) {
    throw new Error("附件加密预览信息不完整。");
  }
  const baseUrl =
    typeof globalThis.location !== "undefined" && globalThis.location?.href
      ? globalThis.location.href
      : "http://localhost/";
  const target = new URL(url, baseUrl);
  const response = await fetchWithTimeout(target.toString(), {
    credentials: target.origin === new URL(baseUrl).origin ? "same-origin" : "omit",
    cache: "no-store",
    redirect: "follow",
    headers: { Accept: "application/octet-stream,*/*;q=0.1" },
  });
  if (!response.ok) {
    throw new Error("加密附件读取失败（HTTP " + response.status + "）。");
  }
  const ciphertext = new Uint8Array(await response.arrayBuffer());
  if (!ciphertext || ciphertext.byteLength === 0) {
    throw new Error("加密附件内容为空，当前无法预览。");
  }
  if (Number(encryption.encrypted_byte_size) > 0 && ciphertext.byteLength !== Number(encryption.encrypted_byte_size)) {
    throw new Error("加密文件大小与登记不一致。");
  }
  if (
    encryption.encrypted_checksum_sha256 &&
    (await sha256Hex(ciphertext)) !== normalizeSha256(encryption.encrypted_checksum_sha256)
  ) {
    throw new Error("加密文件校验值不匹配。");
  }
  const plaintext = await decryptFile(
    decodeBase64(encryption.key),
    Number(encryption.file_object_id),
    ciphertext,
  );
  return plaintext.buffer.slice(plaintext.byteOffset, plaintext.byteOffset + plaintext.byteLength);
}

/**
 * 读取预览内容。服务端返回加密元数据 JSON 时先下载密文并在端侧解密；
 * 未加密内容保持原来的二进制返回。
 * @param {string} sourceUrl
 * @returns {Promise<ArrayBuffer>}
 */
export async function fetchPreviewBytes(sourceUrl) {
  const response = await fetchWithTimeout(ensureClientDecryptQuery(sourceUrl), {
    credentials: "same-origin",
    cache: "no-store",
    redirect: "follow",
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
    throw new Error(buildFetchErrorMessage(response.status, detail));
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
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
