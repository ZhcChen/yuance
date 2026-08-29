import test from 'node:test';
import assert from 'node:assert/strict';

import { createBrowserFilePlatform } from '../src/platform/browser/files.js';
import {
  decryptFile,
  encryptFile,
  parseEncryptionHeader,
  sha256Hex,
} from '../src/platform/browser/file-crypto.js';

test('browser file chooser converts the selected File into an opaque capability', async () => {
  const file = new File(['content'], 'design.txt', { type: 'text/plain' });
  const platform = createBrowserFilePlatform({ refreshCsrfToken: async () => '', chooseFile: async () => file });
  const selected = await platform.files.chooseFile();
  assert.equal(selected?.filename, 'design.txt');
  assert.equal(selected?.byteSize, 7);
  assert.deepEqual(Object.keys(selected?.capability || {}), []);

  const cancelled = createBrowserFilePlatform({ refreshCsrfToken: async () => '', chooseFile: async () => null });
  assert.equal(await cancelled.files.chooseFile(), null);
});

test('browser pasted file converts a clipboard File into an opaque capability', async () => {
  const platform = createBrowserFilePlatform({ refreshCsrfToken: async () => '' });
  const selected = await platform.selectPastedFile(new File(['clip'], 'clip.png', { type: 'image/png' }));
  assert.equal(selected?.filename, 'clip.png');
  assert.equal(selected?.contentType, 'image/png');
  assert.equal(selected?.byteSize, 4);
  assert.match(selected?.checksumSha256 || '', /^[0-9a-f]{64}$/u);
  assert.deepEqual(Object.keys(selected?.capability || {}), []);
});

test('browser pasted file infers image content type when clipboard omits MIME', async () => {
  const platform = createBrowserFilePlatform({ refreshCsrfToken: async () => '' });
  const selected = await platform.selectPastedFile(new File(['clip'], 'image.png'));
  assert.equal(selected?.contentType, 'image/png');
  assert.equal(selected?.byteSize, 4);
});

test('browser pasted file infers image content type from octet-stream clipboard files', async () => {
  const platform = createBrowserFilePlatform({ refreshCsrfToken: async () => '' });
  const selected = await platform.selectPastedFile(new File(['clip'], 'image.png', { type: 'application/octet-stream' }));
  assert.equal(selected?.contentType, 'image/png');
  assert.equal(selected?.byteSize, 4);
});

test('browser pasted file sniffs image bytes when filename and MIME are generic', async () => {
  const platform = createBrowserFilePlatform({ refreshCsrfToken: async () => '' });
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
  const selected = await platform.selectPastedFile(new File([png], 'clipboard-image', { type: 'application/octet-stream' }));
  assert.equal(selected?.contentType, 'image/png');
});

test('browser file platform uploads through opaque capabilities', async () => {
  const calls = [];
  const file = new File(['content'], 'design.txt', { type: 'text/plain' });
  const platform = createBrowserFilePlatform({
    refreshCsrfToken: async () => 'csrf-test',
    baseUrl: 'https://yuance.test/web/app/',
    origin: 'https://yuance.test',
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return new Response(null, { status: 200 });
    },
  });
  const selected = platform.selectFile(file);
  const transfer = platform.transfers.authorizeSignedRequest({
    purpose: 'upload',
    expiresInSeconds: 300,
    request: {
      method: 'PUT',
      url: '/storage/upload',
      headers: [['content-type', 'text/plain'], ['x-oss-token', 'signed']],
    },
  });

  await platform.files.uploadSignedRequest(transfer, selected.capability);

  assert.deepEqual(Object.keys(selected.capability), []);
  assert.deepEqual(Object.keys(transfer), []);
  assert.equal(calls[0].url, 'https://yuance.test/storage/upload');
  assert.equal(calls[0].options.credentials, 'same-origin');
  assert.equal(calls[0].options.body, file);
  const headers = new Headers(calls[0].options.headers);
  assert.equal(headers.get('content-type'), 'text/plain');
  assert.equal(headers.get('x-oss-token'), 'signed');
  assert.equal(headers.get('x-yuance-csrf-token'), 'csrf-test');
});

test('browser file platform uploads inferred image MIME when signature omits content type', async () => {
  const calls = [];
  const file = new File(['clip'], 'image.png', { type: 'application/octet-stream' });
  const platform = createBrowserFilePlatform({
    refreshCsrfToken: async () => 'csrf-test',
    baseUrl: 'https://yuance.test/web/app/',
    origin: 'https://yuance.test',
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return new Response(null, { status: 200 });
    },
  });
  const selected = platform.selectFile(file);
  const transfer = platform.transfers.authorizeSignedRequest({
    purpose: 'upload',
    expiresInSeconds: 300,
    request: {
      method: 'PUT',
      url: '/storage/upload',
      headers: [['x-oss-token', 'signed']],
    },
  });

  await platform.files.uploadSignedRequest(transfer, selected.capability);

  const headers = new Headers(calls[0].options.headers);
  assert.equal(headers.get('content-type'), 'image/png');
});

