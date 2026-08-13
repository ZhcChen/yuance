import { expect, test } from '@playwright/test';

async function login(page) {
  await page.goto('/web/app');
  await expect(page).toHaveURL(/\/web\/login/);
  await page.locator('input[name="username"]').fill('yuance_admin');
  await page.locator('input[name="password"]').fill('Yuance@2026Dev!');
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/web/login')),
    page.getByRole('button', { name: '登录' }).click(),
  ]);
}

test('web 版本更新弹窗展示当前与最新版本并支持稍后刷新', async ({ page }) => {
  await page.route('**/version.json', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ version: '0.2.0-e2e' }),
  }));

  await login(page);

  const dialog = page.getByRole('dialog', { name: '发现新版本' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.app-update-meta-item strong')).toHaveText(['0.1.0', '0.2.0-e2e']);

  await dialog.getByRole('button', { name: '稍后刷新' }).click();
  await expect(dialog).toBeHidden();
});
