import { expect, test } from '@playwright/test';

// 新建需求：拖拽与工具栏「附件」上传无需标题，取消新建会删除草稿附件。真实接口 + 内存对象存储。

async function login(page, entryPath) {
  await page.goto(entryPath);
  await expect(page).toHaveURL(/\/web\/login/);
  await page.locator('input[name="username"]').fill('yuance_admin');
  await page.locator('input[name="password"]').fill('Yuance@2026Dev!');
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/web/login')),
    page.getByRole('button', { name: '登录' }).click(),
  ]);
}

async function ensureCurrentProject(page, projectKey) {
  await page.goto('/web/app/projects');
  await expect(page.getByRole('heading', { level: 1, name: '项目' })).toBeVisible();
  await page.getByLabel('每页').selectOption('20');
  const row = page.locator('.project-row', { hasText: projectKey });
  const currentButton = row.getByRole('button', { name: '当前项目', exact: true });
  if (await currentButton.count()) return;
  await row.getByRole('button', { name: '设为当前项目' }).click();
  await expect(row.getByRole('button', { name: '当前项目', exact: true })).toBeVisible();
}

async function ensureMemoryStorage(page) {
  const csrf = (await (await page.request.get('/api/v1/auth/csrf')).json()).data.csrf_token;
  const response = await page.request.post('/api/v1/storage/config', {
    headers: { 'x-yuance-csrf-token': csrf },
    data: { endpoint: 'memory://yuance-tests', region: 'test', bucket: 'draft-e2e', access_key_id: 'test-access-key', access_key_secret: 'test-access-secret', activate: true },
  });
  expect(response.status()).toBeLessThan(300);
}

async function dropFile(page, editor, name, type, bytes) {
  const dataTransfer = await page.evaluateHandle(({ name, type, bytes }) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(bytes)], name, { type }));
    return transfer;
  }, { name, type, bytes });
  await editor.dispatchEvent('dragenter', { dataTransfer });
  await editor.dispatchEvent('dragover', { dataTransfer });
  await expect(editor).toHaveClass(/is-file-drag-over/);
  await editor.dispatchEvent('drop', { dataTransfer });
  await expect(editor).not.toHaveClass(/is-file-drag-over/);
}

test('requirement create accepts dropped and toolbar uploads without a title', async ({ page }) => {
  await login(page, '/web/app/tasks');
  await ensureCurrentProject(page, 'YCE');
  await ensureMemoryStorage(page);
  await page.goto('/web/app/requirements');

  await page.getByRole('button', { name: '新建需求' }).click();
  const dialog = page.getByRole('dialog', { name: '新建需求' });
  const editor = dialog.getByRole('textbox', { name: '说明内容' });
  await editor.fill('拖拽前的内容');

  await dropFile(page, editor, 'dropped.png', 'image/png', [137, 80, 78, 71]);
  await expect(editor.locator('figure[data-yuance-attachment-id] img[src*="/work-item-draft-attachments/"]')).toHaveCount(1);

  const chooserPromise = page.waitForEvent('filechooser');
  await dialog.getByRole('button', { name: '上传附件' }).click();
  const chooser = await chooserPromise;
  expect(chooser.isMultiple()).toBe(true);
  await chooser.setFiles({ name: '待解决的问题.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
  const fileLink = editor.locator('a[data-yuance-attachment-kind="file"][href*="/work-item-draft-attachments/"]');
  await expect(fileLink).toHaveCount(1);
  await expect(editor.locator('[data-rich-pending-upload]')).toHaveCount(0);
  await expect(editor).toContainText('拖拽前的内容');
  await expect(dialog.locator('#work-item-create-title')).toHaveValue('');

  await dialog.locator('#work-item-create-title').fill('拖拽与按钮上传验收');
  await dialog.getByRole('button', { name: '创建' }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/YCE-REQ-\d+/u);
  const itemKey = page.url().match(/YCE-REQ-\d+/u)[0];
  const view = (await (await page.request.get(`/api/v1/work-item-detail-view/${itemKey}`)).json()).data;
  expect(view.primary_post.body).not.toContain('work-item-draft-attachments');
  expect(view.primary_post.body).toContain('拖拽前的内容');
  expect(view.primary_post.body.match(/\/comments\/\d+\/attachments\/\d+\/download/gu)).toHaveLength(2);
});

test('cancelling create deletes uploaded draft attachments', async ({ page }) => {
  await login(page, '/web/app/tasks');
  await ensureCurrentProject(page, 'YCE');
  await ensureMemoryStorage(page);
  await page.goto('/web/app/requirements');
  const deletes = [];
  page.on('request', (request) => {
    if (request.method() === 'DELETE' && request.url().includes('/work-item-draft-attachments/')) deletes.push(request.url());
  });

  await page.getByRole('button', { name: '新建需求' }).click();
  const dialog = page.getByRole('dialog', { name: '新建需求' });
  const editor = dialog.getByRole('textbox', { name: '说明内容' });
  await dropFile(page, editor, 'discard.png', 'image/png', [137, 80, 78, 71]);
  const draft = editor.locator('figure[data-yuance-attachment-id] img[src*="/work-item-draft-attachments/"]');
  await expect(draft).toHaveCount(1);
  const draftSrc = await draft.getAttribute('src');

  await dialog.getByRole('button', { name: '取消' }).click();
  await page.getByRole('button', { name: '放弃并关闭' }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => deletes.length).toBe(1);
  await expect.poll(async () => (await page.request.get(draftSrc, { maxRedirects: 0 })).status()).toBe(404);
});
