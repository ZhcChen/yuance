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

test('browser shell restores login return_to for direct /web/app/messages entry', async ({ page }) => {
  await login(page, '/web/app/messages?filter=unread');

  await expect(page).toHaveURL(/\/web\/app\/messages\?filter=unread/);
  await expect(page).toHaveTitle('消息中心 - 元策');
  await expect(page.getByRole('heading', { level: 1, name: '消息中心' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: '消息中心' })).toBeFocused();
  await expect(page.getByText('请查看待处理讨论')).toBeVisible();
});

test('browser shell supports root navigation and logout on /web owner route', async ({ page }) => {
  await login(page, '/web');

  await expect(page).toHaveURL(/\/web$/);
  await expect(page).toHaveTitle('元策浏览器工作台 - 元策');
  await expect(page.getByRole('heading', { level: 1, name: '元策浏览器工作台' })).toBeVisible();

  await page.getByRole('navigation', { name: '应用导航' }).getByRole('link', { name: /消息中心/ }).click();
  await expect(page).toHaveURL(/\/web\/messages/);
  await expect(page.getByRole('heading', { level: 1, name: '消息中心' })).toBeFocused();

  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page).toHaveURL(/\/web\/login/);
});

test('message center opens semantic target and unread filter becomes empty after read', async ({ page }) => {
  await login(page, '/web/messages?filter=unread');

  await expect(page.getByText('请查看待处理讨论')).toBeVisible();
  await Promise.all([
    page.waitForURL(/\/web\/work-items\/YCE-TASK-2/),
    page.getByRole('button', { name: '打开' }).click(),
  ]);
  await expect(page).toHaveURL(/\/web\/work-items\/YCE-TASK-2(#comment-\d+)?$/);

  await page.goto('/web/messages?filter=unread');
  await expect(page.getByRole('heading', { level: 1, name: '消息中心' })).toBeVisible();
  await expect(page.getByText('没有未读消息。')).toBeVisible();
});
