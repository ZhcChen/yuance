import { expect, test } from './support/fixtures.mjs';

// 手机端触控尺寸巡检（体检 P2）：常用控件的可点击区域不低于 32px（勾选框不低于 20px）。

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

const SELECTORS = ['.yc-pagination-pages button', '.scope-tab', '.pending-shortcuts a', '.message-open'];

test('手机端常用控件满足最小触控尺寸', async ({ page }) => {
  await login(page, '/web/app');
  for (const path of ['/web/app', '/web/app/projects', '/web/app/tasks', '/web/app/messages']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const offenders = await page.evaluate(({ selectors }) => {
      const result = [];
      for (const selector of selectors) {
        for (const element of document.querySelectorAll(selector)) {
          const rect = element.getBoundingClientRect();
          if (!rect.width || !rect.height) continue;
          if (rect.height < 32 || rect.width < 32) result.push(`${selector} ${Math.round(rect.width)}x${Math.round(rect.height)}`);
        }
      }
      for (const element of document.querySelectorAll('input[type="checkbox"]')) {
        const rect = element.getBoundingClientRect();
        if (rect.width && (rect.width < 20 || rect.height < 20)) result.push(`checkbox ${Math.round(rect.width)}x${Math.round(rect.height)}`);
      }
      return result;
    }, { selectors: SELECTORS });
    expect(offenders, `${path}: ${offenders.join(', ')}`).toEqual([]);
  }
});
