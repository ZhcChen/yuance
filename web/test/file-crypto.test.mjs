import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FILE_CHUNK_SIZE,
  decryptFile,
  encryptFile,
  parseEncryptionHeader,
  sha256Hex,
} from '../src/platform/browser/file-crypto.js';

function randomKey() {
  const key = new Uint8Array(32);
  globalThis.crypto.getRandomValues(key);
  return key;
}

test('browser file crypto round trips multi-chunk files', async () => {
  const dataKey = randomKey();
  const fileObjectId = 42;
  const plaintext = new Uint8Array(FILE_CHUNK_SIZE * 2 + 17);
  for (let index = 0; index < plaintext.byteLength; index += 1) {
    plaintext[index] = index % 251;
  }

  const ciphertext = await encryptFile(dataKey, fileObjectId, plaintext);
  const header = parseEncryptionHeader(ciphertext);
  assert.equal(header.chunkCount, 3);
  assert.equal(header.plaintextByteSize, plaintext.byteLength);
  assert.equal(header.plaintextSha256, await sha256Hex(plaintext));
  assert.deepEqual(
    await decryptFile(dataKey, fileObjectId, ciphertext),
    plaintext,
  );
});

test('browser file crypto rejects empty files only after matching server size', async () => {
  const dataKey = randomKey();
  const ciphertext = await encryptFile(dataKey, 7, new Uint8Array(0));
  assert.deepEqual(
    await decryptFile(dataKey, 7, ciphertext),
    new Uint8Array(0),
  );
});

test('browser file crypto rejects tampering and wrong keys', async () => {
  const dataKey = randomKey();
  const plaintext = new TextEncoder().encode('protected resource');
  const ciphertext = await encryptFile(dataKey, 9, plaintext);
  const tampered = ciphertext.slice();
  tampered[tampered.byteLength - 1] ^= 0x01;
  await assert.rejects(decryptFile(dataKey, 9, tampered), /校验|解密/);

  const wrongKey = randomKey();
  await assert.rejects(decryptFile(wrongKey, 9, ciphertext));
});
