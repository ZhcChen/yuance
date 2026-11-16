import { expect, test } from '@playwright/test';

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

test('requirement create editor accepts dropped files and toolbar uploads', async ({ page }) => {
  await login(page, '/web/app/tasks');
  await ensureCurrentProject(page, 'YCE');
  await page.goto('/web/app/requirements');

  const attachmentCreates = [];
  const uploadStages = [];
  const primaryPostUpdates = [];
  let nextAttachmentId = 9100;
  await page.route('**/api/v1/work-items/*/primary-post', async (route) => {
    if (route.request().method() !== 'PATCH') {
      await route.continue();
      return;
    }
    primaryPostUpdates.push(route.request().postDataJSON().body);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { id: 3, body: '', body_format: 'html' } }),
    });
  });
  await page.route('**/api/v1/test-storage/upload**', async (route) => {
    uploadStages.push(`put:${new URL(route.request().url()).searchParams.get('target')}`);
    await route.fulfill({ status: 200, body: '' });
  });
  await page.route('**/api/v1/work-items/*/comments/*/attachments', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    const payload = route.request().postDataJSON();
    const created = {
      id: nextAttachmentId++,
      filename: payload.original_filename,
      content_type: payload.content_type,
      byte_size: payload.byte_size,
      status: 'pending',
      created_by: '系统管理员',
      created_at: '2026-08-11T00:00:00Z',
    };
    attachmentCreates.push({ payload, created });
    uploadStages.push(`create:comment:${created.id}`);
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: created }) });
  });
  await page.route('**/api/v1/work-items/*/comments/*/attachments/*/upload-url', async (route) => {
    const parts = new URL(route.request().url()).pathname.split('/');
    const attachmentId = Number(parts[parts.length - 2]);
    uploadStages.push(`sign:comment:${attachmentId}`);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          attachment: { ...attachmentCreates.find((entry) => entry.created.id === attachmentId).created },
          request: { method: 'PUT', url: `/api/v1/test-storage/upload?target=comment-${attachmentId}`, headers: [] },
          expires_in_seconds: 600,
        },
      }),
    });
  });
  await page.route('**/api/v1/work-items/*/comments/*/attachments/*/uploaded', async (route) => {
    const parts = new URL(route.request().url()).pathname.split('/');
    const attachmentId = Number(parts[parts.length - 2]);
    uploadStages.push(`mark:comment:${attachmentId}`);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: { ...attachmentCreates.find((entry) => entry.created.id === attachmentId).created, status: 'uploaded' },
      }),
    });
  });

  await page.getByRole('button', { name: '新建需求' }).click();
  const dialog = page.getByRole('dialog', { name: '新建需求' });
  await dialog.locator('#work-item-create-title').fill('拖拽与按钮上传验收');
  const editor = dialog.getByRole('textbox', { name: '说明内容' });
  await editor.fill('拖拽前的内容');

  const dataTransfer = await page.evaluateHandle(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array([137, 80, 78, 71])], 'dropped.png', { type: 'image/png' }));
    return transfer;
  });
  await editor.dispatchEvent('dragenter', { dataTransfer });
  await editor.dispatchEvent('dragover', { dataTransfer });
  await expect(editor).toHaveClass(/is-file-drag-over/);
  await editor.dispatchEvent('drop', { dataTransfer });
  await expect(editor).not.toHaveClass(/is-file-drag-over/);
  await expect.poll(() => attachmentCreates.length).toBe(1);
  expect(attachmentCreates[0].payload.original_filename).toBe('dropped.png');
  await expect(editor.locator('figure[data-yuance-attachment-id="9100"] img')).toBeVisible();
  await expect(editor).toContainText('拖拽前的内容');

  const uploadButton = dialog.getByRole('button', { name: '上传附件' });
  await expect(uploadButton).toBeEnabled();
  const chooserPromise = page.waitForEvent('filechooser');
  await uploadButton.click();
  const chooser = await chooserPromise;
  expect(chooser.isMultiple()).toBe(true);
  await chooser.setFiles({ name: 'spec.txt', mimeType: 'text/plain', buffer: Buffer.from('spec') });
  await expect.poll(() => attachmentCreates.length).toBe(2);
  expect(attachmentCreates[1].payload.original_filename).toBe('spec.txt');
  await expect(editor.locator('a[data-yuance-attachment-id="9101"][data-yuance-attachment-kind="file"]')).toBeVisible();
  await expect.poll(() => primaryPostUpdates.at(-1) || '').toContain('data-yuance-attachment-id="9101"');
  expect(primaryPostUpdates.at(-1)).toContain('data-yuance-attachment-id="9100"');
  await expect(editor).toContainText('拖拽前的内容');
  await expect(editor.getByRole('img', { name: 'dropped.png' })).toHaveCount(1);
});
