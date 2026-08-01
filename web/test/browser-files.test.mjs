import test from 'node:test';
import assert from 'node:assert/strict';

import { createBrowserFilePlatform } from '../src/platform/browser/files.js';

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

test('browser file platform accepts HTTPS Aliyun OSS transfer origins', async () => {
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
