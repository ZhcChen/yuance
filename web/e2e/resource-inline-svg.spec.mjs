import { expect, test } from '@playwright/test';
import { encryptFile, sha256Hex } from '../src/platform/browser/file-crypto.js';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const prefix = '/api/v1/projects/YCE/resources/901';
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160"><rect width="320" height="160" fill="#1570ef"/><text x="20" y="80" fill="white">SVG 中文验收</text></svg>';

async function fixture(page, { encrypted = false, failure = false, corrupt = false, waitForContent = null, onLoggedIn = null } = {}) {
  const body = `<h2>图片验收</h2><figure data-yuance-attachment-id="189" data-yuance-attachment-kind="image"><img src="/web/projects/YCE/resources/901/attachments/189/download" alt="容器SVG"></figure><p><img data-yuance-attachment-id="193" src="/web/projects/YCE/resources/901/attachments/193/download" alt="裸SVG"></p>`;
  const attachments = [189, 193].map(id => ({ id, filename: `flow-${id}.svg`, content_type: 'image/svg+xml', byte_size: Buffer.byteLength(svg), status: 'uploaded' }));
  await page.route('**/api/v1/projects/YCE/resource-library/linked-work-item-posts**', route => route.fulfill({ json: { data: [] } }));
  await page.route(`**${prefix}`, route => route.fulfill({ json: { data: { id: 901, project_key: 'YCE', title: '正文SVG测试', category: 'integration', summary: 'SVG测试', body, body_html: body, body_format: 'html', status: 'active', tags: [], is_protected: false, created_by: '测试', updated_by: '测试', created_at: '2026-10-09T00:00:00Z', updated_at: '2026-10-09T00:00:00Z', related_work_item: null, related_cycle: null, url: '/web/projects/YCE/resources/901', access_token: '' } } }));
  await page.route(`**${prefix}/attachments`, route => route.fulfill({ json: { data: attachments } }));
  for (const attachment of attachments) {
    const contentUrl = `${prefix}/attachments/${attachment.id}/preview/content`;
    await page.route(`**${prefix}/attachments/${attachment.id}/preview`, route => route.fulfill({ json: { data: { attachment, preview: { kind: 'image', strategy: 'image', file_type: 'svg', kind_label: '图片', is_experimental: false, legacy_preview_enabled: false, content_enabled: true }, content_url: contentUrl, download_url: `${prefix}/attachments/${attachment.id}/download-url`, navigation: { position: 1, total: 2, previous: null, next: null } } } }));
    const plaintext = new TextEncoder().encode(svg);
    const key = crypto.getRandomValues(new Uint8Array(32));
    const ciphertext = await encryptFile(key, attachment.id, plaintext);
    const plaintextSha256 = await sha256Hex(plaintext);
    const encryptedSha256 = await sha256Hex(ciphertext);
    const objectUrl = `https://oss.example/inline-svg-${attachment.id}`;
    await page.route(objectUrl, route => route.fulfill({ contentType: 'application/octet-stream', body: Buffer.from(ciphertext) }));
    await page.route(`**${contentUrl}?client_decrypt=1`, async route => {
      if (waitForContent) await waitForContent();
      if (failure) return route.fulfill({ status: 403, json: { error: { code: 'forbidden', message: '无权读取附件' } } });
      if (!encrypted) return route.fulfill({ contentType: 'image/svg+xml', body: svg });
      return route.fulfill({ json: { url: objectUrl, encryption: { algorithm: 'AES-256-GCM', format: 'YUANCE-ENC-v1', chunkSize: 1048576, key: Buffer.from(key).toString('base64'), file_object_id: attachment.id, plaintext_byte_size: plaintext.byteLength, plaintext_sha256: plaintextSha256, encrypted_byte_size: ciphertext.byteLength, encrypted_checksum_sha256: corrupt ? '0'.repeat(64) : encryptedSha256 } } });
    });
  }
  await page.addInitScript(() => {
    window.__svgBlobCreated = [];
    window.__svgBlobRevoked = [];
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = blob => { const url = create(blob); window.__svgBlobCreated.push({ url, type: blob.type }); return url; };
    URL.revokeObjectURL = url => { window.__svgBlobRevoked.push(url); revoke(url); };
  });
  const downloads = [];
  page.on('request', request => { if (/\/attachments\/\d+\/download(?:\?|$)/u.test(request.url())) downloads.push(request.url()); });
  await page.goto('/web/app');
  await page.locator('input[name="username"]').fill('yuance_admin');
  await page.locator('input[name="password"]').fill('Yuance@2026Dev!');
  await Promise.all([page.waitForURL(url => !url.pathname.startsWith('/web/login')), page.getByRole('button', { name: '登录' }).click()]);
  onLoggedIn?.();
  await page.goto('/web/app/projects/YCE/resources/901');
  return downloads;
}

