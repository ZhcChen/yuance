import { expect, test } from '@playwright/test';

const storageKey = 'yuance:project-resource-detail:outline-width';
const minWidth = 220;
const maxWidth = 520;
const defaultWidth = 320;
const longHeading = '这是一条足够长的项目资料目录标题用于验证目录宽度调整后标题仍然保持单行并显示省略号';

async function fulfillJson(route, data) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data }),
  });
}

async function mockResourceDetailApis(page, initialBody = `<h1>项目资料正文</h1><h2>${longHeading}</h2><p>用于验证目录交互。</p><h2>后续章节</h2><h3>本地验证</h3>`) {
  const project = {
    key: 'YCE',
    name: '元策研发平台',
    description: '',
    status: 'in_progress',
    owner_username: 'yuance_admin',
    owner: '元策开发管理员',
    start_date: '',
    due_date: '',
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-07T00:00:00Z',
  };
  let resource = {
    id: 901,
    project_key: 'YCE',
    title: '目录宽度回归资料',
    category: 'development',
    body: initialBody,
    body_format: 'html',
    summary: '目录宽度回归测试资料',
    status: 'active',
    is_protected: false,
    tags: [],
    related_work_item: null,
    related_cycle: null,
    created_by: '元策开发管理员',
    updated_by: '元策开发管理员',
    created_at: '2026-08-07T00:00:00Z',
    updated_at: '2026-08-07T08:00:00Z',
    url: '/web/projects/YCE/resources/901',
    access_token: '',
  };

  await page.route('**/api/v1/topbar/status', (route) => fulfillJson(route, {
    requirements_count: 0,
    tasks_count: 0,
    bugs_count: 0,
    notifications_count: 0,
    project_badges: [{ project_key: 'YCE', pending_count: 0 }],
    project_options: [{ key: 'YCE', name: project.name, pending_count: 0 }],
    system_links: [],
    current_project: { key: 'YCE', name: project.name, pending_count: 0 },
  }));
  await page.route('**/api/v1/projects/YCE', (route) => fulfillJson(route, project));
  await page.route('**/api/v1/projects/YCE/members', (route) => fulfillJson(route, [{
    user_id: 1,
    display_name: '元策开发管理员',
    username: 'yuance_admin',
    member_role: 'owner',
    joined_at: '2026-08-01T00:00:00Z',
  }]));
  await page.route(/\/api\/v1\/projects\/YCE\/resources(?:\?.*)?$/u, (route) => fulfillJson(route, [resource]));
  await page.route(/\/api\/v1\/projects\/YCE\/resources\/901$/u, async (route) => {
    if (route.request().method() === 'PATCH') {
      const payload = route.request().postDataJSON();
      resource = { ...resource, title: payload.title, category: payload.category, body: payload.body, body_format: payload.body_format, summary: payload.body };
    }
    await fulfillJson(route, resource);
  });
  await page.route(/\/api\/v1\/projects\/YCE\/resources\/901\/attachments(?:\?.*)?$/u, (route) => fulfillJson(route, []));
}

async function login(page, entryPath) {
  await page.goto(entryPath);
  await expect(page).toHaveURL(/\/web\/login/u);
  await page.locator('input[name="username"]').fill('yuance_admin');
  await page.locator('input[name="password"]').fill('Yuance@2026Dev!');
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/web/login')),
    page.getByRole('button', { name: '登录' }).click(),
  ]);
}

