import { expect, test } from './support/fixtures.mjs';

// 筛选栏在常见桌面宽度下不截断文字、不产生横向溢出（体检 P2）。

async function login(page) {
  await page.goto('/web/app/tasks');
  await page.locator('input[name="username"]').fill('yuance_admin');
  await page.locator('input[name="password"]').fill('Yuance@2026Dev!');
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/web/login')),
    page.getByRole('button', { name: '登录' }).click(),
  ]);
}

for (const width of [1024, 1180, 1280, 1440]) {
  test(`${width}px 下工作项筛选栏完整显示`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await login(page);
    for (const path of ['/web/app/tasks', '/web/app/bugs', '/web/app/requirements']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const report = await page.evaluate(() => {
        const bar = document.querySelector('.work-item-filter-bar');
        const truncated = [...(bar?.querySelectorAll('.yc-select-value') || [])]
          .filter((element) => element.scrollWidth > element.clientWidth + 1)
          .map((element) => element.textContent.trim());
        const barOverflow = bar ? bar.scrollWidth > bar.clientWidth + 1 : false;
        const pageOverflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
        return { truncated, barOverflow, pageOverflow };
      });
      expect(report, path).toEqual({ truncated: [], barOverflow: false, pageOverflow: false });
    }
  });
}