test('browser file platform accepts storage signed headers and filters browser-managed content length', async () => {
  const calls = [];
  const file = new File(['content'], 'design.txt', { type: 'text/plain' });
  const platform = createBrowserFilePlatform({
    refreshCsrfToken: async () => '',
    baseUrl: 'https://yuance.test/web/app/',
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return new Response(null, { status: 200 });
    },
  });
  const selected = platform.selectFile(file);
  const transfer = platform.transfers.authorizeSignedRequest({
    purpose: 'upload',
    expiresInSeconds: 300,
    request: {
      method: 'PUT',
      url: '/storage/upload',
      headers: [
        ['content-length', '7'],
        ['content-type', 'text/plain'],
        ['x-amz-content-sha256', 'abc'],
        ['x-oss-forbid-overwrite', 'true'],
      ],
    },
  });

  await platform.files.uploadSignedRequest(transfer, selected.capability);

  const headers = new Headers(calls[0].options.headers);
  assert.equal(headers.get('content-type'), 'text/plain');
  assert.equal(headers.get('x-amz-content-sha256'), 'abc');
  assert.equal(headers.get('x-oss-forbid-overwrite'), 'true');
  assert.equal(headers.get('content-length'), null);
});

test('browser file platform opens validated GET downloads', async () => {
  const opened = [];
  const platform = createBrowserFilePlatform({
    refreshCsrfToken: async () => '',
    baseUrl: 'https://yuance.test/web/app/',
    allowedTransferOrigins: ['https://storage.test'],
    openDownload: (url) => opened.push(url),
  });
  const transfer = platform.transfers.authorizeSignedRequest({
    purpose: 'download',
    expiresInSeconds: 300,
    request: {
      method: 'GET',
      url: 'https://storage.test/download?id=7',
      headers: [],
    },
  });

  await platform.downloads.downloadSignedRequest(transfer, 'design.txt');

  assert.deepEqual(opened, ['https://storage.test/download?id=7']);
});

test('browser file platform rejects unsupported or foreign capabilities', async () => {
  const platform = createBrowserFilePlatform({
    refreshCsrfToken: async () => '',
    baseUrl: 'https://yuance.test/web/app/',
  });

  assert.throws(
    () => platform.transfers.authorizeSignedRequest({
      purpose: 'upload',
      expiresInSeconds: 300,
      request: { method: 'POST', url: '/upload', headers: [] },
    }),
    /方法不受支持|方法与用途不匹配/,
  );
  await assert.rejects(
    platform.downloads.downloadSignedRequest(/** @type {never} */ ({}), 'file.txt'),
    /capability 无效/,
  );
});

test('browser file platform restricts transfer origins and signed headers', () => {
  const platform = createBrowserFilePlatform({
    refreshCsrfToken: async () => '',
    baseUrl: 'https://yuance.test/web/app/',
  });

  assert.throws(
    () => platform.transfers.authorizeSignedRequest({
      purpose: 'download',
      expiresInSeconds: 300,
      request: { method: 'GET', url: 'https://attacker.test/file', headers: [] },
    }),
    /allowlist/,
  );
  assert.throws(
    () => platform.transfers.authorizeSignedRequest({
      purpose: 'upload',
      expiresInSeconds: 300,
      request: { method: 'PUT', url: '/upload', headers: [['authorization', 'secret']] },
    }),
    /请求头不受支持/,
  );
});

test('browser file platform accepts a scoped HTTPS Aliyun OSS bucket origin', async () => {
  const opened = [];
  const platform = createBrowserFilePlatform({
    refreshCsrfToken: async () => '',
    baseUrl: 'https://yuance.test/web/app/',
    openDownload: (url) => opened.push(url),
  });
  const transfer = platform.transfers.authorizeSignedRequest({
    purpose: 'download',
    expiresInSeconds: 300,
    request: {
      method: 'GET',
      url: 'https://yuance.oss-cn-hangzhou.aliyuncs.com/file',
      headers: [],
    },
  });

  await platform.downloads.downloadSignedRequest(transfer, 'file.txt');
  assert.deepEqual(opened, ['https://yuance.oss-cn-hangzhou.aliyuncs.com/file']);
});

test('browser file platform rejects unscoped Aliyun domains', () => {
  const platform = createBrowserFilePlatform({
    refreshCsrfToken: async () => '',
    baseUrl: 'https://yuance.test/web/app/',
  });

  for (const url of [
    'https://aliyuncs.com/file',
    'https://oss-cn-hangzhou.aliyuncs.com/file',
    'https://console.aliyuncs.com/file',
  ]) {
    assert.throws(
      () => platform.transfers.authorizeSignedRequest({
        purpose: 'download',
        expiresInSeconds: 300,
        request: { method: 'GET', url, headers: [] },
      }),
      /allowlist/,
    );
  }
});

