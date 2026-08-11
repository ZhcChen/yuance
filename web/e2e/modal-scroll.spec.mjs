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

  const body = dialog.locator('.yc-modal-body');
  await expect.poll(() => body.evaluate((element) => element.scrollHeight - element.clientHeight)).toBeGreaterThan(0);
  expect(await body.evaluate((element) => getComputedStyle(element).overflowY)).toBe('auto');

  await body.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  expect(await body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

  const dialogBox = await dialog.boundingBox();
  const createButton = dialog.getByRole('button', { name: '创建' });
  const buttonBox = await createButton.boundingBox();
  expect(buttonBox.y + buttonBox.height).toBeLessThanOrEqual(dialogBox.y + dialogBox.height + 1);
});
