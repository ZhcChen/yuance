import { expect, test } from '@playwright/test';

async function login(page, entryPath = '/web/app') {
  await page.goto(entryPath);
  await expect(page).toHaveURL(/\/web\/login/u);
  await page.locator('input[name="username"]').fill('yuance_admin');
  await page.locator('input[name="password"]').fill('Yuance@2026Dev!');
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/web/login')),
    page.getByRole('button', { name: '登录' }).click(),
  ]);
}

test('a login page in another tab resumes after a sibling tab authenticates', async ({ page, context }) => {
  const waitingPage = await context.newPage();
  await waitingPage.goto('/web/login?return_to=%2Fweb%2Fapp');
  await expect(waitingPage.locator('input[name="username"]')).toBeVisible();

  await login(page);

  await expect(waitingPage).toHaveURL('/web/app');
  await expect(waitingPage.getByRole('navigation', { name: '应用导航' })).toBeVisible();
});

test('a login page redirects when its shared browser session is already valid', async ({ page }) => {
  await login(page);
  await page.goto('/web/login?return_to=%2Fweb%2Fapp');

  await expect(page).toHaveURL('/web/app');
  await expect(page.getByRole('navigation', { name: '应用导航' })).toBeVisible();
});