test('browser file platform binds capabilities to purpose and consumes them once', async () => {
  const platform = createBrowserFilePlatform({
    refreshCsrfToken: async () => '',
    baseUrl: 'https://yuance.test/web/app/',
    fetchImpl: async () => new Response(null, { status: 200 }),
    openDownload: () => {},
  });
  const uploadTransfer = platform.transfers.authorizeSignedRequest({
    purpose: 'upload',
    expiresInSeconds: 300,
    request: { method: 'PUT', url: '/upload', headers: [] },
  });

  await assert.rejects(
    platform.downloads.downloadSignedRequest(uploadTransfer, 'file.txt'),
    /用途不匹配/,
  );
  await assert.rejects(
    platform.downloads.downloadSignedRequest(uploadTransfer, 'file.txt'),
    /无效或已消费/,
  );

  const downloadTransfer = platform.transfers.authorizeSignedRequest({
    purpose: 'download',
    expiresInSeconds: 300,
    request: { method: 'GET', url: '/download', headers: [] },
  });
  await platform.downloads.downloadSignedRequest(downloadTransfer, 'file.txt');
  await assert.rejects(
    platform.downloads.downloadSignedRequest(downloadTransfer, 'file.txt'),
    /无效或已消费/,
  );
});

test('browser file platform rejects expired transfer capabilities', async () => {
  let currentTime = 1_000;
  const platform = createBrowserFilePlatform({
    refreshCsrfToken: async () => '',
    baseUrl: 'https://yuance.test/web/app/',
    now: () => currentTime,
  });
  const transfer = platform.transfers.authorizeSignedRequest({
    purpose: 'download',
    expiresInSeconds: 1,
    request: { method: 'GET', url: '/download', headers: [] },
  });
  currentTime = 2_000;

  await assert.rejects(
    platform.downloads.downloadSignedRequest(transfer, 'file.txt'),
    /已过期/,
  );
});

test('browser file platform consumes file capabilities once', async () => {
  const platform = createBrowserFilePlatform({
    refreshCsrfToken: async () => '',
    baseUrl: 'https://yuance.test/web/app/',
    fetchImpl: async () => new Response(null, { status: 200 }),
  });
  const selected = platform.selectFile(new File(['content'], 'file.txt', { type: 'text/plain' }));
  const authorizeUpload = () => platform.transfers.authorizeSignedRequest({
    purpose: 'upload',
    expiresInSeconds: 300,
    request: { method: 'PUT', url: '/upload', headers: [] },
  });

  await platform.files.uploadSignedRequest(authorizeUpload(), selected.capability);
  await assert.rejects(
    platform.files.uploadSignedRequest(authorizeUpload(), selected.capability),
    /上传 capability 无效/,
  );
});

test('browser file platform rejects methods that conflict with transfer purpose', () => {
  const platform = createBrowserFilePlatform({
    refreshCsrfToken: async () => '',
    baseUrl: 'https://yuance.test/web/app/',
  });

  assert.throws(
    () => platform.transfers.authorizeSignedRequest({
      purpose: 'upload',
      expiresInSeconds: 300,
      request: { method: 'GET', url: '/upload', headers: [] },
    }),
    /方法与用途不匹配/,
  );
  assert.throws(
    () => platform.transfers.authorizeSignedRequest({
      purpose: 'download',
      expiresInSeconds: 300,
      request: { method: 'PUT', url: '/download', headers: [] },
    }),
    /方法与用途不匹配/,
  );
});

test('browser file platform encrypts uploads and returns the ciphertext checksum', async () => {
  const calls = [];
  const file = new File(['protected resource'], 'notes.txt', { type: 'text/plain' });
  const dataKey = new Uint8Array(32);
  globalThis.crypto.getRandomValues(dataKey);
  const plaintext = new Uint8Array(await file.arrayBuffer());
  const encryption = await encryptionPayload(dataKey, 42, plaintext);
  const platform = createBrowserFilePlatform({
    refreshCsrfToken: async () => '',
    baseUrl: 'https://yuance.test/web/app/',
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return new Response(null, { status: 200 });
    },
  });
  const selected = await platform.selectPastedFile(file);
  assert.ok(selected);
  const transfer = platform.transfers.authorizeSignedRequest({
    purpose: 'upload',
    expiresInSeconds: 300,
    encryption,
    request: {
      method: 'PUT',
      url: '/storage/upload',
      headers: [['content-type', 'application/octet-stream']],
    },
  });

  const result = await platform.files.uploadSignedRequest(
    transfer,
    selected.capability,
  );

  assert.equal(new Headers(calls[0].options.headers).get('content-type'), 'application/octet-stream');
  const ciphertext = calls[0].options.body;
  assert.equal(ciphertext instanceof Uint8Array, true);
  assert.deepEqual(
    await decryptFile(dataKey, 42, ciphertext),
    plaintext,
  );
  assert.equal(result?.encryptedChecksumSha256, await sha256Hex(ciphertext));
});

