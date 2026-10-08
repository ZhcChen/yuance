import { expect, test } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cliPath = fileURLToPath(new URL('../../target/debug/yuance-agent', import.meta.url));

function cli(args, input, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(cliPath, args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
    const output = [];
    const errors = [];
    child.stdout.on('data', (chunk) => output.push(chunk));
    child.stderr.on('data', (chunk) => errors.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) { reject(new Error(`CLI exited ${code}: ${Buffer.concat(errors).toString('utf8')}`)); return; }
      try { resolve(JSON.parse(Buffer.concat(output).toString('utf8'))); } catch (error) { reject(error); }
    });
    child.stdin.end(input);
  });
}

test('long manual OpenAPI, Web editor and CLI preserve full content and stable chapters', async ({ page, baseURL }, testInfo) => {
  test.setTimeout(180000);
  expect(new URL(baseURL).hostname).toBe('127.0.0.1');
  await page.goto('/web/app');
  await page.locator('input[name="username"]').fill('yuance_admin');
  await page.locator('input[name="password"]').fill('Yuance@2026Dev!');
  await Promise.all([page.waitForURL((url) => !url.pathname.startsWith('/web/login')), page.getByRole('button', { name: '登录' }).click()]);
  const csrf = (await (await page.request.get('/api/v1/auth/csrf')).json()).data.csrf_token;
  const cookieHeaders = { 'x-yuance-csrf-token': csrf };
  const projectResponse = await page.request.post('/api/v1/projects', { headers: cookieHeaders, data: { name: `长正文验收-${Date.now()}` } });
  expect(projectResponse.status()).toBe(201);
  const projectKey = (await projectResponse.json()).data.key;
  expect(typeof projectKey).toBe('string');
  const prefix = `/api/v1/projects/${projectKey}/resources`;
  const tokenResponse = await page.request.post('/api/v1/me/tokens', { headers: cookieHeaders, data: { name: `长正文测试-${Date.now()}`, scopes: ['project:read', 'resource:read', 'resource:write'], project_scope: projectKey } });
  expect(tokenResponse.status()).toBe(201);
  const token = (await tokenResponse.json()).data;
  const headers = { Authorization: `Bearer ${token.raw_token}` };
  const ids = [];
  const read = async (id) => {
    const r = await page.request.get(`${prefix}/${id}`, { headers });
    expect(r.status()).toBe(200);
    return (await r.json()).data;
  };
  try {
    // 输入恰为49363字符，补章节属性后越过旧上限，必须仍可重存。
    const headings = '<h2>中文章节</h2>'.repeat(100);
    const expandedInput = `${headings}<p>${'中'.repeat(49363 - headings.length - 7)}</p>`;
    expect(expandedInput.length).toBe(49363);
    const oldResponse = await page.request.post(prefix, { headers, data: { title: '属性扩容复现', body: expandedInput, body_format: 'html' } });
    expect(oldResponse.status()).toBe(201);
    const oldId = (await oldResponse.json()).data.id;
    ids.push(oldId);
    const expanded = await read(oldId);
    expect(expanded.body.length).toBeGreaterThan(50000);
    expect(expanded.body).toContain(expandedInput.slice(headings.length));
    const resave = await page.request.patch(`${prefix}/${oldId}`, { headers, data: { body: expanded.body, body_format: 'html' } });
    expect(resave.status()).toBe(200);
    expect((await read(oldId)).body).toBe(expanded.body);

    const sectionId = 'yuance-section-sql-310';
    const sql = '-- 中文注释：源表与目标表完整对账\nSELECT source_id, COUNT(*) FROM source_table GROUP BY source_id;\n';
    const sqlBlock = `<pre><code>${sql.repeat(45)}</code></pre>`;
    const entries = Array.from({ length: 60 }, (_, index) => `<p><a href="#${sectionId}">对账引用 ${index}</a></p><h3 data-yuance-section-id="yuance-section-chapter-${index}">详细章节 ${index}</h3>${sqlBlock}`).join('');
    const body = `<h2 data-yuance-section-id="yuance-section-start">源表映射</h2><table><tbody><tr><td><a href="#${sectionId}">见 3.10</a></td></tr></tbody></table><p>编辑注释位置</p>${entries}<h3 data-yuance-section-id="${sectionId}">3.10 SQL 对账</h3><p>完整尾部中文标记</p>`;
    expect(body.length).toBeGreaterThan(128 * 1024);
    const createdResponse = await page.request.post(prefix, { headers, data: { title: '长 BI 手册本机验收', body, body_format: 'html' } });
    expect(createdResponse.status()).toBe(201);
    const id = (await createdResponse.json()).data.id;
    ids.push(id);
    let saved = await read(id);
    expect(saved.body.replace(/ rel="noopener noreferrer"/gu, '') === body).toBe(true);
    expect(saved.body.match(/<pre><code>/gu)).toHaveLength(60);
    expect(saved.body.match(/data-yuance-section-id=/gu)).toHaveLength(62);
    await page.goto(`/web/app/projects/${projectKey}/resources/${id}`);
    const content = page.locator('.resource-rich-body .yc-rich-text-content');
    await expect(content.getByText('完整尾部中文标记')).toHaveCount(1);
    await content.getByRole('link', { name: '见 3.10', exact: true }).click();
    const top = await content.evaluate((node) => node.scrollTop);
    expect(top).toBeGreaterThan(1000);
    await page.getByRole('navigation', { name: '正文目录' }).locator(`a[href="#${sectionId}"]`).click();
    expect(await content.evaluate((node) => node.scrollTop)).toBeCloseTo(top, 0);
    await page.getByRole('button', { name: '编辑资料' }).click();
    const dialog = page.getByRole('dialog', { name: '编辑项目资料' });
    const editor = dialog.getByLabel('资料正文');
    await editor.evaluate((node) => {
      const text = [...node.querySelectorAll('p')].find((paragraph) => paragraph.textContent === '编辑注释位置').firstChild;
      const range = node.ownerDocument.createRange();
      range.selectNodeContents(text);
      node.focus();
      const selection = node.ownerDocument.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await page.keyboard.insertText('已通过 Web 修改一句 SQL 注释');
    const update = page.waitForResponse((response) => response.url().endsWith(`${prefix}/${id}`) && response.request().method() === 'PATCH');
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    expect((await update).status()).toBe(200);
    saved = await read(id);
    expect(saved.body).toContain('已通过 Web 修改一句 SQL 注释');
    expect(saved.body).toContain('完整尾部中文标记');
    expect(saved.body.match(/SELECT source_id, COUNT\(\*\) FROM source_table GROUP BY source_id;/gu)).toHaveLength(2700);
    expect(saved.body.match(/<pre><code>/gu)).toHaveLength(60);
    expect(saved.body.match(/data-yuance-section-id=/gu)).toHaveLength(62);
    expect(saved.body.match(new RegExp(`href="#${sectionId}"`, 'gu'))).toHaveLength(61);
    const apiEdit = saved.body.replace('已通过 Web 修改一句 SQL 注释', '已通过 OpenAPI 修改一句 SQL 注释');
    expect((await page.request.patch(`${prefix}/${id}`, { headers, data: { body: apiEdit } })).status()).toBe(200);
    expect((await read(id)).body).toBe(apiEdit);
    await testInfo.attach('long-resource-web', { body: await page.screenshot(), contentType: 'image/png' });

    const env = { ...process.env, YUANCE_BASE_URL: baseURL, YUANCE_API_TOKEN: token.raw_token, YUANCE_MAX_RESPONSE_BYTES: '134217728' };
    const cliUpdated = await cli(['resources', 'update', '--project-key', projectKey, '--resource-id', String(id), '--body-file', '-', '--body-format', 'html'], apiEdit.replace('OpenAPI 修改', 'CLI 修改'), env);
    expect(cliUpdated.data.body).toContain('已通过 CLI 修改一句 SQL 注释');
    const cliRead = await cli(['resources', 'get', '--project-key', projectKey, '--resource-id', String(id)], undefined, env);
    expect(cliRead.data.body).toBe(cliUpdated.data.body);

    // 回包含正文双份，超过旧CLI 8MiB响应保护；请求也超过旧应用2MiB。
    const plain = `${'-- 中文 SQL\nSELECT id FROM source;\n'.repeat(140000)}尾部不可截断`;
    const cliCreated = await cli(['resources', 'create', '--project-key', projectKey, '--title', 'CLI 大正文完整性', '--body-file', '-', '--body-format', 'plain'], plain, env);
    ids.push(cliCreated.data.id);
    expect(cliCreated.data.body).toBe(plain);
    const cliLargeRead = await cli(['resources', 'get', '--project-key', projectKey, '--resource-id', String(cliCreated.data.id)], undefined, env);
    expect(cliLargeRead.data.body).toBe(plain);
    const cliLargeUpdate = await cli(['resources', 'update', '--project-key', projectKey, '--resource-id', String(cliCreated.data.id), '--body-file', '-', '--body-format', 'plain'], `${plain}\n新 SQL 注释`, env);
    expect(cliLargeUpdate.data.body).toBe(`${plain}\n新 SQL 注释`);
    expect((await read(cliCreated.data.id)).body).toBe(`${plain}\n新 SQL 注释`);
    console.log(`长正文实测：输入扩容案例=${expandedInput.length} -> ${expanded.body.length}字符；HTML=${body.length}字符；CLI纯文本=${plain.length}字符/${Buffer.byteLength(plain)}字节。`);
  } finally {
    for (const id of ids) expect((await page.request.delete(`${prefix}/${id}`, { headers })).status()).toBe(200);
    expect((await page.request.delete(`/api/v1/me/tokens/${token.token.id}`, { headers: cookieHeaders })).status()).toBe(200);
    await page.request.patch(`/api/v1/projects/${projectKey}`, { headers: cookieHeaders, data: { status: 'archived' } });
  }
});
