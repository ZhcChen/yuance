// @ts-check

export const FILE_CHUNK_SIZE = 1024 * 1024;
export const FILE_ENCRYPTION_FORMAT = 'YUANCE-ENC-v1';

const MAGIC_BYTES = new TextEncoder().encode('YUANCE-ENC-v1');
const FORMAT_VERSION = 1;
const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;
const SHA256_LENGTH = 32;
const HEADER_FIXED_LENGTH =
  MAGIC_BYTES.length + 4 + 4 + 8 + SHA256_LENGTH + 4;

/** @typedef {{ chunkSize: number, plaintextByteSize: number, plaintextSha256: string, chunkCount: number, nonces: Uint8Array, headerLength: number }} EncryptionHeader */

/**
 * 按服务端 `YUANCE-ENC-v1` 格式加密完整文件。
 * @param {Uint8Array} dataKey
 * @param {number} fileObjectId
 * @param {Uint8Array} plaintext
 * @returns {Promise<Uint8Array>}
 */
export async function encryptFile(dataKey, fileObjectId, plaintext) {
  const chunkCount = Math.ceil(plaintext.byteLength / FILE_CHUNK_SIZE);
  const nonces = new Uint8Array(chunkCount * NONCE_LENGTH);
  globalThis.crypto.getRandomValues(nonces);
  const header = await buildHeader(plaintext, nonces);
  const bodyLength = encryptedBodyLength(plaintext.byteLength, chunkCount);
  const ciphertext = new Uint8Array(header.length + bodyLength);
  ciphertext.set(header, 0);

  const key = await importAesGcmKey(dataKey);
  let bodyOffset = 0;
  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
    const start = chunkIndex * FILE_CHUNK_SIZE;
    const chunk = plaintext.subarray(start, start + FILE_CHUNK_SIZE);
    const nonce = nonces.subarray(
      chunkIndex * NONCE_LENGTH,
      (chunkIndex + 1) * NONCE_LENGTH,
    );
    const encrypted = await encryptChunk(
      key,
      nonce,
      chunkAad(fileObjectId, chunkIndex),
      chunk,
    );
    const encryptedBytes = new Uint8Array(encrypted);
    ciphertext.set(encryptedBytes, header.length + bodyOffset);
    bodyOffset += encryptedBytes.byteLength;
  }
  return ciphertext;
}

/**
 * 解密完整密文并校验明文 SHA-256。
 * @param {Uint8Array} dataKey
 * @param {number} fileObjectId
 * @param {Uint8Array} ciphertext
 * @returns {Promise<Uint8Array>}
 */
export async function decryptFile(dataKey, fileObjectId, ciphertext) {
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
        throw new Error('加密文件分块解密失败或数据被篡改');
      }
    }
    bodyOffset += chunk.byteLength;
  }

  const plaintext = concatBytes(chunks);
  const actualSha256 = await sha256Hex(plaintext);
  if (actualSha256 !== header.plaintextSha256) {
    throw new Error('加密文件明文校验值不匹配');
  }
  return plaintext;
}

/**
 * @param {Uint8Array} ciphertext
 * @returns {EncryptionHeader}
 */