for (const encrypted of [false, true]) {
  test(`inline SVG uses controlled ${encrypted ? 'encrypted' : 'legacy plain'} preview for figure and bare img`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const downloads = await fixture(page, { encrypted, onLoggedIn: () => {
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    } });
    const content = page.locator('.resource-rich-body');
    for (const name of ['容器SVG', '裸SVG']) {
      const image = content.getByRole('img', { name });
      await expect(image).toBeVisible();
      await expect.poll(() => image.evaluate(node => node.naturalWidth)).toBe(320);
      expect(await image.evaluate(node => node.naturalHeight)).toBe(160);
      expect(await image.getAttribute('src')).toMatch(/^blob:/u);
    }
    const created = await page.evaluate(() => window.__svgBlobCreated);
    expect(created).toHaveLength(2);
    expect(created.every(entry => entry.type === 'image/svg+xml')).toBe(true);
    expect(downloads).toEqual([]);
    expect(errors).toEqual([]);
    await content.getByRole('img', { name: '裸SVG' }).click();
    const preview = page.locator('.attachment-preview-modal[open]');
    await expect.poll(() => preview.locator('img').evaluate(node => node.naturalWidth)).toBe(320);
    await preview.getByRole('button', { name: '关闭媒体预览', exact: true }).click();
    await page.getByRole('link', { name: '返回资料库', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__svgBlobRevoked.length)).toBe(3);
  });
}

test('inline SVG forbidden preview shows failure without falling back to download', async ({ page }) => {
  const downloads = await fixture(page, { failure: true });
  await expect(page.locator('.resource-rich-body').getByText('图片加载失败')).toHaveCount(2);
  expect(downloads).toEqual([]);
  expect(await page.evaluate(() => window.__svgBlobCreated)).toEqual([]);
});

test('inline SVG corrupt encrypted checksum fails before creating image sources', async ({ page }) => {
  const downloads = await fixture(page, { encrypted: true, corrupt: true });
  await expect(page.locator('.resource-rich-body').getByText('图片加载失败')).toHaveCount(2);
  expect(downloads).toEqual([]);
  expect(await page.evaluate(() => window.__svgBlobCreated)).toEqual([]);
});

test('inline SVG releases sources that finish loading after leaving the resource', async ({ page }) => {
  let release;
  let requested = 0;
  const pending = new Promise(resolve => { release = resolve; });
  await fixture(page, { waitForContent: () => { requested += 1; return pending; } });
  await expect.poll(() => requested).toBe(2);
  await page.getByRole('link', { name: '返回资料库', exact: true }).click();
  release();
  await expect.poll(() => page.evaluate(() => window.__svgBlobRevoked.length)).toBe(2);
  expect(await page.evaluate(() => window.__svgBlobCreated.length)).toBe(2);
});

