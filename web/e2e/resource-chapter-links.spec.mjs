import { expect, test } from '@playwright/test';

const sectionId = 'yuance-section-sql-310';
const prefix = '/api/v1/projects/YCE/resources';

async function login(page) {
  await page.goto('/web/app/projects/YCE');
  await page.locator('input[name="username"]').fill('yuance_admin');
  await page.locator('input[name="password"]').fill('Yuance@2026Dev!');
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/web/login')),
    page.getByRole('button', { name: '登录' }).click(),
  ]);
}

test('real OpenAPI roundtrip, editor and body/outline clicks share stable chapter targets', async ({ page }, testInfo) => {
  await login(page);
  const csrf = (await (await page.request.get('/api/v1/auth/csrf')).json()).data.csrf_token;
  const tokenResponse = await page.request.post('/api/v1/me/tokens', {
    headers: { 'x-yuance-csrf-token': csrf },
    data: { name: `章节测试-${Date.now()}`, scopes: ['project:read', 'resource:read', 'resource:write'], project_scope: 'YCE' },
  });
  expect(tokenResponse.status()).toBe(201);
  const token = (await tokenResponse.json()).data;
  const headers = { Authorization: `Bearer ${token.raw_token}` };
  let resourceId;
  try {
    const filler = '<p>对账测试说明与源表映射，正文滚动验证。</p>'.repeat(65);
    const body = `<h2>测试手册</h2><table><tbody><tr><td>源表映射</td><td><a href="#${sectionId}">见 3.10</a></td></tr></tbody></table><p><a href="#${sectionId}">正文目录 3.10</a></p><p>插入引用文字</p><p><a href="#yuance-section-deleted">已删除章节</a> <a href="https://example.invalid/manual#${sectionId}">外部资料</a></p>${filler}<h3 data-yuance-section-id="${sectionId}" id="location" onclick="alert(1)">3.10 SQL 对账</h3><p>SELECT count(*) FROM source;</p><h3 data-yuance-section-id="${sectionId}">3.10 SQL 对账</h3><h6>补充对账</h6>${filler}<a href="javascript:alert(1)">不安全链接</a><script>alert(1)</script>`;
    const createdResponse = await page.request.post(prefix, { headers, data: { title: 'BI 一期章节验收', body, body_format: 'html' } });
    expect(createdResponse.status()).toBe(201);
    resourceId = (await createdResponse.json()).data.id;
    const endpoint = `${prefix}/${resourceId}`;
    const read = async () => {
      const response = await page.request.get(endpoint, { headers });
      expect(response.status()).toBe(200);
      return (await response.json()).data;
    };
    let saved = await read();
    expect(saved.body).toContain(`data-yuance-section-id="${sectionId}"`);
    expect(saved.body.match(/data-yuance-section-id="([^"]+)"/gu)).toHaveLength(4);
    expect(new Set([...saved.body.matchAll(/data-yuance-section-id="([^"]+)"/gu)].map((match) => match[1])).size).toBe(4);
    expect(saved.body).not.toMatch(/onclick|id="location"|javascript:|<script/u);
    expect(saved.body_html).toContain(`href="#${sectionId}"`);
    await page.goto(`/web/app/projects/YCE/resources/${resourceId}`);
    const content = page.locator('.resource-rich-body .yc-rich-text-content');
    const target = content.locator(`[data-yuance-section-id="${sectionId}"]`);
    const outline = page.getByRole('navigation', { name: '正文目录' });
    await expect(target).toBeVisible();
    const startingPageTop = await page.evaluate(() => window.scrollY);
    await content.getByRole('link', { name: '见 3.10', exact: true }).click();
    const firstTop = await content.evaluate((node) => node.scrollTop);
    expect(firstTop).toBeGreaterThan(500);
    const margin = await target.evaluate((node) => node.getBoundingClientRect().top - node.closest('.yc-rich-text-content').getBoundingClientRect().top);
    expect(margin).toBeGreaterThanOrEqual(22);
    expect(margin).toBeLessThanOrEqual(26);
    await outline.locator(`a[href="#${sectionId}"]`).click();
    expect(await content.evaluate((node) => node.scrollTop)).toBeCloseTo(firstTop, 0);
    expect(await page.evaluate(() => window.scrollY)).toBe(startingPageTop);
    await content.evaluate((node) => node.scrollTo(0, 0));
    await content.getByRole('link', { name: '正文目录 3.10' }).click();
    expect(await content.evaluate((node) => node.scrollTop)).toBeCloseTo(firstTop, 0);
    await content.evaluate((node) => node.scrollTo(0, 0));
    const hash = new URL(page.url()).hash;
    const invalid = content.getByRole('link', { name: '已删除章节' });
    await expect(invalid).toHaveAttribute('aria-disabled', 'true');
    await invalid.click({ force: true });
    await expect(page.getByRole('status').filter({ hasText: '目标章节不存在或已删除' })).toBeVisible();
    expect(new URL(page.url()).hash).toBe(hash);
    expect(await content.evaluate((node) => node.scrollTop)).toBe(0);
    const externalIntercepted = await content.getByRole('link', { name: '外部资料' }).evaluate((node) => {
      let intercepted;
      const listener = (event) => { intercepted = event.defaultPrevented; event.preventDefault(); };
      node.ownerDocument.addEventListener('click', listener, { once: true });
      node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return intercepted;
    });
    expect(externalIntercepted).toBe(false);

    await page.getByRole('button', { name: '编辑资料' }).click();
    const dialog = page.getByRole('dialog', { name: '编辑项目资料' });
    const editor = dialog.getByLabel('资料正文');
    await editor.evaluate((node) => {
      const paragraph = [...node.querySelectorAll('p')].find((p) => p.textContent === '插入引用文字');
      const range = node.ownerDocument.createRange();
      range.selectNodeContents(paragraph);
      const selection = node.ownerDocument.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      node.focus();
    });
    await dialog.getByRole('button', { name: '插入章节链接' }).click();
    await dialog.getByRole('combobox', { name: '选择目标章节' }).selectOption(sectionId);
    await expect(editor.locator(`a[href="#${sectionId}"]`).filter({ hasText: '插入引用文字' })).toHaveCount(1);
    const updateResponse = page.waitForResponse((response) => response.url().endsWith(endpoint) && response.request().method() === 'PATCH');
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    expect((await updateResponse).status()).toBe(200);
    saved = await read();
    expect(saved.body).toMatch(new RegExp(`href="#${sectionId}"[^>]*>插入引用文字</a>`, 'u'));

    // 真正的 PAT PATCH 改名并重排，保留原标识；随后删除目标验证不误绑同名标题。
    const renamedBody = saved.body.replace(`>3.10 SQL 对账</h3>`, '>3.10 新名称</h3>');
    const changed = await page.request.patch(endpoint, { headers, data: { body: `<h2>新增前置标题</h2>${renamedBody}`, body_format: 'html' } });
    expect(changed.status()).toBe(200);
    saved = await read();
    expect(saved.body).toContain(`data-yuance-section-id="${sectionId}">3.10 新名称</h3>`);
    await page.reload();
    await content.getByRole('link', { name: '见 3.10', exact: true }).click();
    await expect(target).toHaveText('3.10 新名称');
    await testInfo.attach('real-resource-chapter-jump', { body: await page.screenshot(), contentType: 'image/png' });
    const deletedBody = saved.body.replace(new RegExp(`<h3 data-yuance-section-id="${sectionId}">[^<]*</h3>`, 'u'), '');
    expect((await page.request.patch(endpoint, { headers, data: { body: deletedBody, body_format: 'html' } })).status()).toBe(200);
    await page.reload();
    await expect(content.locator(`[data-yuance-section-id="${sectionId}"]`)).toHaveCount(0);
    await expect(content.getByRole('link', { name: '见 3.10', exact: true })).toHaveAttribute('aria-disabled', 'true');
  } finally {
    if (resourceId) await page.request.delete(`${prefix}/${resourceId}`, { headers });
    await page.request.delete(`/api/v1/me/tokens/${token.token.id}`, { headers: { 'x-yuance-csrf-token': csrf } });
  }
});