test('browser file platform fetches and decrypts encrypted downloads', async () => {
  const saved = [];
  const file = new File(['protected download'], 'notes.txt', { type: 'text/plain' });
  const dataKey = new Uint8Array(32);
  globalThis.crypto.getRandomValues(dataKey);
  const plaintext = new Uint8Array(await file.arrayBuffer());
  const ciphertext = await encryptFile(dataKey, 77, plaintext);
  const encryptedChecksumSha256 = await sha256Hex(ciphertext);
  const encryption = {
    ...(await encryptionPayload(dataKey, 77, plaintext)),
    encryptedByteSize: ciphertext.byteLength,
    encryptedChecksumSha256,
  };
  const platform = createBrowserFilePlatform({
    refreshCsrfToken: async () => '',
    baseUrl: 'https://yuance.test/web/app/',
    fetchImpl: async () =>
      new Response(/** @type {BodyInit} */ (ciphertext)),
    downloadBlob: (bytes, filename) => saved.push({ bytes, filename }),
  });
  const transfer = platform.transfers.authorizeSignedRequest({
    purpose: 'download',
    expiresInSeconds: 300,
    encryption,
    request: { method: 'GET', url: '/download', headers: [] },
  });

  await platform.downloads.downloadSignedRequest(transfer, 'notes.txt');

  assert.deepEqual(saved[0]?.bytes, plaintext);
  assert.equal(saved[0]?.filename, 'notes.txt');
});

test('browser decrypts legacy files encrypted with a zero AAD separator', async () => {
  const dataKey = new Uint8Array(32);
  globalThis.crypto.getRandomValues(dataKey);
  const fileObjectId = 77;
  const plaintext = new TextEncoder().encode('legacy browser encrypted attachment');
  const legacy = await legacyEncryptWithZeroSeparator(dataKey, fileObjectId, plaintext);

  assert.deepEqual(await decryptFile(dataKey, fileObjectId, legacy), plaintext);
});

/** @param {Uint8Array} dataKey @param {number} fileObjectId @param {Uint8Array} plaintext */
async function legacyEncryptWithZeroSeparator(dataKey, fileObjectId, plaintext) {
  const canonical = await encryptFile(dataKey, fileObjectId, plaintext);
  const header = parseEncryptionHeader(canonical);
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    dataKey,
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  );
  const legacy = new Uint8Array(canonical.byteLength);
  legacy.set(canonical.subarray(0, header.headerLength), 0);
  let offset = header.headerLength;
  for (let chunkIndex = 0; chunkIndex < header.chunkCount; chunkIndex += 1) {
    const start = chunkIndex * header.chunkSize;
    const chunk = plaintext.subarray(start, start + header.chunkSize);
    const nonce = header.nonces.subarray(
      chunkIndex * 12,
      (chunkIndex + 1) * 12,
    );
    const encrypted = new Uint8Array(
      await globalThis.crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: nonce,
          additionalData: zeroSeparatorAad(fileObjectId, chunkIndex),
        },
        key,
        chunk,
      ),
    );
    legacy.set(encrypted, offset);
    offset += encrypted.byteLength;
  }
  assert.equal(offset, legacy.length);
  return legacy;
}

/** @param {number} fileObjectId @param {number} chunkIndex @returns {Uint8Array} */
function zeroSeparatorAad(fileObjectId, chunkIndex) {
  const prefix = new TextEncoder().encode('yuance-file-enc:v1:');
  const aad = new Uint8Array(prefix.byteLength + 8 + 1 + 4);
  aad.set(prefix, 0);
  const view = new DataView(aad.buffer);
  view.setBigUint64(prefix.byteLength, BigInt(fileObjectId), false);
  view.setUint32(prefix.byteLength + 9, chunkIndex, false);
  return aad;
}

/** @param {Uint8Array} dataKey @param {number} fileObjectId @param {Uint8Array} plaintext */
async function encryptionPayload(dataKey, fileObjectId, plaintext) {
  const binary = String.fromCharCode(...dataKey);
  return {
    algorithm: 'AES-256-GCM',
    format: 'YUANCE-ENC-v1',
    chunkSize: 1024 * 1024,
    key: globalThis.btoa(binary),
    fileObjectId,
    plaintextByteSize: plaintext.byteLength,
    plaintextSha256: await sha256Hex(plaintext),
    encryptedByteSize: 0,
    encryptedChecksumSha256: '',
  };
}
