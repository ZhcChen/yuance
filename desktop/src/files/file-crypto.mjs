import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

export const FILE_CHUNK_SIZE = 1024 * 1024;
export const FILE_ENCRYPTION_FORMAT = "YUANCE-ENC-v1";

const MAGIC = Buffer.from("YUANCE-ENC-v1", "ascii");
const FORMAT_VERSION = 1;
const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;
const SHA256_LENGTH = 32;
const HEADER_FIXED_LENGTH = MAGIC.length + 4 + 4 + 8 + SHA256_LENGTH + 4;

export function encryptedTotalSize(plaintextByteSize) {
  const chunkCount = chunkCountFor(plaintextByteSize);
  return headerLengthFor(plaintextByteSize) + encryptedBodyLength(plaintextByteSize, chunkCount);
}

export function headerLengthFor(plaintextByteSize) {
  return HEADER_FIXED_LENGTH + chunkCountFor(plaintextByteSize) * NONCE_LENGTH;
}

export function plaintextLengthAt(chunkSize, plaintextByteSize, chunkIndex) {
  const offset = chunkIndex * chunkSize;
  if (offset >= plaintextByteSize) return 0;
  return Math.min(plaintextByteSize - offset, chunkSize);
}

export function createEncryptionHeader(plaintextByteSize, plaintextSha256) {
  const chunkCount = chunkCountFor(plaintextByteSize);
  const nonces = Buffer.concat(
    Array.from({ length: chunkCount }, () => randomBytes(NONCE_LENGTH)),
  );
  const header = Buffer.alloc(HEADER_FIXED_LENGTH + nonces.length);
  let cursor = 0;
  MAGIC.copy(header, cursor);
  cursor += MAGIC.length;
  header.writeUInt32BE(FORMAT_VERSION, cursor);
  cursor += 4;
  header.writeUInt32BE(FILE_CHUNK_SIZE, cursor);
  cursor += 4;
  header.writeBigUInt64BE(BigInt(plaintextByteSize), cursor);
  cursor += 8;
  Buffer.from(plaintextSha256, "hex").copy(header, cursor);
  cursor += SHA256_LENGTH;
  header.writeUInt32BE(chunkCount, cursor);
  cursor += 4;
  nonces.copy(header, cursor);
  return header;
}

export function encryptBodyChunk(dataKey, fileObjectId, chunkIndex, nonce, plaintext) {
  const cipher = createCipheriv("aes-256-gcm", dataKey, nonce, {
    authTagLength: TAG_LENGTH,
  });
  cipher.setAAD(chunkAad(fileObjectId, chunkIndex));
  return Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
}

export function parseEncryptionHeader(ciphertext) {
  if (ciphertext.length < HEADER_FIXED_LENGTH) throw encryptionError("加密文件头无效");
  let cursor = 0;
  if (!ciphertext.subarray(0, MAGIC.length).equals(MAGIC)) throw encryptionError("加密文件头无效");
  cursor += MAGIC.length;
  if (ciphertext.readUInt32BE(cursor) !== FORMAT_VERSION) throw encryptionError("加密文件版本不受支持");
  cursor += 4;
  const chunkSize = ciphertext.readUInt32BE(cursor);
  cursor += 4;
  if (chunkSize === 0) throw encryptionError("加密文件分块大小无效");
  const plaintextByteSize = Number(ciphertext.readBigUInt64BE(cursor));
  cursor += 8;
  const plaintextSha256 = ciphertext.subarray(cursor, cursor + SHA256_LENGTH).toString("hex");
  cursor += SHA256_LENGTH;
  const chunkCount = ciphertext.readUInt32BE(cursor);
  cursor += 4;
  const headerLength = cursor + chunkCount * NONCE_LENGTH;
  if (ciphertext.length < headerLength) throw encryptionError("加密文件 nonce 表不完整");
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

export function decryptBodyChunk(dataKey, fileObjectId, chunkIndex, nonce, ciphertextWithTag) {
  try {
    return decryptBodyChunkWithAad(
      dataKey,
      fileObjectId,
      chunkIndex,
      nonce,
      ciphertextWithTag,
      chunkAad(fileObjectId, chunkIndex),
    );
  } catch {
    // 兼容早期 Web 上传漏写冒号分隔符的文件。
    try {
      return decryptBodyChunkWithAad(
        dataKey,
        fileObjectId,
        chunkIndex,
        nonce,
        ciphertextWithTag,
        legacyChunkAad(fileObjectId, chunkIndex),
      );
    } catch {
      throw encryptionError("加密文件分块解密失败或数据被篡改");
    }
  }
}

function decryptBodyChunkWithAad(dataKey, fileObjectId, chunkIndex, nonce, ciphertextWithTag, aad) {
  if (ciphertextWithTag.length <= TAG_LENGTH) throw encryptionError("加密文件分块数据不完整");
  const tag = ciphertextWithTag.subarray(ciphertextWithTag.length - TAG_LENGTH);
  const payload = ciphertextWithTag.subarray(0, ciphertextWithTag.length - TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", dataKey, nonce, {
    authTagLength: TAG_LENGTH,
  });
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(payload), decipher.final()]);
}

