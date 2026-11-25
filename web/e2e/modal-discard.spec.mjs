import { expect, test } from './support/fixtures.mjs';
import { csrfHeaders } from './support/session.mjs';

// 表单弹窗的放弃保护（体检 P1-9）：未修改时 Esc 直接关闭；修改后 Esc / × 先确认。

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

test('未修改的弹窗按 Esc 直接关闭，修改后需确认放弃', async ({ page }) => {
  await login(page, '/web/app/projects');
  await page.getByRole('button', { name: '新建项目' }).click();
  const dialog = page.getByRole('dialog', { name: '新建项目' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await page.getByRole('button', { name: '新建项目' }).click();
  await dialog.getByLabel('项目名称').fill('尚未保存的项目');
  await page.keyboard.press('Escape');
  const confirm = dialog.getByRole('alertdialog', { name: '放弃未保存的修改' });
  await expect(confirm).toBeVisible();
  await expect(confirm.getByRole('button', { name: '继续编辑' })).toBeFocused();

  // 继续编辑：输入保留，确认条消失。
  await confirm.getByRole('button', { name: '继续编辑' }).click();
  await expect(confirm).toBeHidden();
  await expect(dialog.getByLabel('项目名称')).toHaveValue('尚未保存的项目');

  // 注意：确认条出现后若无任何交互再次按 Esc，Chrome 的 CloseWatcher 会跳过 cancel 事件直接关闭弹窗，
  // 页面无法拦截；保护针对的是第一次误按。

  // 右上角关闭同样受保护。
  await dialog.getByRole('button', { name: '关闭' }).click();
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: '放弃修改' }).click();
  await expect(dialog).toBeHidden();
  // 新建项目表单关闭后保留草稿（已有行为），重新打开时以草稿为初始值，因此 Esc 直接关闭。
  await page.getByRole('button', { name: '新建项目' }).click();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  // 底部“取消”是明确操作，不再二次确认。
  await page.getByRole('button', { name: '新建项目' }).click();
  await dialog.getByLabel('项目名称').fill('再次输入');
  await dialog.getByRole('button', { name: '取消' }).click();
  await expect(dialog).toBeHidden();
});

test('打开已有资料的编辑器未做修改时，Esc 直接关闭（富文本初始化不算修改）', async ({ page }) => {
  await login(page, '/web/app');
  const created = await page.request.post('/api/v1/projects/YCE/resources', {
    headers: await csrfHeaders(page),
    data: { title: '放弃保护资料', category: 'other', body: '<h2>标题</h2><p>段落 <strong>加粗</strong></p><ul><li>条目</li></ul>', body_format: 'html', tags: ['标签'] },
  });
  expect(created.status(), await created.text()).toBe(201);
  const resource = (await created.json()).data;
  await page.goto(`/web/app/projects/YCE/resources/${resource.id}`);
  await page.getByRole('button', { name: '编辑资料' }).click();
  const dialog = page.getByRole('dialog', { name: '编辑项目资料' });
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