test('project resource outline can be resized, persisted, and controlled by keyboard', async ({ page }, testInfo) => {
  await mockResourceDetailApis(page);
  await login(page, '/web/app/projects/YCE/resources/901');
  await expect(page).toHaveURL(/\/web\/app\/projects\/YCE\/resources\/901$/u);

  const separator = page.locator('.resource-rich-body .yc-rich-text-toc-resize');
  await expect(separator).toBeVisible();
  await expect(separator).toHaveAttribute('role', 'separator');
  await expect(separator).toHaveAttribute('aria-label', '调整目录宽度');
  await expect(separator).toHaveAttribute('aria-valuemin', String(minWidth));
  await expect(separator).toHaveAttribute('aria-valuemax', String(maxWidth));
  await expect(separator).toHaveAttribute('aria-valuenow', String(defaultWidth));

  const tableOfContents = page.getByRole('navigation', { name: '正文目录' });
  const longHeadingLink = tableOfContents.getByRole('link', { name: longHeading, exact: true });
  await expect(longHeadingLink).toHaveAttribute('title', longHeading);
  const titleStyle = await longHeadingLink.evaluate((link) => ({
    whiteSpace: getComputedStyle(link).whiteSpace,
    textOverflow: getComputedStyle(link).textOverflow,
    overflowX: getComputedStyle(link).overflowX,
    clientWidth: link.clientWidth,
    scrollWidth: link.scrollWidth,
  }));
  expect(titleStyle.whiteSpace).toBe('nowrap');
  expect(titleStyle.textOverflow).toBe('ellipsis');
  expect(titleStyle.overflowX).toBe('hidden');
  expect(titleStyle.scrollWidth).toBeGreaterThan(titleStyle.clientWidth);
  await testInfo.attach('project-resource-outline-default-layout', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });

  const initialTocWidth = await tableOfContents.evaluate((element) => element.getBoundingClientRect().width);
  const separatorBounds = await separator.boundingBox();
  expect(separatorBounds).not.toBeNull();
  const startX = separatorBounds.x + separatorBounds.width / 2;
  const centerY = separatorBounds.y + separatorBounds.height / 2;
  await page.mouse.move(startX, centerY);
  await page.mouse.down();
  await page.mouse.move(startX + 64, centerY, { steps: 8 });
  await page.mouse.up();
  await expect(separator).toHaveAttribute('aria-valuenow', String(defaultWidth + 64));
  await expect.poll(() => tableOfContents.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(initialTocWidth);
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe(String(defaultWidth + 64));

  await page.reload();
  const restoredSeparator = page.locator('.resource-rich-body .yc-rich-text-toc-resize');
  await expect(restoredSeparator).toHaveAttribute('aria-valuenow', String(defaultWidth + 64));

  await restoredSeparator.focus();
  await restoredSeparator.press('ArrowLeft');
  await expect(restoredSeparator).toHaveAttribute('aria-valuenow', String(defaultWidth + 64 - 16));
  await restoredSeparator.press('Shift+ArrowLeft');
  await expect(restoredSeparator).toHaveAttribute('aria-valuenow', String(defaultWidth + 64 - 16 - 40));
  await restoredSeparator.press('ArrowRight');
  await expect(restoredSeparator).toHaveAttribute('aria-valuenow', String(defaultWidth + 64 - 16 - 40 + 16));
  await restoredSeparator.press('Shift+ArrowRight');
  await expect(restoredSeparator).toHaveAttribute('aria-valuenow', String(defaultWidth + 64));
  await restoredSeparator.press('Home');
  await expect(restoredSeparator).toHaveAttribute('aria-valuenow', String(minWidth));
  await restoredSeparator.press('ArrowLeft');
  await expect(restoredSeparator).toHaveAttribute('aria-valuenow', String(minWidth));
  await restoredSeparator.press('End');
  await expect(restoredSeparator).toHaveAttribute('aria-valuenow', String(maxWidth));
  await restoredSeparator.press('ArrowRight');
  await expect(restoredSeparator).toHaveAttribute('aria-valuenow', String(maxWidth));
});

test('project resource outline restores its width when an empty body gains content', async ({ page }) => {
  await page.addInitScript(({ key, width }) => window.localStorage.setItem(key, width), { key: storageKey, width: '412' });
  await mockResourceDetailApis(page, '');
  await login(page, '/web/app/projects/YCE/resources/901');
  await expect(page.getByText('暂无正文。')).toBeVisible();
  await expect(page.locator('.resource-rich-body .yc-rich-text-toc-resize')).toHaveCount(0);

  await page.getByRole('button', { name: '编辑资料' }).click();
  const editDialog = page.getByRole('dialog', { name: '编辑项目资料' });
  await editDialog.getByLabel('资料正文').evaluate((editor) => {
    editor.innerHTML = '<h2>动态加载章节</h2>';
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  });
  await editDialog.getByRole('button', { name: '保存' }).click();

  const separator = page.locator('.resource-rich-body .yc-rich-text-toc-resize');
  await expect(separator).toHaveAttribute('aria-valuenow', '412');
  await expect(page.getByRole('navigation', { name: '正文目录' }).getByRole('link', { name: '动态加载章节' })).toBeVisible();
});
