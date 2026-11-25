import { expect, test } from './support/fixtures.mjs';
import { holdTopbarEvents } from './support/realtime.mjs';
import { csrfHeaders, ensureMemoryStorage } from './support/session.mjs';

// 后台刷新（实时通知触发）不得覆盖用户状态：已解锁资料、编辑中的表单、已提交的筛选。

async function login(page, entryPath = '/web/app') {
  await page.goto(entryPath);
  await expect(page).toHaveURL(/\/web\/login/);
  await page.locator('input[name="username"]').fill('yuance_admin');
  await page.locator('input[name="password"]').fill('Yuance@2026Dev!');
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/web/login')),
    page.getByRole('button', { name: '登录' }).click(),
  ]);
}

/** 计数某类请求，便于确认后台刷新确实发生。 */
function countRequests(page, pattern) {
  const counter = { count: 0 };
  page.on('request', (request) => {
    if (request.method() === 'GET' && pattern.test(new URL(request.url()).pathname)) counter.count += 1;
  });
  return counter;
}

test('已解锁的受保护资料在后台刷新后保持解锁', async ({ page }) => {
  const refresh = await holdTopbarEvents(page);
  await login(page);
  const created = await page.request.post('/api/v1/projects/YCE/resources', {
    headers: await csrfHeaders(page),
    data: { title: '受保护资料', category: 'other', body: '<p>只有解锁后才能看到的正文</p>', body_format: 'html', access_password: 'Secret2026!', tags: [] },
  });
  expect(created.status(), await created.text()).toBe(201);
  const resource = (await created.json()).data;
  const resourceRequests = countRequests(page, /\/api\/v1\/projects\/YCE\/resources$/u);

  await page.goto(`/web/app/projects/YCE/resources/${resource.id}`);
  await page.locator('.resource-lock-card').getByLabel('访问密码').fill('Secret2026!');
  await page.getByRole('button', { name: '验证并查看' }).click();
  await expect(page.getByText('只有解锁后才能看到的正文')).toBeVisible();

  const before = resourceRequests.count;
  await refresh();
  await expect.poll(() => resourceRequests.count).toBeGreaterThan(before);
  await page.waitForLoadState('networkidle');
  await expect(page.getByText('只有解锁后才能看到的正文')).toBeVisible();
  await expect(page.locator('.resource-lock-card')).toHaveCount(0);
});

test('资料访问凭证失效后，后台刷新回退为锁定状态', async ({ page }) => {
  const refresh = await holdTopbarEvents(page);
  await login(page);
  const created = await page.request.post('/api/v1/projects/YCE/resources', {
    headers: await csrfHeaders(page),
    data: { title: '凭证失效资料', category: 'other', body: '<p>凭证失效前可见的正文</p>', body_format: 'html', access_password: 'Secret2026!', tags: [] },
  });
  expect(created.status(), await created.text()).toBe(201);
  const resource = (await created.json()).data;
  const attachmentStatuses = [];
  page.on('response', (response) => {
    if (new URL(response.url()).pathname === `/api/v1/projects/YCE/resources/${resource.id}/attachments`) attachmentStatuses.push(response.status());
  });

  await page.goto(`/web/app/projects/YCE/resources/${resource.id}`);
  await page.locator('.resource-lock-card').getByLabel('访问密码').fill('Secret2026!');
  await page.getByRole('button', { name: '验证并查看' }).click();
  await expect(page.getByText('凭证失效前可见的正文')).toBeVisible();

  // 他处重置了访问密码：已签发的访问凭证随之失效（附件接口返回 403）。
  const reset = await page.request.post(`/api/v1/projects/YCE/resources/${resource.id}/password/reset`, {
    headers: await csrfHeaders(page),
    data: { access_password_action: 'set', access_password: 'Another2026!' },
  });
  expect(reset.status(), await reset.text()).toBe(200);

  await refresh();
  await expect.poll(() => attachmentStatuses.includes(403)).toBe(true);
  await expect(page.locator('.resource-lock-card')).toBeVisible();
  await expect(page.getByText('凭证失效前可见的正文')).toHaveCount(0);
  await expect(page.locator('.resource-lock-card').getByLabel('访问密码')).toBeEditable();
});

