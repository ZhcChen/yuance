import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 720 } });

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

test('wide create dialog scrolls inside body and keeps footer visible', async ({ page }) => {
  await login(page, '/web/app/tasks');
  await ensureCurrentProject(page, 'YCE');
  await page.goto('/web/app/bugs');

  await page.getByRole('button', { name: '新建 Bug' }).click();
  const dialog = page.getByRole('dialog', { name: '新建 Bug' });
  await expect(dialog).toBeVisible();

  // display:flex 只允许作用于打开的 dialog，避免覆盖 UA 对关闭 dialog 的 display:none。
  const closedDialogsHidden = await page.locator('.yc-modal').evaluateAll((elements) =>
    elements.filter((element) => !element.open).every((element) => getComputedStyle(element).display === 'none'),
  );
  expect(closedDialogsHidden).toBe(true);

  const body = dialog.locator('.yc-modal-body');
  await expect.poll(() => body.evaluate((element) => element.scrollHeight - element.clientHeight)).toBeGreaterThan(0);
  expect(await body.evaluate((element) => getComputedStyle(element).overflowY)).toBe('auto');

  await body.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  expect(await body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

  const dialogBox = await dialog.boundingBox();
  const createButton = dialog.getByRole('button', { name: '创建' });
  const buttonBox = await createButton.boundingBox();
  expect(buttonBox.y + buttonBox.height).toBeLessThanOrEqual(dialogBox.y + dialogBox.height + 1);

  // 关闭时先进入退出动画，再真正 close，避免原生 dialog 直接消失。
  await dialog.getByRole('button', { name: '取消' }).click();
  await expect.poll(() => dialog.evaluate((element) => ({
    closing: element.classList.contains('yc-modal-closing'),
    open: element.open,
  }))).toEqual({ closing: true, open: true });
  await expect(dialog).toBeHidden();
});