export function parseEncryptionHeader(ciphertext) {
  if (ciphertext.byteLength < HEADER_FIXED_LENGTH) {
    throw new Error('加密文件头无效');
  }
  const view = new DataView(
    ciphertext.buffer,
    ciphertext.byteOffset,
    ciphertext.byteLength,
  );
  let cursor = 0;
  if (!bytesEqual(ciphertext.subarray(0, MAGIC_BYTES.length), MAGIC_BYTES)) {
    throw new Error('加密文件头无效');
  }
  cursor += MAGIC_BYTES.length;
  if (view.getUint32(cursor, false) !== FORMAT_VERSION) {
    throw new Error('加密文件版本不受支持');
  }
  cursor += 4;
  const chunkSize = view.getUint32(cursor, false);
  cursor += 4;
  if (chunkSize === 0) {
    throw new Error('加密文件分块大小无效');
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
    throw new Error('加密文件 nonce 表不完整');
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

/** @param {Uint8Array} bytes @returns {Promise<string>} */
export async function sha256Hex(bytes) {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    bufferSource(bytes),
  );
  return hexFromBytes(new Uint8Array(digest));
}

/** @param {Uint8Array} plaintext @param {Uint8Array} nonces @returns {Promise<Uint8Array>} */
async function buildHeader(plaintext, nonces) {
  const header = new Uint8Array(
    HEADER_FIXED_LENGTH + nonces.byteLength,
  );
  const view = new DataView(header.buffer);
  let cursor = 0;
  header.set(MAGIC_BYTES, 0);
  cursor += MAGIC_BYTES.length;
  view.setUint32(cursor, FORMAT_VERSION, false);
  cursor += 4;
  view.setUint32(cursor, FILE_CHUNK_SIZE, false);
  cursor += 4;
  view.setBigUint64(cursor, BigInt(plaintext.byteLength), false);
  cursor += 8;
  const plaintextSha256 = new Uint8Array(
    await globalThis.crypto.subtle.digest(
      'SHA-256',
      bufferSource(plaintext),
    ),
  );
  header.set(plaintextSha256, cursor);
  cursor += SHA256_LENGTH;
  view.setUint32(cursor, nonces.byteLength / NONCE_LENGTH, false);
  cursor += 4;
  header.set(nonces, cursor);
  return header;
}

/** @param {number} plaintextLength @param {number} chunkCount @returns {number} */
function encryptedBodyLength(plaintextLength, chunkCount) {
  if (chunkCount === 0) return 0;
  const lastChunkLength =
    plaintextLength - (chunkCount - 1) * FILE_CHUNK_SIZE;
  return (
    (chunkCount - 1) * (FILE_CHUNK_SIZE + TAG_LENGTH) +
    lastChunkLength +
    TAG_LENGTH
  );
}

/**
 * @param {number} chunkSize
 * @param {number} plaintextByteSize
 * @param {number} chunkIndex
 * @returns {number}
 */
function chunkPlaintextLengthAt(chunkSize, plaintextByteSize, chunkIndex) {
  const offset = chunkIndex * chunkSize;
  if (offset >= plaintextByteSize) return 0;
  return Math.min(plaintextByteSize - offset, chunkSize);
}

/** @param {Uint8Array} keyBytes @returns {Promise<CryptoKey>} */
function importAesGcmKey(keyBytes) {
  if (keyBytes.byteLength !== 32) {
    throw new Error('文件数据密钥长度无效');
  }
  return globalThis.crypto.subtle.importKey(
    'raw',
    bufferSource(keyBytes),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * @param {CryptoKey} key
 * @param {Uint8Array} nonce
 * @param {Uint8Array} aad
 * @param {Uint8Array} plaintext
 * @returns {Promise<ArrayBuffer>}
 */
function encryptChunk(key, nonce, aad, plaintext) {
  return globalThis.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: bufferSource(nonce),
      additionalData: bufferSource(aad),
    },
    key,
    bufferSource(plaintext),
  );
}

/**
 * @param {CryptoKey} key
 * @param {Uint8Array} nonce
 * @param {Uint8Array} aad
 * @param {Uint8Array} ciphertextWithTag
 * @returns {Promise<ArrayBuffer>}
 */
function decryptChunk(key, nonce, aad, ciphertextWithTag) {
  return globalThis.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: bufferSource(nonce),
      additionalData: bufferSource(aad),
    },
    key,
    bufferSource(ciphertextWithTag),
  );
}

/** @param {Uint8Array} bytes @returns {BufferSource} */
function bufferSource(bytes) {
  return /** @type {BufferSource} */ (bytes);
}

/** @param {number} fileObjectId @param {number} chunkIndex @returns {Uint8Array} */
function chunkAad(fileObjectId, chunkIndex) {
  return chunkAadWithSeparator(fileObjectId, chunkIndex, 0x3a);
}

/** @param {number} fileObjectId @param {number} chunkIndex @returns {Uint8Array} */
function legacyChunkAad(fileObjectId, chunkIndex) {
  return chunkAadWithSeparator(fileObjectId, chunkIndex, 0);
}

/** @param {number} fileObjectId @param {number} chunkIndex @param {number} separator @returns {Uint8Array} */
function chunkAadWithSeparator(fileObjectId, chunkIndex, separator) {
  const prefix = new TextEncoder().encode('yuance-file-enc:v1:');
  const aad = new Uint8Array(prefix.byteLength + 8 + 1 + 4);
  aad.set(prefix, 0);
  const view = new DataView(aad.buffer);
  view.setBigUint64(prefix.byteLength, BigInt(fileObjectId), false);
  view.setUint8(prefix.byteLength + 8, separator);
  view.setUint32(prefix.byteLength + 9, chunkIndex, false);
  return aad;
}

/** @param {Uint8Array[]} parts @returns {Uint8Array} */
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

/** @param {Uint8Array} bytes @returns {string} */
function hexFromBytes(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** @param {Uint8Array} left @param {Uint8Array} right @returns {boolean} */
function bytesEqual(left, right) {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}
