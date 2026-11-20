import { expect, test } from './support/fixtures.mjs';
import { ensureCurrentProject } from './support/session.mjs';

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

test('session recovery shows the shared app shell skeleton before the app renders', async ({ page }) => {
  await login(page, '/web/app/tasks');
  await ensureCurrentProject(page, 'YCE');
  await page.goto('/web/app/bugs');
  await expect(page.getByRole('heading', { level: 1, name: '缺陷', exact: true })).toBeVisible();

  await page.route('**/api/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.continue();
  });
  await page.reload();

  const skeleton = page.locator('.app-shell-skeleton');
  await expect(skeleton).toBeVisible();
  await expect(skeleton).toHaveAttribute('aria-busy', 'true');
  await expect(skeleton.getByRole('status')).toContainText('正在恢复当前会话');

  await expect(skeleton).toBeHidden({ timeout: 15000 });
  await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible();
});
