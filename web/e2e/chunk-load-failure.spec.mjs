import { expect, test } from './support/fixtures.mjs';

// 发布后旧标签页按需加载的代码块不存在（或网络失败）：自动刷新一次，仍失败时提示刷新而不是白屏。

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

test('页面代码块加载失败时自动刷新一次，仍失败则显示刷新提示', async ({ page }) => {
  await login(page);
  let blocked = 0;
  await page.route(/\/assets\/system-pages-[^/]+\.js$/u, async (route) => {
    blocked += 1;
    await route.fulfill({ status: 404, body: 'gone' });
  });
  let loads = 0;
  page.on('load', () => { loads += 1; });

  await page.goto('/web/app/system/users');
  await expect(page.getByRole('alert')).toContainText('页面已更新或加载失败', { timeout: 20000 });
  await expect(page.getByRole('button', { name: '刷新页面' })).toBeVisible();
  expect(blocked).toBeGreaterThan(0);
  // 直接访问 1 次 + 自动刷新 1 次；不循环刷新。
  expect(loads).toBe(2);
  const marker = await page.evaluate(() => sessionStorage.getItem('yuance.chunk-reload-at'));
  expect(Number(marker)).toBeGreaterThan(0);
});