test('real CLI encrypted SVG upload, HTML save/read and logged-in body display', async ({ page, baseURL }, testInfo) => {
  test.setTimeout(120000);
  expect(new URL(baseURL).hostname).toBe('127.0.0.1');
  await page.goto('/web/app');
  await page.locator('input[name="username"]').fill('yuance_admin');
  await page.locator('input[name="password"]').fill('Yuance@2026Dev!');
  await Promise.all([page.waitForURL(url => !url.pathname.startsWith('/web/login')), page.getByRole('button', { name: '登录' }).click()]);
  const csrf = (await (await page.request.get('/api/v1/auth/csrf')).json()).data.csrf_token;
  const headers = { 'x-yuance-csrf-token': csrf };
  const storageResponse = await page.request.post('/api/v1/storage/config', { headers, data: {
    endpoint: 'memory://yuance-tests', region: 'test', bucket: 'svg-e2e',
    access_key_id: 'test-access-key', access_key_secret: 'test-access-secret', activate: true,
  } });
  expect(storageResponse.status()).toBe(201);
  const response = await page.request.post('/api/v1/projects/YCE/resources', { headers, data: { title: `SVG真实验收-${Date.now()}`, body: '<h2>图片验收</h2>', body_format: 'html' } });
  expect(response.status()).toBe(201);
  const resource = (await response.json()).data;
  const tokenResponse = await page.request.post('/api/v1/me/tokens', { headers, data: { name: `SVG测试-${Date.now()}`, scopes: ['project:read', 'resource:read', 'resource:write'], project_scope: 'YCE' } });
  expect(tokenResponse.status()).toBe(201);
  const token = (await tokenResponse.json()).data;
  const env = { ...process.env, YUANCE_BASE_URL: baseURL, YUANCE_API_TOKEN: token.raw_token };
  const binary = fileURLToPath(new URL('../../target/debug/yuance-agent', import.meta.url));
  const run = promisify(execFile);
  const directory = await mkdtemp(join(tmpdir(), 'yuance-svg-e2e-'));
  const path = join(directory, 'diagram.svg');
  const member = `/api/v1/projects/YCE/resources/${resource.id}`;
  const ids = [];
  try {
    await writeFile(path, svg);
    for (let index = 0; index < 4; index += 1) {
      const { stdout } = await run(binary, ['resources', 'attachments', 'upload', '--project-key', 'YCE', '--resource-id', String(resource.id), '--file', path], { env });
      const uploaded = JSON.parse(stdout).data;
      expect(uploaded.status).toBe('uploaded');
      expect(uploaded.content_type).toBe('image/svg+xml');
      ids.push(uploaded.id);
    }
    const body = '<h2>图片验收</h2>' + ids.map((id, index) => {
      const image = `<img ${index % 2 ? `data-yuance-attachment-id="${id}" ` : ''}src="/web/projects/YCE/resources/${resource.id}/attachments/${id}/download" alt="实际SVG ${index}">`;
      return index % 2 ? `<p>${image}</p>` : `<figure data-yuance-attachment-id="${id}" data-yuance-attachment-kind="image" data-yuance-align="left">${image}</figure>`;
    }).join('');
    const bodyPath = join(directory, 'body.html');
    await writeFile(bodyPath, body);
    await run(binary, ['resources', 'update', '--project-key', 'YCE', '--resource-id', String(resource.id), '--body-file', bodyPath, '--body-format', 'html'], { env });
    const { stdout } = await run(binary, ['resources', 'get', '--project-key', 'YCE', '--resource-id', String(resource.id)], { env });
    const saved = JSON.parse(stdout).data;
    for (const id of ids) expect(saved.body).toContain(`data-yuance-attachment-id="${id}"`);
    await writeFile(bodyPath, saved.body);
    const resaved = await run(binary, ['resources', 'update', '--project-key', 'YCE', '--resource-id', String(resource.id), '--body-file', bodyPath, '--body-format', 'html'], { env });
    expect(JSON.parse(resaved.stdout).data.body).toBe(saved.body);
    await run(binary, ['resources', 'attachments', 'download', '--project-key', 'YCE', '--resource-id', String(resource.id), '--attachment-id', String(ids[0]), '--output', join(directory, 'download.svg')], { env });
    expect(await readFile(join(directory, 'download.svg'), 'utf8')).toBe(svg);
    const requests = [];
    const errors = [];
    const previewResponses = [];
    page.on('request', request => { if (/\/attachments\/\d+\/download(?:\?|$)/u.test(request.url())) requests.push(request.url()); });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('response', response => {
      if (response.url().includes(`${member}/attachments/`) && response.url().includes('/preview/content?client_decrypt=1')) previewResponses.push({ status: response.status(), contentType: response.headers()['content-type'] });
    });
    await page.goto(`/web/app/projects/YCE/resources/${resource.id}`);
    for (let index = 0; index < 4; index += 1) {
      const image = page.locator('.resource-rich-body').getByRole('img', { name: `实际SVG ${index}`, exact: true });
      await expect(image).toBeVisible();
      await expect.poll(() => image.evaluate(node => node.naturalWidth)).toBe(320);
      expect(await image.evaluate(node => node.naturalHeight)).toBe(160);
      expect(await image.getAttribute('src')).toMatch(/^blob:/u);
      expect(await image.evaluate(async node => (await fetch(node.src)).headers.get('content-type'))).toBe('image/svg+xml');
    }
    expect(requests).toEqual([]);
    expect(errors).toEqual([]);
    expect(previewResponses).toHaveLength(4);
    expect(previewResponses.every(response => response.status === 200 && response.contentType.includes('application/json'))).toBe(true);
    await testInfo.attach('real-four-svg-images', { body: await page.screenshot(), contentType: 'image/png' });
  } finally {
    const cleanupStatuses = [];
    try {
      cleanupStatuses.push((await page.request.patch(member, { headers, data: { body: '<p>验收完毕</p>', body_format: 'html' } })).status());
      for (const id of ids) {
        const latestResponse = await page.request.get(member);
        cleanupStatuses.push(latestResponse.status());
        const latest = (await latestResponse.json()).data;
        cleanupStatuses.push((await page.request.delete(`${member}/attachments/${id}`, { headers: { ...headers, 'if-match': latest.updated_at } })).status());
      }
      cleanupStatuses.push((await page.request.delete(member, { headers })).status());
    } finally {
      try {
        cleanupStatuses.push((await page.request.delete(`/api/v1/me/tokens/${token.token.id}`, { headers })).status());
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }
    expect(cleanupStatuses.every(status => status >= 200 && status < 300)).toBe(true);
  }
});
