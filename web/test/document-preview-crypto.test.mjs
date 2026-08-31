import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchPreviewBytes } from '../src/platform/browser/document-viewer.js';
import { encryptFile, sha256Hex } from '../src/platform/browser/file-crypto.js';

test('browser preview reader returns plain binary responses unchanged', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(
    /** @type {BodyInit} */ (new Uint8Array([1, 2, 3])),
    { status: 200, headers: { 'content-type': 'application/pdf' } },
  );
  try {
    const bytes = await fetchPreviewBytes('/attachments/1/preview/content');
    assert.deepEqual(Array.from(bytes), [1, 2, 3]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('browser preview reader decrypts encrypted preview payloads', async () => {
  const dataKey = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const fileObjectId = 42;
  const plaintext = new TextEncoder().encode('hello encrypted preview');
  const ciphertext = await encryptFile(dataKey, fileObjectId, plaintext);
  const payload = {
    url: 'https://oss.example/encrypted-object',
    encryption: {
      algorithm: 'AES-256-GCM',
      format: 'YUANCE-ENC-v1',
      chunkSize: 1024 * 1024,
      key: globalThis.btoa(String.fromCharCode(...dataKey)),
      file_object_id: fileObjectId,
      plaintext_byte_size: plaintext.byteLength,
      plaintext_sha256: await sha256Hex(plaintext),
      encrypted_byte_size: ciphertext.byteLength,
      encrypted_checksum_sha256: await sha256Hex(ciphertext),
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value.startsWith('https://oss.example/')) {
      return new Response(
        /** @type {BodyInit} */ (ciphertext),
        { status: 200, headers: { 'content-type': 'application/octet-stream' } },
      );
    }
    return new Response(
      JSON.stringify(payload),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };
  try {
    const bytes = await fetchPreviewBytes('/attachments/1/preview/content');
    assert.deepEqual(Array.from(bytes), Array.from(plaintext));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