test('后台刷新进行中完成解锁，较早的刷新结果不会把资料重新锁上', async ({ page }) => {
  const refresh = await holdTopbarEvents(page);
  await login(page);
  const created = await page.request.post('/api/v1/projects/YCE/resources', {
    headers: await csrfHeaders(page),
    data: { title: '竞态资料', category: 'other', body: '<p>竞态解锁后的正文</p>', body_format: 'html', access_password: 'Secret2026!', tags: [] },
  });
  expect(created.status(), await created.text()).toBe(201);
  const resource = (await created.json()).data;

  await page.goto(`/web/app/projects/YCE/resources/${resource.id}`);
  await expect(page.locator('.resource-lock-card')).toBeVisible();

  // 拦住刷新发出的资料列表请求，让它在用户解锁之后才返回。
  let releaseList = () => {};
  let listHeld = false;
  const listGate = new Promise((resolve) => { releaseList = resolve; });
  await page.route('**/api/v1/projects/YCE/resources', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    listHeld = true;
    await listGate;
    await route.continue();
  });
  await refresh();
  await expect.poll(() => listHeld).toBe(true);

  await page.locator('.resource-lock-card').getByLabel('访问密码').fill('Secret2026!');
  await page.getByRole('button', { name: '验证并查看' }).click();
  await expect(page.getByText('竞态解锁后的正文')).toBeVisible();

  releaseList();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(300);
  await expect(page.getByText('竞态解锁后的正文')).toBeVisible();
  await expect(page.locator('.resource-lock-card')).toHaveCount(0);
});

test('编辑个人资料时后台刷新不覆盖输入，取消后重新打开恢复为已保存的值', async ({ page }) => {
  const refresh = await holdTopbarEvents(page);
  await login(page);
  const profileRequests = countRequests(page, /\/api\/v1\/(me|profile|auth\/me)/u);
  await page.goto('/web/app/me');
  await page.getByRole('button', { name: '编辑资料' }).click();
  const dialog = page.getByRole('dialog', { name: '编辑个人资料' });
  const displayName = dialog.getByLabel('显示名称');
  const saved = await displayName.inputValue();
  await displayName.fill('正在输入的新名称');

  const before = profileRequests.count;
  await refresh();
  await expect.poll(() => profileRequests.count).toBeGreaterThan(before);
  await page.waitForLoadState('networkidle');
  await expect(displayName).toHaveValue('正在输入的新名称');

  await dialog.getByRole('button', { name: '取消' }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: '编辑资料' }).click();
  await expect(page.getByRole('dialog', { name: '编辑个人资料' }).getByLabel('显示名称')).toHaveValue(saved);
});

test('资料库已提交的筛选在后台刷新后保持，且不采用未提交的输入', async ({ page }) => {
  const refresh = await holdTopbarEvents(page);
  await login(page);
  await ensureMemoryStorage(page);
  for (const title of ['筛选命中资料', '另一份无关资料']) {
    const response = await page.request.post('/api/v1/projects/YCE/resources', {
      headers: await csrfHeaders(page),
      data: { title, category: 'other', body: `<p>${title}正文</p>`, body_format: 'html', tags: [] },
    });
    expect(response.status()).toBe(201);
  }
  const listRequests = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (request.method() === 'GET' && url.pathname === '/api/v1/projects/YCE/resources') listRequests.push(url.searchParams.get('q') || '');
  });
  await page.goto('/web/app/projects/YCE/resources');
  const list = page.locator('.project-resource-library-list-card');
  await expect(list).toContainText('另一份无关资料');

  const keyword = page.locator('#project-resource-filter-q');
  await keyword.fill('筛选命中');
  await page.getByRole('button', { name: '筛选', exact: true }).click();
  await expect(list).not.toContainText('另一份无关资料');
  await expect(list).toContainText('筛选命中资料');

  // 输入但未提交新的关键词，随后发生后台刷新：应沿用已提交的“筛选命中”。
  await keyword.fill('未提交的关键词');
  const before = listRequests.length;
  await refresh();
  await expect.poll(() => listRequests.length).toBeGreaterThan(before);
  await page.waitForLoadState('networkidle');
  expect(listRequests.at(-1)).toBe('筛选命中');
  await expect(list).toContainText('筛选命中资料');
  await expect(list).not.toContainText('另一份无关资料');
});

test('项目时间排期加载失败时在页内提示，恢复后提示消失', async ({ page }) => {
  const refresh = await holdTopbarEvents(page);
  let failAllocations = true;
  await page.route('**/api/v1/projects/YCE/time-allocations', async (route) => {
    if (route.request().method() === 'GET' && failAllocations) {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'internal_error', message: '服务暂时不可用' } }) });
      return;
    }
    await route.continue();
  });
  await login(page, '/web/app/projects/YCE?tab=time');
  await expect(page.getByRole('heading', { level: 3, name: '项目时间排期' })).toBeVisible();
  await expect(page.getByText('时间排期加载失败')).toBeVisible();

  failAllocations = false;
  await refresh();
  await expect(page.getByText('时间排期加载失败')).toHaveCount(0);
});

test('首屏加载每个接口只请求一次', async ({ page }) => {
  await login(page, '/web/app/tasks');
  // 等登录后首个页面的请求结束再开始计数，避免把重载前的请求算进来。
  await page.waitForLoadState('networkidle');
  const counts = new Map();
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/v1/') || url.pathname === '/api/v1/topbar/events') return;
    const key = `${request.method()} ${url.pathname}${url.search}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  const duplicated = [...counts].filter(([, count]) => count > 1);
  expect(counts.size).toBeGreaterThan(2);
  expect(duplicated, JSON.stringify(duplicated)).toEqual([]);
});
