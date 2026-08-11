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
  const row = page.locator('.project-row', { hasText: projectKey });
  const currentButton = row.getByRole('button', { name: '当前项目', exact: true });
  if (await currentButton.count()) return;
  await row.getByRole('button', { name: '设为当前项目' }).click();
  await expect(row.getByRole('button', { name: '当前项目', exact: true })).toBeVisible();
}

test('work item create pastes before title and auto-uploads after title', async ({ page }) => {
  await login(page, '/web/app/tasks');
  await ensureCurrentProject(page, 'YCE');
  await page.goto('/web/app/bugs');

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
    await route.continue();
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
          attachment: { id: attachmentId, filename: 'pasted.png', content_type: 'image/png', byte_size: 4, status: 'pending', created_by: '系统管理员', created_at: '2026-08-11T00:00:00Z' },
          request: { method: 'PUT', url: `/api/v1/test-storage/upload?target=comment-${attachmentId}`, headers: [['content-type', 'image/png']] },
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
        data: { id: attachmentId, filename: 'pasted.png', content_type: 'image/png', byte_size: 4, status: 'uploaded', created_by: '系统管理员', created_at: '2026-08-11T00:00:00Z' },
      }),
    });
  });

  await page.getByRole('button', { name: '新建 Bug' }).click();
  const dialog = page.getByRole('dialog', { name: '新建 Bug' });
  const editor = dialog.getByRole('textbox', { name: '说明内容' });
  await editor.click();
  await editor.evaluate((element) => {
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'pasted.png', { type: 'image/png' });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: dataTransfer });
    element.dispatchEvent(event);
  });
  await expect(dialog).toContainText('图片已加入正文，填写标题后将自动上传。');
  await expect(editor.getByRole('img', { name: 'pasted.png' })).toBeVisible();
  expect(attachmentCreates).toHaveLength(0);

  await dialog.locator('#work-item-create-title').fill('自动上传粘贴图片验收');
  await expect.poll(() => attachmentCreates.length).toBe(1);
  expect(attachmentCreates[0].payload.original_filename).toBe('pasted.png');
  expect(attachmentCreates[0].payload.content_type).toBe('image/png');
  await expect(editor.getByRole('img', { name: 'pasted.png' })).toBeVisible();
  expect(uploadStages).toContain('put:comment-9100');
  expect(uploadStages).toContain('mark:comment:9100');
  await expect.poll(() => primaryPostUpdates.length).toBeGreaterThanOrEqual(2);
  const finalBody = primaryPostUpdates[primaryPostUpdates.length - 1];
  expect(finalBody).toContain('data-yuance-attachment-id="9100"');
  expect(finalBody).not.toContain('data:');
  expect(finalBody).not.toContain('data-yuance-attachment-id="-"');
  expect(primaryPostUpdates[0]).not.toContain('data:');
  expect(primaryPostUpdates[0]).not.toContain('data-yuance-attachment-id="-"');
});
