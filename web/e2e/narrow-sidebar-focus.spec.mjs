import { expect, test } from './support/fixtures.mjs';

// 窄屏收起的侧栏不可聚焦（体检 P1-9）：Tab 不应进入视口外的导航链接。

test.use({ viewport: { width: 375, height: 760 } });

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

test('窄屏收起时侧栏链接不在 Tab 顺序中，打开后可聚焦', async ({ page }) => {
  await login(page, '/web/app/tasks');
  await page.waitForLoadState('networkidle');
  await page.locator('body').click({ position: { x: 5, y: 300 } });
  for (let index = 0; index < 25; index += 1) {
    await page.keyboard.press('Tab');
    const insideSidebar = await page.evaluate(() => Boolean(document.activeElement?.closest('.app-sidebar')));
    expect(insideSidebar, `第 ${index + 1} 次 Tab 落入收起的侧栏`).toBe(false);
  }

  await page.getByRole('button', { name: '打开导航' }).click();
  const sidebar = page.locator('.app-sidebar');
  await expect(sidebar).toHaveAttribute('data-open', 'true');
  await expect(sidebar).not.toHaveAttribute('inert', /.*/);
  await sidebar.getByRole('link').first().focus();
  await expect(sidebar.getByRole('link').first()).toBeFocused();
});
