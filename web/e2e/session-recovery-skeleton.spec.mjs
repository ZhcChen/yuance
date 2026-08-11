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

test('session recovery shows the shared app shell skeleton before the app renders', async ({ page }) => {
  await login(page, '/web/app/tasks');
  await ensureCurrentProject(page, 'YCE');
  await page.goto('/web/app/bugs');
  await expect(page.getByRole('heading', { level: 1, name: '缺陷列表' })).toBeVisible();

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
  await expect(page.getByRole('navigation', { name: '应用导航' })).toBeVisible();
});
