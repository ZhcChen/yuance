import { expect, test } from './support/fixtures.mjs';
import { ensureCurrentProject, ensureMemoryStorage } from './support/session.mjs';

// 新建工作项时附件无需标题：上传立即走项目草稿附件接口，创建时服务端绑定到主帖。
// 使用真实接口与内存对象存储，不 mock 上传链路。

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

/** 记录与新建流程相关的写请求，便于断言“未填标题时不创建工作项”。 */
function trackWrites(page) {
  const writes = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (request.method() === 'GET' || !url.pathname.startsWith('/api/v1/')) return;
    if (/work-item-draft-attachments|\/work-items|test-storage/u.test(url.pathname)) writes.push(`${request.method()} ${url.pathname}`);
  });
  return writes;
}

test('work item create uploads pasted images immediately without a title and binds them on create', async ({ page }) => {
  await login(page, '/web/app/tasks');
  await ensureCurrentProject(page, 'YCE');
  await ensureMemoryStorage(page);
  await page.goto('/web/app/bugs');
  const writes = trackWrites(page);

  await page.getByRole('button', { name: '新建 Bug' }).click();
  const dialog = page.getByRole('dialog', { name: '新建 Bug' });
  await expect(dialog.locator('#work-item-create-title')).toHaveValue('');
  const editor = dialog.getByRole('textbox', { name: '说明内容' });
  await editor.fill('图片上方的原有内容');
  await editor.evaluate((element) => {
    const bytesA = new Uint8Array([137, 80, 78, 71]);
    const bytesB = new Uint8Array([255, 216, 255]);
    // 真实剪贴板会在 items/files 中暴露同一图片，且 lastModified/name 可能不同。
    const clipboardData = {
      items: [
        { kind: 'file', getAsFile: () => new File([bytesA], 'pasted.png', { type: 'image/png', lastModified: 1234 }) },
        { kind: 'file', getAsFile: () => new File([bytesB], 'pasted-2.png', { type: 'image/png', lastModified: 1234 }) },
        { kind: 'file', getAsFile: () => new File([bytesA], 'same-as-pasted.png', { type: 'image/png', lastModified: 9999 }) },
      ],
      files: [
        new File([bytesA], 'pasted.png', { type: 'image/png', lastModified: 8888 }),
        new File([bytesB], 'pasted-2.png', { type: 'image/png', lastModified: 7777 }),
      ],
    };
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: clipboardData });
    element.dispatchEvent(event);
  });

  // 标题仍为空：两张图立即上传完成，成为草稿附件节点。
  const drafts = editor.locator('figure[data-yuance-attachment-id] img[src*="/work-item-draft-attachments/"]');
  await expect(drafts).toHaveCount(2);
  await expect(editor.locator('[data-rich-pending-upload]')).toHaveCount(0);
  await expect(editor.getByRole('img', { name: 'same-as-pasted.png' })).toHaveCount(0);
  await expect(dialog.locator('#work-item-create-title')).toHaveValue('');
  expect(writes.filter((entry) => entry === 'POST /api/v1/work-items')).toHaveLength(0);
  expect(writes.filter((entry) => entry === 'POST /api/v1/projects/YCE/work-item-draft-attachments')).toHaveLength(2);
  // 草稿附件可由上传者直接预览。
  const draftSrc = await drafts.first().getAttribute('src');
  expect((await page.request.get(draftSrc, { maxRedirects: 0 })).status()).toBeLessThan(400);

  // 上传后仍可继续编辑图片上方内容。
  await editor.evaluate((element) => {
    element.focus();
    const range = element.ownerDocument.createRange();
    range.setStart(element, 0);
    range.collapse(true);
    const selection = element.ownerDocument.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await page.keyboard.type('图片上方继续编辑');
  await expect(editor).toContainText('图片上方继续编辑图片上方的原有内容');

  await dialog.locator('#work-item-create-title').fill('草稿附件无需标题验收');
  await dialog.getByRole('button', { name: '创建' }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/work-items\/YCE-BUG-\d+|YCE-BUG-\d+/u);
  const itemKey = page.url().match(/YCE-BUG-\d+/u)[0];

  const view = (await (await page.request.get(`/api/v1/work-item-detail-view/${itemKey}`)).json()).data;
  const body = view.primary_post.body;
  expect(body).not.toContain('work-item-draft-attachments');
  expect(body.match(new RegExp(`/web/work-items/${itemKey}/comments/${view.primary_post.id}/attachments/\\d+/download`, 'gu'))).toHaveLength(2);
  expect(body).toContain('图片上方继续编辑');
});