function chunkAad(fileObjectId, chunkIndex) {
  return chunkAadWithSeparator(fileObjectId, chunkIndex, 0x3a);
}

function legacyChunkAad(fileObjectId, chunkIndex) {
  return chunkAadWithSeparator(fileObjectId, chunkIndex, 0);
}

function chunkAadWithSeparator(fileObjectId, chunkIndex, separator) {
  if (!Number.isSafeInteger(fileObjectId) || fileObjectId < 1) throw encryptionError("文件对象 ID 无效");
  const prefix = Buffer.from("yuance-file-enc:v1:", "ascii");
  const aad = Buffer.alloc(prefix.length + 8 + 1 + 4);
  prefix.copy(aad, 0);
  aad.writeBigUInt64BE(BigInt(fileObjectId), prefix.length);
  aad.writeUInt8(separator, prefix.length + 8);
  aad.writeUInt32BE(chunkIndex, prefix.length + 9);
  return aad;
}

export function encryptFile(dataKey, fileObjectId, plaintext) {
  const header = createEncryptionHeader(plaintext.length, createHash("sha256").update(plaintext).digest("hex"));
  const chunkCount = chunkCountFor(plaintext.length);
  const parts = [header];
  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
    const start = chunkIndex * FILE_CHUNK_SIZE;
    const chunk = plaintext.subarray(start, start + FILE_CHUNK_SIZE);
    const nonce = header.subarray(
      header.length - chunkCount * NONCE_LENGTH + chunkIndex * NONCE_LENGTH,
      header.length - chunkCount * NONCE_LENGTH + (chunkIndex + 1) * NONCE_LENGTH,
    );
    parts.push(encryptBodyChunk(dataKey, fileObjectId, chunkIndex, nonce, chunk));
  }
  return Buffer.concat(parts);
}

export function decryptFile(dataKey, fileObjectId, ciphertext) {
  const header = parseEncryptionHeader(ciphertext);
  const chunks = [];
  let offset = header.headerLength;
  for (let chunkIndex = 0; chunkIndex < header.chunkCount; chunkIndex += 1) {
    const length = plaintextLengthAt(header.chunkSize, header.plaintextByteSize, chunkIndex);
    const chunk = ciphertext.subarray(offset, offset + length + TAG_LENGTH);
    const nonce = header.nonces.subarray(
      chunkIndex * NONCE_LENGTH,
      (chunkIndex + 1) * NONCE_LENGTH,
    );
    chunks.push(decryptBodyChunk(dataKey, fileObjectId, chunkIndex, nonce, chunk));
    offset += chunk.length;
  }
  const plaintext = Buffer.concat(chunks);
  if (createHash("sha256").update(plaintext).digest("hex") !== header.plaintextSha256) {
    throw encryptionError("加密文件明文校验值不匹配");
  }
  return plaintext;
}

function encryptedBodyLength(plaintextByteSize, chunkCount) {
  if (chunkCount === 0) return 0;
  const lastChunkLength = plaintextByteSize - (chunkCount - 1) * FILE_CHUNK_SIZE;
  return (chunkCount - 1) * (FILE_CHUNK_SIZE + TAG_LENGTH) + lastChunkLength + TAG_LENGTH;
}

function chunkCountFor(plaintextByteSize) {
  if (!Number.isSafeInteger(plaintextByteSize) || plaintextByteSize < 0) {
    throw encryptionError("加密文件明文大小无效");
  }
  return plaintextByteSize === 0 ? 0 : Math.ceil(plaintextByteSize / FILE_CHUNK_SIZE);
}

function encryptionError(message) {
  return Object.assign(new Error(message), { code: "file_encryption_failed" });
}
