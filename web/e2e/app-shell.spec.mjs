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

async function ensureCurrentProject(page, projectKey) {
  await page.goto('/web/app/projects');
  await expect(page.getByRole('heading', { level: 1, name: '项目列表' })).toBeVisible();
  const row = page.locator('.project-row', { hasText: projectKey });
  const currentButton = row.getByRole('button', { name: '当前项目' });
  if (await currentButton.count()) {
    return;
  }
  await row.getByRole('button', { name: '设为当前项目' }).click();
  await expect(row.getByRole('button', { name: '当前项目' })).toBeVisible();
}

test('browser shell restores login return_to for direct /web/app/messages entry', async ({ page }) => {
  await login(page, '/web/app/messages?filter=unread');

  await expect(page).toHaveURL(/\/web\/app\/messages\?filter=unread/);
  await expect(page).toHaveTitle('消息中心 - 元策');
  await expect(page.getByRole('heading', { level: 1, name: '消息中心' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: '消息中心' })).toBeFocused();
  await expect(page.getByRole('button', { name: '打开' })).toBeVisible();
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

test('app-owner task list can filter and open read-only work item detail', async ({ page }) => {
  await login(page, '/web/app/projects');
  await ensureCurrentProject(page, 'YCE');

  await page.goto('/web/app/tasks?q=%E6%A8%A1%E5%9E%8B');
  await expect(page).toHaveURL(/\/web\/app\/tasks\?q=/);
  await expect(page.getByRole('heading', { level: 1, name: '任务列表' })).toBeVisible();
  await expect(page.locator('.work-item-row', { hasText: 'YCE-TASK-2' })).toBeVisible();

  await page.locator('.work-item-row', { hasText: 'YCE-TASK-2' }).getByRole('link', { name: '打开详情' }).click();
  await expect(page).toHaveURL(/\/web\/app\/work-items\/YCE-TASK-2/);
  await expect(page.getByRole('heading', { level: 2, name: 'YCE-TASK-2 · 设计项目与工作项数据模型' })).toBeVisible();
  await expect(page.getByRole('link', { name: '打开旧版详情' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 3, name: '评论与流转' })).toBeVisible();
});

test('message center opens semantic target and unread filter becomes empty after read', async ({ page }) => {
  await login(page, '/web/messages?filter=unread');

  const openButton = page.getByRole('button', { name: '打开' }).first();
  await expect(openButton).toBeVisible();
  await Promise.all([
    page.waitForURL(/\/web\/app\/work-items\/YCE-TASK-2/),
    openButton.click(),
  ]);
  await expect(page).toHaveURL(/\/web\/app\/work-items\/YCE-TASK-2(#comment-\d+)?$/);

  await page.goto('/web/messages?filter=unread');
  await expect(page.getByRole('heading', { level: 1, name: '消息中心' })).toBeVisible();
  await expect(page.getByText('没有未读消息。')).toBeVisible();
});

test('app-owner message center opens semantic target inside app shell', async ({ page }) => {
  await login(page, '/web/app/messages?filter=all');

  const openButton = page.getByRole('button', { name: '打开' }).first();
  await expect(openButton).toBeVisible();
  await Promise.all([
    page.waitForURL(/\/web\/app\/work-items\//),
    openButton.click(),
  ]);
  await expect(page).toHaveURL(/\/web\/app\/work-items\/[^#?]+(#comment-\d+)?$/);
  await expect(page.locator('.work-item-detail-center').getByRole('heading', { level: 2 })).toBeVisible();
});

test('project list can switch current project inside the app shell', async ({ page }) => {
  await login(page, '/web/app/projects');

  await expect(page).toHaveURL(/\/web\/app\/projects/);
  await expect(page.getByRole('heading', { level: 1, name: '项目列表' })).toBeVisible();
  await page.locator('.project-row', { hasText: 'OPS' }).getByRole('button', { name: '设为当前项目' }).click();
  await expect(page.getByText('OPS · 交付运维台')).toBeVisible();
  await expect(page.locator('.project-row', { hasText: 'OPS' }).getByRole('button', { name: '当前项目' })).toBeVisible();
});
