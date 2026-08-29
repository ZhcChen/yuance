import assert from "node:assert/strict";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import test from "node:test";

import {
  FILE_CHUNK_SIZE,
  FILE_ENCRYPTION_FORMAT,
  createEncryptionHeader,
  decryptFile,
  encryptedTotalSize,
  encryptFile,
  parseEncryptionHeader,
} from "../src/files/file-crypto.mjs";

test("encrypts and decrypts a small file with the YUANCE-ENC-v1 container", () => {
  const dataKey = randomBytes(32);
  const plaintext = Buffer.from("protected resource attachment");
  const ciphertext = encryptFile(dataKey, 42, plaintext);
  assert.equal(ciphertext.subarray(0, FILE_ENCRYPTION_FORMAT.length).toString("ascii"), FILE_ENCRYPTION_FORMAT);
  assert.equal(ciphertext.includes(plaintext), false);
  assert.equal(parseEncryptionHeader(ciphertext).plaintextByteSize, plaintext.length);
  assert.deepEqual(decryptFile(dataKey, 42, ciphertext), plaintext);
});

test("supports empty and multi-chunk files with deterministic size accounting", () => {
  const dataKey = randomBytes(32);
  const empty = encryptFile(dataKey, 42, Buffer.alloc(0));
  assert.equal(parseEncryptionHeader(empty).chunkCount, 0);
  assert.deepEqual(decryptFile(dataKey, 42, empty), Buffer.alloc(0));

  const large = randomBytes(FILE_CHUNK_SIZE * 2 + 7);
  const ciphertext = encryptFile(dataKey, 42, large);
  const header = parseEncryptionHeader(ciphertext);
  assert.equal(header.chunkCount, 3);
  assert.equal(header.plaintextByteSize, large.length);
  assert.equal(ciphertext.length, encryptedTotalSize(large.length));
  assert.deepEqual(decryptFile(dataKey, 42, ciphertext), large);
});

test("binds every chunk to the file object and rejects wrong key or tampering", () => {
  const dataKey = randomBytes(32);
  const plaintext = Buffer.from("tamper resistant");
  const ciphertext = encryptFile(dataKey, 42, plaintext);
  assert.throws(() => decryptFile(randomBytes(32), 42, ciphertext), /解密失败|篡改/);
  assert.throws(() => decryptFile(dataKey, 43, ciphertext), /解密失败|篡改/);
  const tampered = Buffer.from(ciphertext);
  tampered[tampered.length - 1] ^= 0x01;
  assert.throws(() => decryptFile(dataKey, 42, tampered), /解密失败|篡改/);
});

test("decrypts legacy browser files encrypted with a zero AAD separator", () => {
  const dataKey = randomBytes(32);
  const fileObjectId = 99;
  const plaintext = Buffer.from("legacy browser upload content");
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", dataKey, nonce, {
    authTagLength: 16,
  });
  cipher.setAAD(legacyChunkAadForTest(fileObjectId, 0));
  const body = Buffer.concat([
    cipher.update(plaintext),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  const header = createEncryptionHeader(
    plaintext.length,
    createHash("sha256").update(plaintext).digest("hex"),
  );
  nonce.copy(header, header.length - 12);
  const ciphertext = Buffer.concat([header, body]);

  assert.deepEqual(decryptFile(dataKey, fileObjectId, ciphertext), plaintext);
});

/** @param {number} fileObjectId @param {number} chunkIndex @returns {Buffer} */
function legacyChunkAadForTest(fileObjectId, chunkIndex) {
  const prefix = Buffer.from("yuance-file-enc:v1:", "ascii");
  const aad = Buffer.alloc(prefix.length + 8 + 1 + 4);
  prefix.copy(aad, 0);
  aad.writeBigUInt64BE(BigInt(fileObjectId), prefix.length);
  aad.writeUInt32BE(chunkIndex, prefix.length + 9);
  return aad;
}

test("creates an independent nonce per chunk and validates the header layout", () => {
  const dataKey = randomBytes(32);
  const plaintext = Buffer.alloc(FILE_CHUNK_SIZE * 2);
  const header = createEncryptionHeader(plaintext.length, "a".repeat(64));
  const parsed = parseEncryptionHeader(header);
  assert.equal(parsed.chunkSize, FILE_CHUNK_SIZE);
  assert.equal(parsed.chunkCount, 2);
  assert.equal(parsed.plaintextSha256, "a".repeat(64));
  assert.equal(header.length, parsed.headerLength);
  assert.equal(
    header.subarray(parsed.headerLength - 24, parsed.headerLength - 12).equals(
      header.subarray(parsed.headerLength - 12, parsed.headerLength),
    ),
    false,
  );
});

test("rejects invalid containers before decrypting", () => {
  assert.throws(() => decryptFile(randomBytes(32), 1, Buffer.from("not encrypted")), /文件头无效/);
  assert.throws(() => parseEncryptionHeader(Buffer.alloc(16)), /文件头无效/);
  const emptyHeader = createEncryptionHeader(0, "a".repeat(64));
  emptyHeader[0] = 0x58;
  assert.throws(() => parseEncryptionHeader(emptyHeader), /文件头无效/);
});
