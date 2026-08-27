import { expect, test } from '@playwright/test';

async function chooseFile(page, button, file) {
  const chooser = page.waitForEvent('filechooser');
  await button.click();
  await (await chooser).setFiles(file);
}

async function routeEmptyProjectResourceAttachments(page) {
  await page.route(/\/api\/v1\/projects\/[^/]+\/resources\/\d+\/attachments(?:\?.*)?$/u, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) }));
}

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
  await page.getByLabel('每页').selectOption('20');
  const row = page.locator('.project-row', { hasText: projectKey });
  await expect(row).toBeVisible();
  const currentButton = row.getByRole('button', { name: '当前项目', exact: true });
  if (await currentButton.count()) {
    return;
  }
  await row.getByRole('button', { name: '设为当前项目' }).click();
  await expect(row.getByRole('button', { name: '当前项目', exact: true })).toBeVisible();
}

function workItemDetailFixture(overrides = {}) {
  return {
    key: 'YCE-TASK-2',
    item_type: 'task',
    title: '设计项目与工作项数据模型',
    description: '落地项目、成员、需求、任务、Bug、评论和动态表。',
    status: 'in_progress',
    priority: 'P0',
    project_key: 'YCE',
    project_name: '元策研发',
    parent_item_key: 'YCE-REQ-1',
    parent_title: '统一 /web 用户工作台与系统管理入口',
    assignee_username: 'yuance_admin',
    assignee: '系统管理员',
    reporter: '系统管理员',
    due_date: '',
    created_at: '2026-07-30T10:00:00Z',
    updated_at: '2026-07-30T10:30:00Z',
    deleted_at: '',
    ...overrides,
  };
}

function workItemCommentFixture(overrides = {}) {
  return {
    id: 901,
    parent_comment_id: null,
    parent_author: '',
    body: '初始可编辑评论',
    body_format: 'plain',
    author: '系统管理员',
    author_username: 'yuance_admin',
    created_at: '2026-07-30T10:00:00Z',
    updated_at: '2026-07-30T10:00:00Z',
    is_flow: false,
    is_draft: false,
    ...overrides,
  };
}

function attachmentFixture(overrides = {}) {
  return {
    id: 801,
    filename: 'spec.pdf',
    content_type: 'application/pdf',
    byte_size: 2048,
    status: 'uploaded',
    created_by: '系统管理员',
    created_at: '2026-07-30T10:05:00Z',
    ...overrides,
  };
}

function projectResourceFixture(overrides = {}) {
  return {
    id: 901,
    project_key: 'YCE',
    title: '客户端联调参数',
    category: 'integration',
    body: 'client_id=yuance-e2e',
    body_format: 'plain',
    summary: '客户端联调所需的公开参数',
    status: 'active',
    is_protected: false,
    tags: ['联调', '客户端'],
    related_work_item: { key: 'YCE-TASK-2', item_type: 'task', title: '接口联调', url: '/web/work-items/YCE-TASK-2' },
    related_cycle: null,
    created_by: '元策开发管理员',
    updated_by: '元策开发管理员',
    created_at: '2026-08-07T00:00:00Z',
    updated_at: '2026-08-07T08:00:00Z',
    url: '/web/projects/YCE/resources/901',
    access_token: '',
    ...overrides,
  };
}

test('browser shell restores login return_to for direct /web/app/messages entry', async ({ page }) => {
  await login(page, '/web/app/messages?filter=unread');

  await expect(page).toHaveURL(/\/web\/app\/messages\?filter=unread/);
  await expect(page).toHaveTitle('消息中心 - 元策');
  await expect(page.getByRole('heading', { level: 1, name: '消息中心' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: '消息中心' })).toBeFocused();
  await expect(page.getByRole('button', { name: '打开', exact: true })).toBeVisible();
});

test('message filters slide without replacing the page or clipping badges', async ({ page }) => {
  await login(page, '/web/app/messages?filter=all');

  const messagePage = page.locator('.messages-page');
  const tabs = messagePage.locator('.yc-content-tabs');
  const indicator = tabs.locator('.yc-content-tabs-indicator');
  await messagePage.evaluate((element) => { element.dataset.filterTransitionMarker = 'preserved'; });
  const initialX = await indicator.evaluate((element) => element.getBoundingClientRect().x);

  await tabs.getByRole('button', { name: /未读消息/ }).click();
  await expect(page).toHaveURL(/filter=unread/);
  await expect(messagePage).toHaveAttribute('data-filter-transition-marker', 'preserved');
  await expect(tabs.getByRole('button', { name: /未读消息/ })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => indicator.evaluate((element) => element.getBoundingClientRect().x)).toBeGreaterThan(initialX);

  const badgeBounds = await tabs.evaluate((element) => {
    const tabsRect = element.getBoundingClientRect();
    return [...element.querySelectorAll('.yc-content-tab-badge')].map((badge) => {
      const rect = badge.getBoundingClientRect();
      return { top: rect.top - tabsRect.top, right: rect.right - tabsRect.right };
    });
  });
  expect(badgeBounds.every((badge) => badge.top >= -1 && badge.right <= 1)).toBe(true);
});

test('topbar project badge totals every project and polls final state', async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => {
    globalThis.EventSource = class {
      addEventListener() {}
      close() {}
    };
  });
  let topbarRequests = 0;
  let pollingPhase = false;
  await page.route('**/api/v1/topbar/status', async (route) => {
    topbarRequests += 1;
    const opsPending = pollingPhase ? 4 : 2;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: {
        requirements_count: 0, tasks_count: 0, bugs_count: 0, notifications_count: 0,
        project_badges: [{ project_key: 'YCE', pending_count: 0 }, { project_key: 'OPS', pending_count: opsPending }],
        project_options: [{ key: 'YCE', name: '元策研发', pending_count: 0 }, { key: 'OPS', name: '交付运维台', pending_count: opsPending }],
        system_links: [],
        current_project: { key: 'YCE', name: '元策研发', pending_count: 0 },
      } }),
    });
  });

  await login(page, '/web/app');
  const projectBadge = page.locator('.global-nav-project > summary .global-nav-badge');
  await expect(projectBadge).toHaveText('2');
  await expect(projectBadge).toHaveAttribute('aria-label', '全部项目待处理 2');

  const requestsBeforePolling = topbarRequests;
  pollingPhase = true;
  await page.clock.runFor(30_000);
  await expect.poll(() => topbarRequests).toBeGreaterThan(requestsBeforePolling);
  await expect(projectBadge).toHaveText('4');
  await expect(projectBadge).toHaveAttribute('aria-label', '全部项目待处理 4');
});

test('browser shell preserves the shared deep link when the session expires', async ({ page }) => {
  await login(page, '/web/app');
  await page.goto('/web/app/search?q=YCE-TASK-2');
  await expect(page).toHaveURL(/\/web\/app\/search\?q=YCE-TASK-2/);
  await expect(page.getByRole('heading', { level: 1, name: '搜索项目、需求、任务、Bug 和资料库' })).toBeVisible();
  await page.route('**/api/v1/auth/me', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'unauthorized', message: '登录已失效。' } }),
    });
  });

  await page.reload().catch((error) => {
    if (!String(error).includes('ERR_ABORTED')) throw error;
  });

  await expect(page).toHaveURL(/\/web\/login\?return_to=%2Fweb%2Fapp%2Fsearch%3Fq%3DYCE-TASK-2/);
  await expect(page.getByRole('heading', { name: '登录' })).toBeVisible();
});

test('browser shell supports root navigation and logout on /web owner route', async ({ page }) => {
  await login(page, '/web');

  await expect(page).toHaveURL(/\/web$/);
  await expect(page).toHaveTitle('元策浏览器工作台 - 元策');
  await expect(page.getByRole('heading', { level: 1, name: '项目推进' })).toBeVisible();

  await page.getByRole('button', { name: '打开消息通知' }).click();
  await page.getByRole('dialog', { name: '最近消息' }).getByRole('link', { name: '进入消息中心' }).click();
  await expect(page).toHaveURL(/\/web\/messages/);
  await expect(page.getByRole('heading', { level: 1, name: '消息中心' })).toBeFocused();

  await page.getByRole('button', { name: /打开 .* 的账户菜单/ }).click();
  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page).toHaveURL(/\/web\/login/);
});

test('app-owner global search loads shared results and resolves result targets', async ({ page }) => {
  await login(page, '/web/app');

  await page.getByRole('search').getByRole('searchbox', { name: '全局搜索' }).fill('YCE-TASK-2');
  await page.getByRole('search').getByRole('button', { name: '搜索' }).click();

  await expect(page).toHaveURL(/\/web\/app\/search\?q=YCE-TASK-2/);
  await expect(page).toHaveTitle('全局搜索 - 元策');
  await expect(page.getByRole('heading', { level: 1, name: '搜索项目、需求、任务、Bug 和资料库' })).toBeVisible();
  const result = page.getByRole('list', { name: '搜索结果列表' }).locator('.search-result', { hasText: 'YCE-TASK-2' });
  await expect(result).toContainText('设计项目与工作项数据模型');
  await result.getByRole('link', { name: '设计项目与工作项数据模型' }).click();

  await expect(page).toHaveURL(/\/web\/app\/work-items\/YCE-TASK-2$/);
  await expect(page.getByRole('heading', { level: 1, name: /YCE-TASK-2/ })).toBeVisible();
});

test('message and search pages preserve the main responsive geometry', async ({ page }) => {
  await login(page, '/web/app');

  for (const viewport of [
    { width: 390, height: 844, compact: true },
    { width: 768, height: 1024, compact: false },
    { width: 1280, height: 800, compact: false },
    { width: 1440, height: 900, compact: false },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/web/app/messages?filter=all');
    await expect(page.getByRole('heading', { level: 1, name: '消息中心' })).toBeVisible();

    const messageGeometry = await page.locator('.messages-page').evaluate((element) => {
      const pageRect = element.getBoundingClientRect();
      const row = element.querySelector('.message-row');
      const main = element.closest('.main');
      return {
        pageWidth: pageRect.width,
        mainWidth: main.clientWidth,
        mainScrollWidth: main.scrollWidth,
        rowColumns: row ? getComputedStyle(row).gridTemplateColumns.split(' ').length : 0,
        overflow: [...main.querySelectorAll('*')].flatMap((candidate) => {
          const rect = candidate.getBoundingClientRect();
          return rect.right > main.getBoundingClientRect().right + 1
            ? [{ selector: candidate.className || candidate.tagName, right: rect.right, width: rect.width }]
            : [];
        }).slice(0, 8),
      };
    });
    expect(messageGeometry.pageWidth).toBeLessThanOrEqual(1042);
    expect(messageGeometry.mainScrollWidth, JSON.stringify(messageGeometry.overflow)).toBeLessThanOrEqual(messageGeometry.mainWidth);
    if (messageGeometry.rowColumns) expect(messageGeometry.rowColumns).toBe(viewport.compact ? 3 : 4);

    await page.goto('/web/app/search?q=YCE-TASK-2');
    await expect(page.getByRole('heading', { level: 1, name: '搜索项目、需求、任务、Bug 和资料库' })).toBeVisible();
    const searchGeometry = await page.locator('.search-page').evaluate((element) => ({
      mainWidth: element.closest('.main').clientWidth,
      mainScrollWidth: element.closest('.main').scrollWidth,
      formColumns: getComputedStyle(element.querySelector('.search-form')).gridTemplateColumns.split(' ').length,
      resultDirection: getComputedStyle(element.querySelector('.search-result')).flexDirection,
    }));
    expect(searchGeometry.mainScrollWidth).toBeLessThanOrEqual(searchGeometry.mainWidth);
    expect(searchGeometry.formColumns).toBe(viewport.compact ? 1 : 2);
    expect(searchGeometry.resultDirection).toBe(viewport.compact ? 'column' : 'row');
  }
});

test('shared profile page updates account identity through the common modal', async ({ page }) => {
  await login(page, '/web/app');
  await page.getByRole('button', { name: /打开 .* 的账户菜单/ }).click();
  await page.getByRole('link', { name: '我的账号' }).click();

  await expect(page).toHaveURL(/\/web\/app\/me$/);
  await expect(page).toHaveTitle('个人中心 - 元策');
  await expect(page.getByRole('heading', { level: 1, name: '元策开发管理员' })).toBeVisible();

  const requests = [];
  await page.route('**/api/v1/me/profile', async (route) => {
    if (route.request().method() !== 'PATCH') {
      await route.continue();
      return;
    }
    requests.push({ headers: route.request().headers(), payload: route.request().postDataJSON() });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: {
        id: 1, username: 'yuance_admin', display_name: '统一体验管理员', email: 'admin@yuance.test', mobile: '13800000000',
        status: 'active', is_super_admin: true, roles: '超级管理员', created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-07T00:00:00Z',
      } }),
    });
  });

  await page.getByRole('button', { name: '编辑资料' }).click();
  const dialog = page.getByRole('dialog', { name: '编辑个人资料' });
  await dialog.getByLabel('显示名称').fill('统一体验管理员');
  await dialog.getByLabel('邮箱').fill('admin@yuance.test');
  await dialog.getByLabel('手机号').fill('13800000000');
  await dialog.getByRole('button', { name: '保存个人资料' }).click();

  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].headers['x-yuance-csrf-token']).toBeTruthy();
  expect(requests[0].payload).toEqual({ display_name: '统一体验管理员', email: 'admin@yuance.test', mobile: '13800000000' });
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: '统一体验管理员' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('个人资料已保存。');
  await expect(page.getByRole('button', { name: '打开 统一体验管理员 的账户菜单' })).toBeVisible();
});

test('profile page preserves the main responsive geometry', async ({ page }) => {
  await login(page, '/web/app/me');
  for (const viewport of [
    { width: 390, height: 844, compact: true },
    { width: 768, height: 1024, compact: false },
    { width: 1280, height: 800, compact: false },
    { width: 1440, height: 900, compact: false },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/web/app/me');
    await expect(page.locator('.profile-hero').getByRole('heading', { level: 1 })).toBeVisible();
    const geometry = await page.locator('.profile-page').evaluate((element) => {
      const main = element.closest('.main');
      return {
        mainWidth: main.clientWidth,
        mainScrollWidth: main.scrollWidth,
        metricColumns: getComputedStyle(element.querySelector('.profile-metrics')).gridTemplateColumns.split(' ').length,
        detailColumns: getComputedStyle(element.querySelector('.profile-detail-grid')).gridTemplateColumns.split(' ').length,
      };
    });
    expect(geometry.mainScrollWidth).toBeLessThanOrEqual(geometry.mainWidth);
    expect(geometry.metricColumns).toBe(viewport.compact ? 1 : 3);
    expect(geometry.detailColumns).toBe(viewport.compact ? 1 : 2);
  }
});

test('shared account security manages password tokens and device sessions once', async ({ page }) => {
  await login(page, '/web/app');
  const mutations = [];
  const tokenFixture = { id: 7, name: 'E2E Agent', scopes: ['project:read', 'work_item:read'], project_scope: 'all', token_suffix: 'abcd', expires_at: '', revoked_at: '', last_used_at: '', created_at: '2026-08-07T00:00:00Z', updated_at: '2026-08-07T00:00:00Z' };
  const deviceFixture = { family_id: 'family-e2e', device_id: 'device-e2e', device_name: 'E2E Desktop', platform: 'darwin', client_version: '0.1.0', status: 'active', generation: 1, last_seen_at: '2026-08-07T00:00:00Z', created_at: '2026-08-07T00:00:00Z', is_current: false };
  await page.route('**/api/v1/me/tokens**', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
    mutations.push({ method: request.method(), url: request.url(), headers: request.headers(), payload: request.postDataJSON() });
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: { token: tokenFixture, raw_token: 'yuance_pat_e2e-once' } }) });
  });
  await page.route('**/api/v1/me/device-sessions**', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [deviceFixture] }) });
    mutations.push({ method: request.method(), url: request.url(), headers: request.headers() });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { ...deviceFixture, status: 'revoked' } }) });
  });
  await page.route('**/api/v1/me/password', async (route) => {
    const request = route.request();
    mutations.push({ method: request.method(), url: request.url(), headers: request.headers(), payload: request.postDataJSON() });
    return route.fulfill({ status: 204 });
  });

  await page.getByRole('button', { name: /打开 .* 的账户菜单/ }).click();
  await page.getByRole('link', { name: '我的账号' }).click();
  await page.getByRole('button', { name: '修改密码' }).click();
  const password = page.getByRole('dialog', { name: '修改密码' });
  await password.getByLabel('当前密码').fill('OldPass2026!');
  await password.getByLabel(/^新密码/).fill('NewPass2026!');
  await password.getByLabel('确认新密码').fill('NewPass2026!');
  await password.getByRole('button', { name: '保存' }).click();
  await expect(password).not.toBeVisible();

  await page.getByRole('button', { name: '创建 Token' }).click();
  const tokenDialog = page.getByRole('dialog', { name: '新建访问 Token' });
  await tokenDialog.getByLabel('名称').fill('E2E Agent');
  await tokenDialog.getByLabel('读取工作项').check();
  await tokenDialog.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText('yuance_pat_e2e-once')).toBeVisible();

  await page.locator('.account-security-row', { hasText: 'E2E Desktop' }).getByRole('button', { name: '撤销' }).click();
  const confirmation = page.getByRole('dialog', { name: '撤销设备会话' });
  await confirmation.getByRole('button', { name: '确认' }).click();
  await expect(confirmation).not.toBeVisible();

  expect(mutations).toHaveLength(3);
  expect(mutations.map(({ method }) => method)).toEqual(['PATCH', 'POST', 'DELETE']);
  expect(mutations.every(({ headers }) => Boolean(headers['x-yuance-csrf-token']))).toBe(true);
  expect(mutations[1].payload.scopes).toEqual(['project:read', 'work_item:read']);
});

test('app-owner task list can filter and open read-only work item detail', async ({ page }) => {
  await login(page, '/web/app/projects');
  await ensureCurrentProject(page, 'YCE');

  await page.goto('/web/app/tasks?q=%E6%A8%A1%E5%9E%8B');
  await expect(page).toHaveURL(/\/web\/app\/tasks\?q=/);
  await expect(page.getByRole('heading', { level: 2, name: '任务列表' })).toBeVisible();
  await expect(page.locator('.work-item-row', { hasText: 'YCE-TASK-2' })).toBeVisible();

  const filters = page.locator('.work-item-filter-bar');
  await expect(filters.locator('select[name="cycle_id"]')).toHaveValue('');
  await filters.locator('select[name="sort"]').selectOption('priority_desc');
  await filters.getByRole('button', { name: '筛选' }).click();
  await expect(page).toHaveURL(/sort=priority_desc/);
  await expect(filters.locator('select[name="cycle_id"]')).toHaveValue('');
  await expect(filters.locator('select[name="sort"]')).toHaveValue('priority_desc');
  await filters.getByRole('button', { name: '重置' }).click();
  await expect(page).toHaveURL('/web/app/tasks');
  await expect(page.locator('.work-item-row', { hasText: 'YCE-TASK-2' })).toBeVisible();

  await page.locator('.work-item-row', { hasText: 'YCE-TASK-2' }).getByRole('link', { name: '打开详情' }).click();
  await expect(page).toHaveURL(/\/web\/app\/work-items\/YCE-TASK-2/);
  await expect(page.getByRole('heading', { level: 1, name: 'YCE-TASK-2 · 设计项目与工作项数据模型' })).toBeVisible();
  await expect(page.getByRole('link', { name: '打开旧版详情' })).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 3, name: '评论与流转' })).toBeVisible();
});

test('formal web work item detail keeps web route ownership', async ({ page }) => {
  await login(page, '/web/work-items/YCE-TASK-2');
  await expect(page).toHaveURL('/web/work-items/YCE-TASK-2');
  await expect(page.getByRole('heading', { level: 1, name: 'YCE-TASK-2 · 设计项目与工作项数据模型' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 3, name: '评论与流转' })).toBeVisible();
  await expect(page.getByRole('link', { name: '打开旧版详情' })).toHaveCount(0);
});

test('formal web task list keeps web route ownership while filtering', async ({ page }) => {
  await login(page, '/web/tasks?q=%E6%A8%A1%E5%9E%8B');
  await expect(page).toHaveURL(/\/web\/tasks\?q=/);
  await expect(page.getByRole('heading', { level: 2, name: '任务列表' })).toBeVisible();
  await expect(page.locator('.work-item-row', { hasText: 'YCE-TASK-2' })).toBeVisible();

  const filters = page.locator('.work-item-filter-bar');
  await filters.locator('select[name="sort"]').selectOption('priority_desc');
  await filters.getByRole('button', { name: '筛选' }).click();
  await expect(page).toHaveURL(/\/web\/tasks\?.*sort=priority_desc/);
  await expect(page).not.toHaveURL(/\/web\/app\/tasks/);

  await filters.getByRole('button', { name: '重置' }).click();
  await expect(page).toHaveURL('/web/tasks');
});

test('work item detail preserves the main responsive geometry', async ({ page }) => {
  await login(page, '/web/app/work-items/YCE-TASK-2');
  for (const viewport of [
    { width: 390, height: 844, compact: true },
    { width: 768, height: 1024, compact: true },
    { width: 1280, height: 800, compact: false },
    { width: 1440, height: 900, compact: false },
  ]) {
    await page.setViewportSize(viewport);
    const geometry = await page.locator('.work-item-page').evaluate((element) => {
      const main = element.closest('.main');
      const layout = element.querySelector('.work-item-layout');
      const content = element.querySelector('.work-item-content');
      const rail = element.querySelector('.work-item-action-rail');
      const layoutStyle = getComputedStyle(layout);
      const railStyle = getComputedStyle(rail);
      return {
        mainWidth: main.clientWidth,
        mainScrollWidth: main.scrollWidth,
        columns: layoutStyle.gridTemplateColumns.trim().split(/\s+/u).length,
        railWidth: rail.getBoundingClientRect().width,
        railPosition: railStyle.position,
        railBeforeContent: rail.getBoundingClientRect().top <= content.getBoundingClientRect().top + 1,
      };
    });
    expect(geometry.mainScrollWidth).toBeLessThanOrEqual(geometry.mainWidth);
    expect(geometry.columns).toBe(viewport.compact ? 1 : 2);
    if (viewport.compact) {
      expect(geometry.railBeforeContent).toBe(true);
      expect(geometry.railPosition).toBe('static');
    } else {
      expect(geometry.railPosition).toBe('sticky');
      expect(geometry.railWidth).toBeCloseTo(280, 0);
    }
  }
});

test('work item lists preserve the main responsive geometry', async ({ page }) => {
  await login(page, '/web/app/tasks');
  for (const viewport of [
    { width: 390, height: 844, compact: true },
    { width: 768, height: 1024, compact: true },
    { width: 1280, height: 800, compact: false },
    { width: 1440, height: 900, compact: false },
  ]) {
    await page.setViewportSize(viewport);
    for (const route of ['requirements', 'tasks', 'bugs']) {
      await page.goto(`/web/app/${route}`);
      await expect(page.locator('.work-item-list-page')).toBeVisible();
      const geometry = await page.locator('.work-item-list-page').evaluate((element) => {
        const main = element.closest('.main');
        const tableWrap = element.querySelector('.work-table-wrap');
        return {
          mainWidth: main.clientWidth,
          mainScrollWidth: main.scrollWidth,
          metricColumns: getComputedStyle(element.querySelector('.work-item-list-metrics')).gridTemplateColumns.split(' ').length,
          filterColumns: getComputedStyle(element.querySelector('.work-item-filter-bar')).gridTemplateColumns.split(' ').length,
          tableContained: tableWrap.scrollWidth >= tableWrap.clientWidth && tableWrap.getBoundingClientRect().right <= main.getBoundingClientRect().right + 1,
        };
      });
      expect(geometry.mainScrollWidth).toBeLessThanOrEqual(geometry.mainWidth);
      expect(geometry.metricColumns).toBe(viewport.compact ? 1 : 3);
      expect(geometry.filterColumns).toBe(viewport.compact ? 1 : 7);
      expect(geometry.tableContained).toBe(true);
    }
  }
});

test('work item filter select opens with motion and preserves native selection semantics', async ({ page }) => {
  await login(page, '/web/app/tasks');
  await page.route('**/api/v1/work-item-list-view**', async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    payload.data.items = [];
    payload.data.pagination.total_items = 0;
    payload.data.pagination.total_pages = 1;
    await route.fulfill({ response, json: payload });
  });
  await page.goto('/web/app/tasks');
  const statusField = page.locator('.work-item-filter-bar .yc-field').filter({ hasText: /^状态/u });
  const trigger = statusField.locator('.yc-select-trigger');
  const menu = statusField.locator('.yc-select-menu');

  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(menu).toHaveCSS('opacity', '1');
  expect(await menu.evaluate((element) => getComputedStyle(element).transitionDuration)).not.toBe('0s');
  await menu.getByRole('option', { name: '进行中' }).click();
  await expect(trigger).toContainText('进行中');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');

  await statusField.locator('select[name="status"]').selectOption('closed');
  await expect(trigger).toContainText('已关闭');
  await trigger.press('ArrowUp');
  await trigger.press('ArrowUp');
  await trigger.press('Enter');
  await expect(trigger).toContainText('已验证');
  await trigger.click();
  await menu.getByRole('option', { name: '已取消' }).click();
  await expect(trigger).toContainText('已取消');
});

test('shared work item creation covers requirement task and bug contracts', async ({ page }) => {
  await login(page, '/web/app/tasks');
  await ensureCurrentProject(page, 'YCE');

  await page.goto('/web/app/tasks');
  await page.getByRole('button', { name: '新建任务' }).click();
  const taskDialog = page.getByRole('dialog', { name: '新建任务' });
  await expect(taskDialog).toHaveClass(/yc-modal-wide/u);
  await expect.poll(() => taskDialog.locator('.work-item-create-fields').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(4);
  await expect.poll(() => taskDialog.locator('#work-item-create-form').evaluate((form) => form.querySelector('.yc-rich-field')?.previousElementSibling?.classList.contains('work-item-create-fields'))).toBe(true);
  await taskDialog.locator('#work-item-create-priority-native').selectOption('P1');
  await expect(taskDialog.locator('#work-item-create-cycle-native')).toHaveValue('');
  await taskDialog.locator('#work-item-create-assignee').click();
  await taskDialog.getByRole('searchbox', { name: '搜索处理人' }).fill('yuance_admin');
  await taskDialog.getByRole('option', { name: /yuance_admin/u }).click();
  await expect(taskDialog.locator('#work-item-create-assignee-native')).toHaveValue('yuance_admin');
  await taskDialog.locator('#work-item-create-parent-native').selectOption('YCE-REQ-1');
  await taskDialog.locator('#work-item-create-due-date').fill('2026-08-31');
  await taskDialog.locator('#work-item-create-title').fill('共享任务创建验收');
  await taskDialog.getByRole('textbox', { name: '说明内容' }).fill('共享任务说明');
  await taskDialog.getByRole('button', { name: '创建' }).click();
  await expect(page).toHaveURL(/\/web\/app\/work-items\/YCE-TASK-\d+/u);
  await expect(page.getByRole('heading', { level: 1, name: /共享任务创建验收/u })).toBeVisible();

  await page.goto('/web/app/requirements');
  await page.getByRole('button', { name: '新建需求' }).click();
  const requirementDialog = page.getByRole('dialog', { name: '新建需求' });
  await expect.poll(() => requirementDialog.locator('.work-item-create-fields').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(4);
  await expect(requirementDialog.locator('#work-item-create-parent-native')).toHaveCount(0);
  await requirementDialog.locator('#work-item-create-title').fill('共享需求创建验收');
  await requirementDialog.getByRole('button', { name: '创建' }).click();
  await expect(page).toHaveURL(/\/web\/app\/work-items\/YCE-REQ-\d+/u);
  await expect(page.getByRole('heading', { level: 1, name: /共享需求创建验收/u })).toBeVisible();

  await page.goto('/web/app/bugs');
  await page.getByRole('button', { name: '新建 Bug' }).click();
  const bugDialog = page.getByRole('dialog', { name: '新建 Bug' });
  await expect.poll(() => bugDialog.locator('.work-item-create-fields').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(4);
  await bugDialog.locator('#work-item-create-title').fill('共享缺陷创建验收');
  await bugDialog.getByRole('button', { name: '创建' }).click();
  await expect(page).toHaveURL(/\/web\/app\/work-items\/YCE-BUG-\d+/u);
  await expect(page.getByRole('heading', { level: 1, name: /共享缺陷创建验收/u })).toBeVisible();
});

test('shared batch selection spans pages and retains only partial failures', async ({ page }) => {
  await login(page, '/web/app/tasks');
  const batchRequests = [];
  await page.route('**/api/v1/work-item-list-view**', async (route) => {
    const pageNumber = Number(new URL(route.request().url()).searchParams.get('page') || 1);
    const item = pageNumber === 1
      ? { key: 'YCE-TASK-1', item_type: 'task', title: '第一页任务', status: 'open', priority: 'P0', project_key: 'YCE', project_name: '元策研发', assignee: '系统管理员', updated_at: '2026-08-07T00:00:00Z' }
      : { key: 'YCE-TASK-2', item_type: 'task', title: '第二页任务', status: 'in_progress', priority: 'P0', project_key: 'YCE', project_name: '元策研发', assignee: '系统管理员', updated_at: '2026-08-07T00:00:00Z' };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: {
      items: [item], pagination: { page: pageNumber, per_page: 1, total_items: 2, total_pages: 2 },
      summary: { total_items: 2, active_items: 2, high_priority_items: 2 },
      filters: { item_type: 'task', q: '', status: '', priority: '', project_key: 'YCE', assignee_username: '', cycle_id: '', sort: 'updated_desc' },
      assignees: [{ username: 'yuance_admin', display_name: '系统管理员' }], cycles: [], parent_options: [], saved_views: [], can_manage_work_items: true,
    } }) });
  });
  await page.route('**/api/v1/work-items/batch', async (route) => {
    batchRequests.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: {
      updated_count: 1, updated_item_keys: ['YCE-TASK-1'], failed_count: 1,
      failed_items: [{ item_key: 'YCE-TASK-2', code: 'conflict', message: '数据冲突：状态已变化' }],
    } }) });
  });

  await page.goto('/web/app/tasks?per_page=1');
  await page.getByLabel('选择 YCE-TASK-1').check();
  await expect(page.getByText('已选择 1 项')).toBeVisible();
  await page.getByRole('button', { name: '下一页' }).click();
  await page.getByLabel('选择 YCE-TASK-2').check();
  await expect(page.getByText('已选择 2 项')).toBeVisible();
  await page.getByLabel('目标优先级').selectOption('P1');
  await page.getByRole('button', { name: '应用' }).click();
  const confirmation = page.getByRole('dialog', { name: '确认批量更新' });
  await expect(confirmation).toContainText('已选择的 2 个工作项');
  await confirmation.getByRole('button', { name: '确认更新' }).evaluate((button) => { button.click(); button.click(); });

  await expect.poll(() => batchRequests.length).toBe(1);
  expect(batchRequests[0].item_keys).toEqual(['YCE-TASK-1', 'YCE-TASK-2']);
  await expect(page.getByText('已选择 1 项')).toBeVisible();
  await expect(page.getByLabel('选择 YCE-TASK-2')).toBeChecked();
  await expect(page.getByRole('alert')).toContainText('YCE-TASK-2');
  await page.locator('.work-item-filter-bar input[name="q"]').fill('新筛选');
  await page.locator('.work-item-filter-bar').getByRole('button', { name: '筛选' }).click();
  await expect(page.getByText('已选择 0 项')).toBeVisible();
});

test('shared work item lists hide creation when the atomic contract is read only', async ({ page }) => {
  await login(page, '/web/app/tasks');
  await ensureCurrentProject(page, 'YCE');
  await page.route('**/api/v1/work-item-list-view**', async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    payload.data.can_manage_work_items = false;
    await route.fulfill({ response, json: payload });
  });
  await page.goto('/web/app/tasks');
  await expect(page.getByRole('heading', { level: 2, name: '任务列表' })).toBeVisible();
  await expect(page.getByRole('button', { name: '新建任务' })).toHaveCount(0);
  await expect(page.getByLabel('批量操作')).toHaveCount(0);
  await expect(page.getByLabel(/选择 YCE-TASK/u)).toHaveCount(0);
});

test('shared work item lists render a stable empty state for filtered results', async ({ page }) => {
  await login(page, '/web/app/requirements');
  await page.route('**/api/v1/work-item-list-view**', async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    payload.data.items = [];
    payload.data.pagination.total_items = 0;
    payload.data.pagination.total_pages = 1;
    await route.fulfill({ response, json: payload });
  });
  await page.goto('/web/app/requirements');

  const emptyState = page.locator('.work-item-list-empty');
  await expect(emptyState).toContainText('暂无需求');
  await expect(emptyState).toContainText('当前筛选条件下没有匹配项');
  await expect.poll(() => emptyState.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(176);
});

test('work item detail can edit and handoff through app shell forms', async ({ page }) => {
  await login(page, '/web/app/work-items/YCE-TASK-2');
  await expect(page.getByRole('heading', { level: 1, name: 'YCE-TASK-2 · 设计项目与工作项数据模型' })).toBeVisible();
  await page.route('**/api/v1/work-items/YCE-TASK-2/attachments', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
  });
  await expect(page.locator('.work-item-attachments-panel')).toHaveCount(0);

  const editRequests = [];
  const primaryPostRequests = [];
  const handoffRequests = [];
  let topbarRefreshCount = 0;
  let commentRefreshCount = 0;
  const editedDetail = workItemDetailFixture({
    title: '设计项目与工作项数据模型（Web 编辑）',
    description: '通过 Web app shell 保存的描述。',
    priority: 'P1',
    parent_item_key: '',
    parent_title: '',
    due_date: '2026-08-15',
    updated_at: '2026-07-30T12:00:00Z',
  });
  let refreshedDetail = editedDetail;
  let refreshedPrimaryPost = null;

  await page.route('**/api/v1/work-item-detail-view/YCE-TASK-2', async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    payload.data.item = refreshedDetail;
    payload.data.primary_post = refreshedPrimaryPost;
    await route.fulfill({ response, json: payload });
  });

  await page.route('**/api/v1/topbar/status', async (route) => {
    topbarRefreshCount += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          requirements_count: 1,
          tasks_count: topbarRefreshCount === 1 ? 7 : 8,
          bugs_count: 2,
          notifications_count: 0,
          project_badges: [{ project_key: 'YCE', pending_count: topbarRefreshCount === 1 ? 3 : 4 }],
          current_project: {
            key: 'YCE',
            name: '元策研发',
            pending_count: topbarRefreshCount === 1 ? 3 : 4,
          },
        },
      }),
    });
  });
  await page.route('**/api/v1/work-items/YCE-TASK-2/comments', async (route) => {
    commentRefreshCount += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            id: 700 + commentRefreshCount,
            parent_comment_id: null,
            parent_author: '',
            body: commentRefreshCount === 1 ? 'Web 保存后刷新评论' : 'Web handoff 流转记录',
            body_format: 'plain',
            author: '系统管理员',
            author_username: 'yuance_admin',
            created_at: '2026-07-30T12:00:00Z',
            updated_at: '2026-07-30T12:00:00Z',
            is_flow: commentRefreshCount > 1,
            is_draft: false,
          },
        ],
      }),
    });
  });
  await page.route('**/api/v1/work-items/YCE-TASK-2', async (route) => {
    if (route.request().method() !== 'PATCH') {
      await route.continue();
      return;
    }
    editRequests.push({
      headers: route.request().headers(),
      payload: route.request().postDataJSON(),
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: editedDetail }),
    });
  });
  await page.route('**/api/v1/work-items/YCE-TASK-2/primary-post', async (route) => {
    primaryPostRequests.push({
      headers: route.request().headers(),
      payload: route.request().postDataJSON(),
    });
    refreshedPrimaryPost = workItemCommentFixture({
      id: 902,
      body: route.request().postDataJSON().body,
      body_format: 'html',
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: refreshedPrimaryPost }),
    });
  });

  await page.getByRole('button', { name: '编辑内容' }).click();
  const editDialog = page.getByRole('dialog', { name: '编辑工作项' });
  const editForm = page.locator('#work-item-edit-form');
  await expect.poll(() => editForm.locator('.work-item-edit-fields').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(4);
  await expect.poll(() => editForm.evaluate((form) => form.lastElementChild?.classList.contains('yc-rich-field'))).toBe(true);
  await expect.poll(() => editForm.getByLabel('主内容').evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(320);
  await editForm.getByLabel('标题').fill(editedDetail.title);
  await editForm.getByLabel('主内容').fill(editedDetail.description);
  await editForm.locator('select[name="status"]').selectOption('in_progress');
  await editForm.locator('select[name="priority"]').selectOption('P1');
  await editForm.locator('#work-item-edit-assignee').click();
  await editForm.getByRole('searchbox', { name: '搜索处理人' }).fill('yuance_admin');
  await editForm.getByRole('option', { name: '元策开发管理员' }).click();
  await expect(editForm.locator('select[name="assigneeUsername"]')).toHaveValue('yuance_admin');
  await editForm.getByLabel('截止日期').fill('2026-08-15');
  await editForm.locator('select[name="parentItemKey"]').selectOption('');
  await editDialog.getByRole('button', { name: '保存修改' }).click();

  await expect.poll(() => editRequests.length).toBe(1);
  expect(editRequests[0].headers['x-yuance-csrf-token']).toBeTruthy();
  expect(editRequests[0].headers['content-type']).toContain('application/json');
  expect(editRequests[0].payload).toMatchObject({
    title: editedDetail.title,
    status: 'in_progress',
    priority: 'P1',
    assignee_username: 'yuance_admin',
    due_date: '2026-08-15',
    parent_item_key: '',
  });
  expect(editRequests[0].payload).not.toHaveProperty('description');
  await expect.poll(() => primaryPostRequests.length).toBe(1);
  expect(primaryPostRequests[0].headers['x-yuance-csrf-token']).toBeTruthy();
  expect(primaryPostRequests[0].payload).toMatchObject({
    body: `<p>${editedDetail.description}</p>`,
    body_format: 'html',
  });
  await expect(page.getByRole('heading', { level: 1, name: `YCE-TASK-2 · ${editedDetail.title}` })).toBeVisible();
  await expect(page.locator('.work-item-description .yc-rich-text-content')).toHaveText('通过 Web app shell 保存的描述。');
  await expect(page.getByRole('status')).toHaveText('YCE-TASK-2 已保存。');
  await expect(page.getByText('Web 保存后刷新评论')).toBeVisible();
  await expect(page.getByRole('navigation', { name: '应用导航' }).getByRole('link', { name: /任务/ })).toContainText('7');

  await page.route('**/api/v1/work-items/YCE-TASK-2/handoff', async (route) => {
    refreshedDetail = {
      ...editedDetail,
      status: 'pending_confirmation',
      updated_at: '2026-07-30T12:30:00Z',
    };
    handoffRequests.push({
      headers: route.request().headers(),
      payload: route.request().postDataJSON(),
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: refreshedDetail,
      }),
    });
  });

  await page.getByRole('button', { name: '指派 / 流转' }).click();
  const handoffDialog = page.getByRole('dialog', { name: '指派 / 流转' });
  const handoffForm = page.locator('#work-item-handoff-form');
  await handoffForm.locator('select[name="status"]').selectOption('pending_confirmation');
  await handoffForm.locator('select[name="assigneeUsername"]').selectOption('yuance_admin');
  await handoffForm.getByLabel('处理说明').fill('请确认 Web shell 表单提交。');
  await handoffDialog.getByRole('button', { name: '确认推进' }).click();

  await expect.poll(() => handoffRequests.length).toBe(1);
  expect(handoffRequests[0].headers['x-yuance-csrf-token']).toBeTruthy();
  expect(handoffRequests[0].headers['content-type']).toContain('application/json');
  expect(handoffRequests[0].payload).toMatchObject({
    status: 'pending_confirmation',
    assignee_username: 'yuance_admin',
    body: '请确认 Web shell 表单提交。',
  });
  await expect(page.getByRole('status')).toHaveText('YCE-TASK-2 已推进并指派。');
  await expect(page.getByText('Web handoff 流转记录')).toBeVisible();
  await expect(page.locator('.work-item-title-tags')).toContainText('待确认');
  await expect(page.getByRole('navigation', { name: '应用导航' }).getByRole('link', { name: /任务/ })).toContainText('8');
  await expect(page).toHaveURL(/\/web\/app\/work-items\/YCE-TASK-2$/);
});

test('work item rich text file cards keep editor and detail styles aligned', async ({ page }) => {
  const inlineBody = '<p>附件</p><a data-yuance-attachment-id="990" data-yuance-attachment-kind="file" data-yuance-file-kind="text" data-yuance-file-ext="TXT" data-yuance-align="left" href="/web/work-items/YCE-TASK-2/attachments/990/download" title="same.txt">same.txt</a>';
  const primaryPost = workItemCommentFixture({ id: 890, body: inlineBody, body_format: 'html' });
  const comment = workItemCommentFixture({ id: 891, body: inlineBody, body_format: 'html' });

  await login(page, '/web/app/work-items/YCE-TASK-2');
  await page.route('**/api/v1/work-item-detail-view/YCE-TASK-2', async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    payload.data.primary_post = primaryPost;
    await route.fulfill({ response, json: payload });
  });
  await page.route('**/api/v1/work-items/YCE-TASK-2/comments', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { data: [comment] } });
  });
  await page.route('**/api/v1/work-items/YCE-TASK-2/attachments**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) }));
  await page.route('**/api/v1/work-items/YCE-TASK-2/comments/*/attachments**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) }));

  await page.reload();
  const detailFile = page.locator('.work-item-description .yc-rich-text-content a[data-yuance-attachment-kind="file"]');
  const commentFile = page.locator('#comment-891 .yc-rich-text-content a[data-yuance-attachment-kind="file"]');
  await expect(detailFile).toBeVisible();
  await expect(commentFile).toBeVisible();
  await expect(detailFile).toHaveAttribute('data-yuance-file-ext', 'TXT');
  await expect(commentFile).toHaveAttribute('data-yuance-file-ext', 'TXT');

  const detailStyle = await detailFile.evaluate((element) => {
    const card = getComputedStyle(element);
    const badge = getComputedStyle(element, '::before');
    return {
      display: card.display,
      borderRadius: card.borderRadius,
      padding: card.padding,
      backgroundImage: card.backgroundImage,
      boxShadow: card.boxShadow,
      badgeDisplay: badge.display,
      badgeWidth: badge.width,
      badgeHeight: badge.height,
      badgeBorderRadius: badge.borderRadius,
    };
  });

  await page.getByRole('button', { name: '编辑内容' }).click();
  const editorFile = page.locator('.yc-rich-text-input a[data-yuance-attachment-kind="file"]');
  await expect(editorFile).toBeVisible();
  const editorStyle = await editorFile.evaluate((element) => {
    const card = getComputedStyle(element);
    const badge = getComputedStyle(element, '::before');
    return {
      display: card.display,
      borderRadius: card.borderRadius,
      padding: card.padding,
      backgroundImage: card.backgroundImage,
      boxShadow: card.boxShadow,
      badgeDisplay: badge.display,
      badgeWidth: badge.width,
      badgeHeight: badge.height,
      badgeBorderRadius: badge.borderRadius,
    };
  });
  expect(editorStyle).toEqual(detailStyle);
});

test('work item realtime discussion refresh preserves the mounted page and local draft', async ({ page }) => {
  await page.addInitScript(() => {
    const sources = [];
    class ControlledEventSource {
      listeners = new Map();
      constructor(url, options) { this.url = url; this.options = options; sources.push(this); }
      addEventListener(type, callback) { this.listeners.set(type, callback); }
      close() { this.closed = true; }
    }
    globalThis.EventSource = ControlledEventSource;
    globalThis.__yuanceSseSources = sources;
    globalThis.__emitYuanceSse = (url, type, data) => {
      const source = sources.find((candidate) => candidate.url === url && !candidate.closed);
      source?.listeners.get(type)?.({ data });
    };
  });

  let commentRequests = 0;
  await page.route('**/api/v1/work-items/YCE-TASK-2/comments', async (route) => {
    commentRequests += 1;
    const response = await route.fetch();
    const payload = await response.json();
    if (commentRequests > 1) payload.data.push(workItemCommentFixture({ id: 977, body: '来自另一会话的实时评论', author: '协作成员', author_username: 'collaborator' }));
    await route.fulfill({ response, json: payload });
  });

  await login(page, '/web/app/work-items/YCE-TASK-2');
  const detail = page.locator('.work-item-detail-center');
  await detail.evaluate((element) => { element.dataset.realtimeMarker = 'preserved'; });
  const draft = page.getByRole('textbox', { name: '新增评论' });
  await draft.fill('尚未发布的本地草稿');

  const subscriptionUrls = await page.evaluate(() => globalThis.__yuanceSseSources.map((source) => source.url));
  expect(subscriptionUrls).toContain('/api/v1/work-items/YCE-TASK-2/events');
  await page.evaluate(() => globalThis.__emitYuanceSse('/api/v1/work-items/YCE-TASK-2/events', 'discussion-refresh', 'refresh'));

  await expect(page.getByText('来自另一会话的实时评论')).toBeVisible();
  await expect(draft).toContainText('尚未发布的本地草稿');
  await expect(detail).toHaveAttribute('data-realtime-marker', 'preserved');
  expect(commentRequests).toBeGreaterThan(1);
});

test('work item realtime typing reports bounded activity and isolates late events', async ({ page }) => {
  await page.addInitScript(() => {
    const sources = [];
    class ControlledEventSource {
      listeners = new Map();
      constructor(url, options) { this.url = url; this.options = options; sources.push(this); }
      addEventListener(type, callback) { this.listeners.set(type, callback); }
      close() { this.closed = true; }
    }
    globalThis.EventSource = ControlledEventSource;
    globalThis.__yuanceSseSources = sources;
    globalThis.__emitYuanceSseAt = (index, type, data) => sources[index]?.listeners.get(type)?.({ data });
  });

  const typingRequests = [];
  await page.route('**/api/v1/work-items/*/typing', async (route) => {
    typingRequests.push({ url: route.request().url(), body: route.request().postDataJSON() });
    await route.fulfill({ status: 204, body: '' });
  });

  await login(page, '/web/app/work-items/YCE-TASK-2');
  const activeSourceIndex = await page.evaluate(() => globalThis.__yuanceSseSources.findIndex((source) => source.url === '/api/v1/work-items/YCE-TASK-2/events' && !source.closed));
  expect(activeSourceIndex).toBeGreaterThanOrEqual(0);
  const editor = page.getByRole('textbox', { name: '新增评论' });
  await editor.fill('正在撰写评论');
  await expect.poll(() => typingRequests.filter((request) => request.body.active).length).toBe(1);
  expect(typingRequests[0].url).toContain('/api/v1/work-items/YCE-TASK-2/typing');
  expect(typingRequests[0].body.client_id).toMatch(/^web:[0-9a-f-]+$/u);

  await page.getByRole('heading', { level: 1, name: 'YCE-TASK-2 · 设计项目与工作项数据模型' }).click();
  await expect.poll(() => typingRequests.at(-1)?.body.active).toBe(false);

  await page.evaluate((index) => globalThis.__emitYuanceSseAt(index, 'typing', JSON.stringify({ users: [{ user_id: 7, display_name: 'Alice' }, { user_id: 8, display_name: 'Bob' }, { user_id: 9, display_name: 'Carol' }] })), activeSourceIndex);
  await expect(page.locator('.work-item-typing-status')).toHaveText('Alice、Bob 等 3 人正在输入…');
  await page.evaluate((index) => globalThis.__emitYuanceSseAt(index, 'typing', JSON.stringify({ users: [] })), activeSourceIndex);
  await expect(page.locator('.work-item-typing-status')).toHaveText('');

  await page.evaluate(() => {
    globalThis.history.pushState({}, '', '/web/app/work-items/YCE-TASK-1');
    globalThis.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page).toHaveURL(/\/web\/app\/work-items\/YCE-TASK-1$/u);
  await expect.poll(() => page.evaluate(() => globalThis.__yuanceSseSources.some((source) => source.url === '/api/v1/work-items/YCE-TASK-1/events'))).toBe(true);
  const oldClosed = await page.evaluate((index) => globalThis.__yuanceSseSources[index].closed, activeSourceIndex);
  expect(oldClosed).toBe(true);
  await page.evaluate((index) => globalThis.__emitYuanceSseAt(index, 'typing', JSON.stringify({ users: [{ user_id: 10, display_name: 'Late User' }] })), activeSourceIndex);
  await expect(page.locator('.work-item-typing-status')).toHaveText('');
  await expect(page.getByText('Late User')).toHaveCount(0);
});

test('work item edit success survives comments or topbar refresh failures', async ({ page }) => {
  await login(page, '/web/app/work-items/YCE-TASK-2');
  await expect(page.getByRole('heading', { level: 1, name: 'YCE-TASK-2 · 设计项目与工作项数据模型' })).toBeVisible();

  await page.route('**/api/v1/topbar/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          requirements_count: 1,
          tasks_count: 9,
          bugs_count: 2,
          notifications_count: 0,
          project_badges: [{ project_key: 'YCE', pending_count: 5 }],
          current_project: {
            key: 'YCE',
            name: '元策研发',
            pending_count: 5,
          },
        },
      }),
    });
  });

  const editedDetail = workItemDetailFixture({
    title: '刷新失败时仍保留保存结果',
    description: '辅助刷新失败不应回滚工作项详情。',
    priority: 'P2',
    updated_at: '2026-07-30T13:00:00Z',
  });
  const editedPrimaryPost = workItemCommentFixture({
    id: 903,
    body: `<div>${editedDetail.description}</div>`,
    body_format: 'html',
  });

  await page.route('**/api/v1/work-item-detail-view/YCE-TASK-2', async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    payload.data.item = editedDetail;
    payload.data.primary_post = editedPrimaryPost;
    await route.fulfill({ response, json: payload });
  });

  await page.route('**/api/v1/work-items/YCE-TASK-2/comments', async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'internal_error',
          message: '评论刷新失败。',
        },
      }),
    });
  });
  await page.route('**/api/v1/work-items/YCE-TASK-2', async (route) => {
    if (route.request().method() !== 'PATCH') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: editedDetail }),
    });
  });
  await page.route('**/api/v1/work-items/YCE-TASK-2/primary-post', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: editedPrimaryPost }),
    });
  });

  await page.getByRole('button', { name: '编辑内容' }).click();
  const editForm = page.locator('#work-item-edit-form');
  await editForm.getByLabel('标题').fill(editedDetail.title);
  await editForm.getByLabel('主内容').fill(editedDetail.description);
  await editForm.getByRole('button', { name: '保存修改' }).click();

  await expect(page.getByRole('heading', { level: 1, name: `YCE-TASK-2 · ${editedDetail.title}` })).toBeVisible();
  await expect(page.locator('.work-item-description .yc-rich-text-content')).toHaveText(editedDetail.description);
  await expect(page.getByRole('status')).toHaveText('YCE-TASK-2 已保存。');
  await expect(page.getByRole('navigation', { name: '应用导航' }).getByRole('link', { name: /任务/ })).toContainText('9');
  await expect(page.getByRole('alert')).toHaveText('工作项已保存，但详情、评论或顶部状态刷新失败，请手动刷新。');
});

test('work item edit preserves committed fields and retryable primary post after partial failure', async ({ page }) => {
  await login(page, '/web/app/work-items/YCE-TASK-2');
  await expect(page.getByRole('heading', { level: 1, name: 'YCE-TASK-2 · 设计项目与工作项数据模型' })).toBeVisible();

  const editedDetail = workItemDetailFixture({
    title: '字段保存成功但主帖失败',
    updated_at: '2026-08-08T15:00:00Z',
  });
  let fieldPatchCount = 0;
  let primaryPostPatchCount = 0;
  const savedPrimaryPost = workItemCommentFixture({
    id: 905,
    body: '<p>保留这段正文用于重试。</p>',
    body_format: 'html',
  });
  await page.route('**/api/v1/work-items/YCE-TASK-2', async (route) => {
    if (route.request().method() !== 'PATCH') {
      await route.continue();
      return;
    }
    fieldPatchCount += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: editedDetail }),
    });
  });
  await page.route('**/api/v1/work-items/YCE-TASK-2/primary-post', async (route) => {
    primaryPostPatchCount += 1;
    await route.fulfill(primaryPostPatchCount === 1 ? {
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'internal_error', message: '主帖暂时无法保存。' } }),
    } : {
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: savedPrimaryPost }),
    });
  });

  await page.getByRole('button', { name: '编辑内容' }).click();
  const editForm = page.locator('#work-item-edit-form');
  await editForm.getByLabel('标题').fill(editedDetail.title);
  await editForm.getByLabel('主内容').fill('保留这段正文用于重试。');
  await editForm.getByRole('button', { name: '保存修改' }).click();

  await expect.poll(() => fieldPatchCount).toBe(1);
  await expect.poll(() => primaryPostPatchCount).toBe(1);
  await expect(page.getByRole('heading', { level: 1, name: `YCE-TASK-2 · ${editedDetail.title}` })).toBeVisible();
  await expect(editForm.getByLabel('主内容')).toHaveText('保留这段正文用于重试。');
  await expect(page.getByRole('status')).toHaveText('YCE-TASK-2 字段已保存，主内容需要重试。');
  await expect(page.getByRole('alert')).toHaveText('工作项字段已保存，但主内容保存失败：主帖暂时无法保存。');
  await expect(editForm.getByRole('button', { name: '保存修改' })).toBeEnabled();

  await editForm.getByRole('button', { name: '保存修改' }).click();
  await expect.poll(() => primaryPostPatchCount).toBe(2);
  expect(fieldPatchCount).toBe(1);
  await expect(page.getByRole('status')).toHaveText('YCE-TASK-2 已保存。');
});

test('work item refresh keeps the primary post out of comments when detail refresh fails', async ({ page }) => {
  await login(page, '/web/app/work-items/YCE-TASK-2');
  await expect(page.getByRole('heading', { level: 1, name: 'YCE-TASK-2 · 设计项目与工作项数据模型' })).toBeVisible();
  const editedDetail = workItemDetailFixture({ title: '详情刷新失败仍保持主帖去重' });
  const primaryPost = workItemCommentFixture({
    id: 906,
    body: '<p>只应显示一次的主帖正文</p>',
    body_format: 'html',
  });
  await page.route('**/api/v1/work-item-detail-view/YCE-TASK-2', (route) => route.fulfill({
    status: 500,
    contentType: 'application/json',
    body: JSON.stringify({ error: { code: 'internal_error', message: '详情刷新失败。' } }),
  }));
  await page.route('**/api/v1/work-items/YCE-TASK-2/comments', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: [primaryPost, workItemCommentFixture({ id: 907, body: '普通讨论' })] }),
  }));
  await page.route('**/api/v1/work-items/YCE-TASK-2', async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: editedDetail }) });
  });
  await page.route('**/api/v1/work-items/YCE-TASK-2/primary-post', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: primaryPost }),
  }));

  await page.getByRole('button', { name: '编辑内容' }).click();
  const editForm = page.locator('#work-item-edit-form');
  await editForm.getByLabel('标题').fill(editedDetail.title);
  await editForm.getByLabel('主内容').fill('只应显示一次的主帖正文');
  await editForm.getByRole('button', { name: '保存修改' }).click();

  await expect(page.getByText('只应显示一次的主帖正文', { exact: true })).toHaveCount(1);
  await expect(page.getByText('普通讨论', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveText('工作项已保存，但详情、评论或顶部状态刷新失败，请手动刷新。');
});

test('work item lifecycle closes and reopens through shared confirmation', async ({ page }) => {
  await login(page, '/web/app/work-items/YCE-TASK-2');
  await expect(page.getByRole('button', { name: '关闭工作项' })).toBeVisible();

  const statuses = [];
  let currentDetail = workItemDetailFixture();
  await page.route('**/api/v1/work-item-detail-view/YCE-TASK-2', async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    payload.data.item = currentDetail;
    payload.data.permissions.can_close_work_item = currentDetail.status !== 'closed';
    payload.data.permissions.can_reopen_work_item = currentDetail.status === 'closed';
    await route.fulfill({ response, json: payload });
  });
  await page.route('**/api/v1/work-items/YCE-TASK-2', async (route) => {
    if (route.request().method() !== 'PATCH') {
      await route.continue();
      return;
    }
    const status = route.request().postDataJSON().status;
    statuses.push(status);
    currentDetail = workItemDetailFixture({ status, updated_at: `2026-08-08T10:0${statuses.length}:00Z` });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: currentDetail }) });
  });

  await page.getByRole('button', { name: '关闭工作项' }).click();
  const closeDialog = page.getByRole('dialog', { name: '关闭工作项' });
  await expect(closeDialog).toContainText('YCE-TASK-2');
  await closeDialog.getByRole('button', { name: '确认' }).click();
  await expect(page.getByRole('status')).toHaveText('YCE-TASK-2 已关闭。');
  await expect(page.getByRole('button', { name: '重新打开' })).toBeVisible();

  await page.getByRole('button', { name: '重新打开' }).click();
  await page.getByRole('dialog', { name: '重新打开工作项' }).getByRole('button', { name: '确认' }).click();
  await expect(page.getByRole('status')).toHaveText('YCE-TASK-2 已重新打开。');
  await expect(page.getByRole('button', { name: '关闭工作项' })).toBeVisible();
  expect(statuses).toEqual(['closed', 'in_progress']);
});

test('deleted work item restores through the shared lifecycle action', async ({ page }) => {
  await login(page, '/web/app/work-items/YCE-TASK-2');
  let currentDetail = workItemDetailFixture({ deleted_at: '2026-08-08T09:00:00Z' });
  let restoreCount = 0;
  await page.route('**/api/v1/work-item-detail-view/YCE-TASK-2', async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    payload.data.item = currentDetail;
    payload.data.permissions.can_edit_primary_post = !currentDetail.deleted_at;
    payload.data.permissions.can_close_work_item = false;
    payload.data.permissions.can_reopen_work_item = false;
    payload.data.permissions.can_restore_work_item = Boolean(currentDetail.deleted_at);
    await route.fulfill({ response, json: payload });
  });
  await page.route('**/api/v1/work-items/YCE-TASK-2/restore', async (route) => {
    restoreCount += 1;
    currentDetail = workItemDetailFixture({ deleted_at: '', updated_at: '2026-08-08T09:30:00Z' });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: currentDetail }) });
  });
  await page.reload();

  await expect(page.getByText(/当前仅供审计查看/)).toBeVisible();
  await page.getByRole('button', { name: '恢复工作项' }).click();
  await page.getByRole('dialog', { name: '恢复工作项' }).getByRole('button', { name: '确认' }).click();
  await expect(page.getByRole('status')).toHaveText('YCE-TASK-2 已恢复。');
  await expect(page.getByRole('button', { name: '编辑内容' })).toBeVisible();
  expect(restoreCount).toBe(1);
});

test('work item detail load failure does not expose stale write forms', async ({ page }) => {
  await login(page, '/web/app/work-items/YCE-TASK-2');
  await expect(page.getByRole('heading', { level: 1, name: 'YCE-TASK-2 · 设计项目与工作项数据模型' })).toBeVisible();

  await page.route('**/api/v1/work-item-detail-view/YCE-TASK-1', async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'internal_error',
          message: '详情加载失败。',
        },
      }),
    });
  });

  await page.locator('.work-item-back').click();
  await expect(page.getByRole('heading', { level: 2, name: '任务列表' })).toBeVisible();
  await page.locator('.work-item-row', { hasText: 'YCE-TASK-1' }).getByRole('link', { name: '打开详情' }).click();

  await expect(page).toHaveURL(/\/web\/app\/work-items\/YCE-TASK-1$/);
  await expect(page.getByRole('alert')).toContainText('详情加载失败。');
  await expect(page.getByText('工作项详情暂不可用。')).toBeVisible();
  await expect(page.locator('.work-item-action-form')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1, name: /YCE-TASK-2/ })).toHaveCount(0);
});

test('work item mutation disables peer form and ignores stale responses after navigation', async ({ page }) => {
  await login(page, '/web/app/work-items/YCE-TASK-2');
  await expect(page.getByRole('heading', { level: 1, name: 'YCE-TASK-2 · 设计项目与工作项数据模型' })).toBeVisible();

  let patchCount = 0;
  let releasePatch = () => {};
  const patchRelease = new Promise((resolve) => {
    releasePatch = resolve;
  });
  const staleDetail = workItemDetailFixture({
    title: '旧响应不能覆盖当前工作项',
    description: '这个响应返回时用户已经离开原详情页。',
    updated_at: '2026-07-30T13:30:00Z',
  });

  await page.route('**/api/v1/work-items/YCE-TASK-2', async (route) => {
    if (route.request().method() !== 'PATCH') {
      await route.continue();
      return;
    }
    patchCount += 1;
    await patchRelease;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: staleDetail }),
    });
  });

  await page.getByRole('button', { name: '编辑内容' }).click();
  const editForm = page.locator('#work-item-edit-form');
  const saveButton = editForm.locator('button[type="submit"]');
  await editForm.getByLabel('标题').fill(staleDetail.title);
  await saveButton.click();

  await expect.poll(() => patchCount).toBe(1);
  await expect(saveButton).toBeDisabled();
  await expect(page.getByRole('button', { name: '取消' })).toBeDisabled();

  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.locator('.work-item-back').click();
  await expect(page.getByRole('heading', { level: 2, name: '任务列表' })).toBeVisible();
  await page.locator('.work-item-row', { hasText: 'YCE-TASK-1' }).getByRole('link', { name: '打开详情' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /YCE-TASK-1/ })).toBeVisible();

  releasePatch();

  await expect(page.getByRole('heading', { level: 1, name: /YCE-TASK-1/ })).toBeVisible();
  await expect(page.getByText(staleDetail.title)).toHaveCount(0);
  await expect(page).toHaveURL(/\/web\/app\/work-items\/YCE-TASK-1$/);
});

test('work item mutation ignores stale response after re-entering the same item', async ({ page }) => {
  await login(page, '/web/app/work-items/YCE-TASK-2');
  await expect(page.getByRole('heading', { level: 1, name: 'YCE-TASK-2 · 设计项目与工作项数据模型' })).toBeVisible();

  let patchCount = 0;
  let releasePatch = () => {};
  const patchRelease = new Promise((resolve) => {
    releasePatch = resolve;
  });
  const staleDetail = workItemDetailFixture({
    title: '同项旧响应不能覆盖当前输入',
    description: '这个旧响应返回时用户已经重新进入同一工作项。',
    updated_at: '2026-07-30T13:45:00Z',
  });

  await page.route('**/api/v1/work-items/YCE-TASK-2', async (route) => {
    if (route.request().method() !== 'PATCH') {
      await route.continue();
      return;
    }
    patchCount += 1;
    await patchRelease;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: staleDetail }),
    });
  });

  await page.getByRole('button', { name: '编辑内容' }).click();
  const firstEditForm = page.locator('#work-item-edit-form');
  await firstEditForm.getByLabel('标题').fill(staleDetail.title);
  await firstEditForm.getByRole('button', { name: '保存修改' }).click();
  await expect.poll(() => patchCount).toBe(1);

  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.locator('.work-item-back').click();
  await expect(page.getByRole('heading', { level: 2, name: '任务列表' })).toBeVisible();
  await page.locator('.work-item-row', { hasText: 'YCE-TASK-2' }).getByRole('link', { name: '打开详情' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'YCE-TASK-2 · 设计项目与工作项数据模型' })).toBeVisible();

  await page.getByRole('button', { name: '编辑内容' }).click();
  const currentEditForm = page.locator('#work-item-edit-form');
  const currentTitle = currentEditForm.getByLabel('标题');
  await expect(currentEditForm.getByRole('button', { name: '保存修改' })).toBeEnabled();
  await currentTitle.fill('当前重新输入未提交');

  releasePatch();

  await expect(currentTitle).toHaveValue('当前重新输入未提交');
  await expect(page.getByText(staleDetail.title)).toHaveCount(0);
  await expect(page).toHaveURL(/\/web\/app\/work-items\/YCE-TASK-2$/);
});

test('work item mutation result is not rolled back by an older refresh response', async ({ page }) => {
  await login(page, '/web/app/work-items/YCE-TASK-2');
  await expect(page.getByRole('heading', { level: 1, name: 'YCE-TASK-2 · 设计项目与工作项数据模型' })).toBeVisible();

  let releaseRefresh = () => {};
  const refreshRelease = new Promise((resolve) => {
    releaseRefresh = resolve;
  });
  let delayedRefreshCount = 0;
  const oldRefreshDetail = workItemDetailFixture({
    title: '旧刷新响应',
    description: '旧刷新响应不应该覆盖保存结果。',
  });
  const savedDetail = workItemDetailFixture({
    title: '保存结果优先',
    description: 'PATCH 成功结果应保留在页面上。',
    updated_at: '2026-07-30T14:00:00Z',
  });
  const savedPrimaryPost = workItemCommentFixture({
    id: 904,
    body: `<div>${savedDetail.description}</div>`,
    body_format: 'html',
  });

  await page.route('**/api/v1/work-item-detail-view/YCE-TASK-2', async (route) => {
    delayedRefreshCount += 1;
    await refreshRelease;
    const response = await route.fetch();
    const payload = await response.json();
    payload.data.item = oldRefreshDetail;
    await route.fulfill({
      response,
      json: payload,
    });
  });
  await page.route('**/api/v1/work-items/YCE-TASK-2', async (route) => {
    if (route.request().method() !== 'PATCH') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: savedDetail }),
    });
  });
  await page.route('**/api/v1/work-items/YCE-TASK-2/primary-post', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: savedPrimaryPost }),
    });
  });

  await page.getByRole('button', { name: '刷新' }).click();
  await expect.poll(() => delayedRefreshCount).toBe(1);

  await page.getByRole('button', { name: '编辑内容' }).click();
  const editForm = page.locator('#work-item-edit-form');
  await editForm.getByLabel('标题').fill(savedDetail.title);
  await editForm.getByLabel('主内容').fill(savedDetail.description);
  await editForm.getByRole('button', { name: '保存修改' }).click();
  await expect(page.getByRole('heading', { level: 1, name: `YCE-TASK-2 · ${savedDetail.title}` })).toBeVisible();

  releaseRefresh();

  await expect(page.getByRole('heading', { level: 1, name: `YCE-TASK-2 · ${savedDetail.title}` })).toBeVisible();
  await expect(page.locator('.work-item-description .yc-rich-text-content')).toHaveText(savedDetail.description);
  await expect(page.getByText(oldRefreshDetail.title)).toHaveCount(0);
});

test('work item edit form keeps input on validation and server errors', async ({ page }) => {
  await login(page, '/web/app/work-items/YCE-TASK-2');
  await expect(page.getByRole('heading', { level: 1, name: 'YCE-TASK-2 · 设计项目与工作项数据模型' })).toBeVisible();

  let patchCount = 0;
  await page.route('**/api/v1/work-items/YCE-TASK-2', async (route) => {
    if (route.request().method() !== 'PATCH') {
      await route.continue();
      return;
    }
    patchCount += 1;
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'bad_request',
          message: '服务端拒绝保存。',
        },
      }),
    });
  });

  await page.getByRole('button', { name: '编辑内容' }).click();
  const editForm = page.locator('#work-item-edit-form');
  const titleInput = editForm.getByLabel('标题');
  await titleInput.fill('   ');
  await editForm.getByRole('button', { name: '保存修改' }).click();

  await expect(page.getByRole('alert')).toHaveText('标题不能为空。');
  await expect.poll(() => patchCount).toBe(0);
  await expect(titleInput).toHaveValue('   ');

  await titleInput.fill('不会成功的标题');
  await editForm.getByLabel('主内容').fill('失败后仍保留的描述');
  await editForm.getByRole('button', { name: '保存修改' }).click();

  await expect.poll(() => patchCount).toBe(1);
  await expect(page.getByRole('alert')).toHaveText('服务端拒绝保存。');
  await expect(titleInput).toHaveValue('不会成功的标题');
  await expect(editForm.getByLabel('主内容')).toHaveText('失败后仍保留的描述');
  await expect(editForm.getByRole('button', { name: '保存修改' })).toBeEnabled();
  await page.getByRole('button', { name: '关闭', exact: true }).click();

  await page.route('**/api/v1/work-items/YCE-TASK-2/handoff', async (route) => {
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'forbidden',
          message: '服务端拒绝推进。',
        },
      }),
    });
  });

  await page.getByRole('button', { name: '指派 / 流转' }).click();
  const handoffForm = page.locator('#work-item-handoff-form');
  await handoffForm.getByLabel('处理说明').fill('失败后仍保留的推进说明');
  await handoffForm.getByRole('button', { name: '确认推进' }).click();

  await expect(page.getByRole('alert')).toHaveText('服务端拒绝推进。');
  await expect(handoffForm.getByLabel('处理说明')).toHaveValue('失败后仍保留的推进说明');
  await expect(handoffForm.getByRole('button', { name: '确认推进' })).toBeEnabled();
});

test('work item comments create rich mentions, reply, and edit through one shared composer', async ({ page }) => {
  const createRequests = [];
  const updateRequests = [];
  const comments = [
    workItemCommentFixture({
      body: '<p>初始可编辑评论</p><a data-yuance-attachment-id="811" data-yuance-attachment-kind="file" href="/web/work-items/YCE-TASK-2/comments/901/attachments/811/download">comment-log.txt</a>',
      body_format: 'html',
    }),
    workItemCommentFixture({
      id: 902,
      body: '已有流转记录',
      is_flow: true,
    }),
  ];

  await page.route('**/api/v1/work-items/YCE-TASK-2/comments/*', async (route) => {
    if (route.request().method() !== 'PATCH') {
      await route.continue();
      return;
    }
    const payload = route.request().postDataJSON();
    updateRequests.push({
      url: route.request().url(),
      headers: route.request().headers(),
      payload,
    });
    const updated = workItemCommentFixture({
      id: 903,
      body: payload.body,
      updated_at: '2026-07-30T15:10:00Z',
    });
    const index = comments.findIndex((comment) => comment.id === 903);
    if (index >= 0) {
      comments[index] = updated;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: updated }),
    });
  });
  await page.route('**/api/v1/work-items/YCE-TASK-2/comments', async (route) => {
    if (route.request().method() === 'POST') {
      const payload = route.request().postDataJSON();
      createRequests.push({
        headers: route.request().headers(),
        payload,
      });
      const created = workItemCommentFixture({
        id: payload.parent_comment_id ? 904 : 903,
        parent_comment_id: payload.parent_comment_id ?? null,
        parent_author: payload.parent_comment_id ? '系统管理员' : '',
        body: payload.body,
        body_format: payload.body_format,
        created_at: '2026-07-30T15:00:00Z',
        updated_at: '2026-07-30T15:00:00Z',
      });
      comments.push(created);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: created }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: comments }),
    });
  });

  await login(page, '/web/app/work-items/YCE-TASK-2');
  await expect(page.getByText('初始可编辑评论')).toBeVisible();
  await expect(page.locator('#comment-902').getByRole('button', { name: '编辑' })).toHaveCount(0);

  const newCommentInput = page.getByLabel('新增评论');
  await newCommentInput.fill('新增 Web 评论 @yuan');
  const newCommentForm = page.locator('.work-item-comment-form');
  await expect(newCommentForm.getByRole('option', { name: /@yuance_admin/ })).toBeVisible();
  await newCommentInput.press('Enter');
  await page.getByRole('button', { name: '发布评论' }).click();

  await expect.poll(() => createRequests.length).toBe(1);
  expect(createRequests[0].headers['x-yuance-csrf-token']).toBeTruthy();
  expect(createRequests[0].payload).toMatchObject({
    body_format: 'html',
  });
  expect(createRequests[0].payload.body).toContain('新增 Web 评论');
  expect(createRequests[0].payload.body).toContain('data-yuance-mention-username="yuance_admin"');
  await expect(page.getByRole('status')).toHaveText('YCE-TASK-2 评论已发布。');
  await expect(page.getByText('新增 Web 评论')).toBeVisible();
  await expect(newCommentInput).toHaveText('');

  const newCommentRow = page.locator('#comment-903');
  await newCommentRow.getByRole('button', { name: '回复' }).click();
  await newCommentRow.getByLabel('回复 系统管理员').fill('共享富文本回复');
  await newCommentRow.getByRole('button', { name: '回复评论' }).click();
  await expect.poll(() => createRequests.length).toBe(2);
  expect(createRequests[1].payload).toMatchObject({
    body_format: 'html',
    parent_comment_id: 903,
  });
  expect(createRequests[1].payload.body).toContain('共享富文本回复');
  await expect(page.getByRole('status')).toHaveText('YCE-TASK-2 回复已发布。');
  await expect(page.locator('#comment-904')).toContainText('回复 系统管理员');

  await newCommentRow.getByRole('button', { name: '编辑' }).click();
  await expect(newCommentRow.getByLabel('编辑评论')).toBeFocused();
  await expect(page.locator('#comment-901').getByRole('button', { name: '编辑' })).toHaveCount(0);
  await newCommentRow.getByLabel('编辑评论').fill('编辑后的 Web 评论');
  await newCommentRow.getByRole('button', { name: '保存评论' }).click();

  await expect.poll(() => updateRequests.length).toBe(1);
  expect(updateRequests[0].url).toContain('/api/v1/work-items/YCE-TASK-2/comments/903');
  expect(updateRequests[0].headers['x-yuance-csrf-token']).toBeTruthy();
  expect(updateRequests[0].payload).toMatchObject({
    body_format: 'html',
  });
  expect(updateRequests[0].payload.body).toContain('编辑后的 Web 评论');
  await expect(page.getByRole('status')).toHaveText('YCE-TASK-2 评论已更新。');
  await expect(page.getByText('编辑后的 Web 评论')).toBeVisible();
  await expect(page.getByText('新增 Web 评论')).toHaveCount(0);
  await expect(newCommentRow.getByRole('button', { name: '编辑' })).toBeFocused();
});

test('work item comment mutation result is not rolled back by an older comments refresh', async ({ page }) => {
  const originalComments = [workItemCommentFixture()];
  const comments = [...originalComments];
  let releaseOldComments = () => {};
  const oldCommentsRelease = new Promise((resolve) => {
    releaseOldComments = resolve;
  });
  let holdOldCommentsRefresh = false;
  let oldCommentsRefreshHeld = false;

  await page.route('**/api/v1/work-items/YCE-TASK-2/comments', async (route) => {
    if (route.request().method() === 'POST') {
      const created = workItemCommentFixture({
        id: 905,
        body: route.request().postDataJSON().body,
        created_at: '2026-07-30T15:30:00Z',
        updated_at: '2026-07-30T15:30:00Z',
      });
      comments.push(created);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: created }),
      });
      return;
    }
    if (holdOldCommentsRefresh && !oldCommentsRefreshHeld) {
      oldCommentsRefreshHeld = true;
      await oldCommentsRelease;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: originalComments }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: comments }),
    });
  });

  await login(page, '/web/app/work-items/YCE-TASK-2');
  await expect(page.getByText('初始可编辑评论')).toBeVisible();

  holdOldCommentsRefresh = true;
  await page.getByRole('button', { name: '刷新' }).click();
  await expect.poll(() => oldCommentsRefreshHeld).toBe(true);

  await page.getByLabel('新增评论').fill('旧刷新不能覆盖的评论');
  await page.getByRole('button', { name: '发布评论' }).click();
  await expect(page.getByText('旧刷新不能覆盖的评论')).toBeVisible();

  releaseOldComments();

  await expect(page.getByText('旧刷新不能覆盖的评论')).toBeVisible();
  await expect(page.locator('#comment-905')).toBeVisible();
});

test('work item comment form keeps input on validation and edit errors', async ({ page }) => {
  let postCount = 0;
  await page.route('**/api/v1/work-items/YCE-TASK-2/comments/901', async (route) => {
    if (route.request().method() !== 'PATCH') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'forbidden',
          message: '不能编辑这条评论。',
        },
      }),
    });
  });
  await page.route('**/api/v1/work-items/YCE-TASK-2/comments', async (route) => {
    if (route.request().method() === 'POST') {
      postCount += 1;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [workItemCommentFixture()] }),
    });
  });

  await login(page, '/web/app/work-items/YCE-TASK-2');

  const newCommentInput = page.getByLabel('新增评论');
  await newCommentInput.fill('   ');
  await page.getByRole('button', { name: '发布评论' }).click();

  await expect(page.getByRole('alert')).toHaveText('评论内容不能为空。');
  await expect.poll(() => postCount).toBe(0);
  await expect(newCommentInput).toBeFocused();
  await expect(newCommentInput).toHaveText('   ');

  const commentRow = page.locator('#comment-901');
  await commentRow.getByRole('button', { name: '编辑' }).click();
  await expect(commentRow.getByLabel('编辑评论')).toBeFocused();
  await commentRow.getByLabel('编辑评论').fill('服务端会拒绝的评论');
  await commentRow.getByRole('button', { name: '保存评论' }).click();

  await expect(page.getByRole('alert')).toHaveText('不能编辑这条评论。');
  await expect(commentRow.getByLabel('编辑评论')).toHaveText('服务端会拒绝的评论');
  await expect(commentRow.locator('.yc-rich-text-plain', { hasText: '初始可编辑评论' })).toBeVisible();
  await expect(commentRow.getByRole('button', { name: '保存评论' })).toBeEnabled();
});

test('work item comment creation preserves comment anchor route', async ({ page }) => {
  const comments = [workItemCommentFixture()];
  await page.route('**/api/v1/work-items/YCE-TASK-2/comments', async (route) => {
    if (route.request().method() === 'POST') {
      const created = workItemCommentFixture({
        id: 904,
        body: route.request().postDataJSON().body,
        created_at: '2026-07-30T15:20:00Z',
        updated_at: '2026-07-30T15:20:00Z',
      });
      comments.push(created);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: created }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: comments }),
    });
  });

  await login(page, '/web/app/work-items/YCE-TASK-2#comment-901');
  await expect(page).toHaveURL(/\/web\/app\/work-items\/YCE-TASK-2#comment-901$/);

  await page.getByLabel('新增评论').fill('锚点保持评论');
  await page.getByRole('button', { name: '发布评论' }).click();

  await expect(page.getByText('锚点保持评论')).toBeVisible();
  await expect(page).toHaveURL(/\/web\/app\/work-items\/YCE-TASK-2#comment-901$/);
});

test('work item comment edit confirms attachment deletion and removes its rich text reference', async ({ page }) => {
  const attachment = attachmentFixture({ id: 811, filename: 'comment-log.txt', content_type: 'text/plain', byte_size: 512 });
  const comments = [workItemCommentFixture({
    body: '<p>保留正文 811</p><a data-yuance-attachment-id="811" data-yuance-attachment-kind="file" href="/web/work-items/YCE-TASK-2/comments/901/attachments/811/download">comment-log.txt</a>',
    body_format: 'html',
  })];
  const deleteRequests = [];
  const updateRequests = [];
  let attachments = [attachment];
  await page.route('**/api/v1/work-items/YCE-TASK-2/comments/901/attachments', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: attachments }) }));
  await page.route(/\/api\/v1\/work-items\/YCE-TASK-2\/comments\/901\/attachments\/811$/u, async (route) => {
    deleteRequests.push(route.request().headers());
    attachments = [];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { ...attachment, status: 'deleted' } }) });
  });
  await page.route('**/api/v1/work-items/YCE-TASK-2/comments/901', async (route) => {
    const payload = route.request().postDataJSON();
    updateRequests.push(payload);
    comments[0] = { ...comments[0], body: payload.body, body_format: payload.body_format };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: comments[0] }) });
  });
  await page.route('**/api/v1/work-items/YCE-TASK-2/comments', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: comments }) }));

  await login(page, '/web/app/work-items/YCE-TASK-2');
  const row = page.locator('#comment-901');
  await row.getByRole('button', { name: '编辑' }).click();
  await row.getByRole('button', { name: '删除', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '删除评论附件' });
  await expect(dialog).toContainText('对象存储中的文件和评论正文中的附件引用都会立即删除');
  await dialog.getByRole('button', { name: '取消' }).click();
  await expect(dialog).toBeHidden();
  expect(deleteRequests).toHaveLength(0);
  await row.getByRole('button', { name: '删除', exact: true }).click();
  await dialog.getByRole('button', { name: '确认删除' }).click();
  await expect.poll(() => deleteRequests.length).toBe(1);
  expect(deleteRequests[0]['x-yuance-editor-context']).toBe('work-item-comment-edit');
  await expect(row.getByRole('button', { name: '下载评论附件 comment-log.txt' })).toHaveCount(0);
  await expect(row.getByLabel('编辑评论').locator('[data-yuance-attachment-id="811"]')).toHaveCount(0);
  await row.getByRole('button', { name: '保存评论' }).click();
  await expect.poll(() => updateRequests.length).toBe(1);
  expect(updateRequests[0].body).toContain('保留正文 811');
  expect(updateRequests[0].body).not.toContain('data-yuance-attachment-id="811"');
});

test('work item attachments can list download and upload for item and comments', async ({ page }) => {
  const workItemAttachments = [
    attachmentFixture(),
    attachmentFixture({
      id: 802,
      filename: 'pending-dump.zip',
      content_type: 'application/zip',
      byte_size: 4096,
      status: 'pending',
    }),
  ];
  const commentAttachments = {
    901: [
      attachmentFixture({
        id: 811,
        filename: 'comment-log.txt',
        content_type: 'text/plain',
        byte_size: 512,
      }),
    ],
    902: [],
  };
  const comments = [
    workItemCommentFixture(),
    workItemCommentFixture({
      id: 902,
      body: '另一条评论不应展示 901 的附件',
    }),
  ];
  const downloadUrlRequests = [];
  const workItemCreateRequests = [];
  const commentCreateRequests = [];
  const commentDraftRequests = [];
  const commentDraftPublishRequests = [];
  const commentDraftCancelRequests = [];
  let nextDraftId = 950;
  const uploadStages = [];
  let workItemAttachmentListGets = 0;
  const commentAttachmentListGets = {};

  await page.route('**/api/v1/test-storage/upload**', async (route) => {
    expect(route.request().headers()['x-yuance-csrf-token']).toBeTruthy();
    uploadStages.push(`put:${new URL(route.request().url()).searchParams.get('target')}`);
    await route.fulfill({ status: 200, body: '' });
  });
  await page.route('**/api/v1/work-items/YCE-TASK-2/attachments/*/download-url', async (route) => {
    const parts = new URL(route.request().url()).pathname.split('/');
    const attachmentId = Number(parts[parts.length - 2]);
    downloadUrlRequests.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          attachment: workItemAttachments.find((attachment) => attachment.id === attachmentId),
          request: {
            method: 'GET',
            url: `/signed-download/work-item-${attachmentId}`,
            headers: [],
          },
          expires_in_seconds: 600,
        },
      }),
    });
  });
  await page.route('**/api/v1/work-items/YCE-TASK-2/attachments/*/upload-url', async (route) => {
    const parts = new URL(route.request().url()).pathname.split('/');
    const attachmentId = Number(parts[parts.length - 2]);
    uploadStages.push(`sign:work-item:${attachmentId}`);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          attachment: workItemAttachments.find((attachment) => attachment.id === attachmentId),
          request: {
            method: 'PUT',
            url: `/api/v1/test-storage/upload?target=work-item-${attachmentId}`,
            headers: [['content-type', 'text/plain']],
          },
          expires_in_seconds: 600,
        },
      }),
    });
  });
  await page.route('**/api/v1/work-items/YCE-TASK-2/attachments/*/uploaded', async (route) => {
    const parts = new URL(route.request().url()).pathname.split('/');
    const attachmentId = Number(parts[parts.length - 2]);
    uploadStages.push(`mark:work-item:${attachmentId}`);
    const index = workItemAttachments.findIndex((attachment) => attachment.id === attachmentId);
    workItemAttachments[index] = { ...workItemAttachments[index], status: 'uploaded' };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: workItemAttachments[index] }),
    });
  });
  await page.route('**/api/v1/work-items/YCE-TASK-2/attachments', async (route) => {
    if (route.request().method() === 'POST') {
      const payload = route.request().postDataJSON();
      workItemCreateRequests.push(payload);
      const created = attachmentFixture({
        id: 803,
        filename: payload.original_filename,
        content_type: payload.content_type,
        byte_size: payload.byte_size,
        status: 'pending',
      });
      workItemAttachments.push(created);
      uploadStages.push(`create:work-item:${created.id}`);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: created }),
      });
      return;
    }
    workItemAttachmentListGets += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: workItemAttachments }),
    });
  });
  await page.route('**/api/v1/work-items/YCE-TASK-2/comments/*/attachments/*/download-url', async (route) => {
    const parts = new URL(route.request().url()).pathname.split('/');
    const commentId = Number(parts[parts.indexOf('comments') + 1]);
    const attachmentId = Number(parts[parts.length - 2]);
    downloadUrlRequests.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          attachment: commentAttachments[commentId].find((attachment) => attachment.id === attachmentId),
          request: {
            method: 'GET',
            url: `/signed-download/comment-${commentId}-${attachmentId}`,
            headers: [],
          },
          expires_in_seconds: 600,
        },
      }),
    });
  });
  await page.route('**/api/v1/work-items/YCE-TASK-2/comments/*/attachments/*/upload-url', async (route) => {
    const parts = new URL(route.request().url()).pathname.split('/');
    const commentId = Number(parts[parts.indexOf('comments') + 1]);
    const attachmentId = Number(parts[parts.length - 2]);
    uploadStages.push(`sign:comment:${commentId}:${attachmentId}`);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          attachment: commentAttachments[commentId].find((attachment) => attachment.id === attachmentId),
          request: {
            method: 'PUT',
            url: `/api/v1/test-storage/upload?target=comment-${commentId}-${attachmentId}`,
            headers: [['content-type', 'text/plain']],
          },
          expires_in_seconds: 600,
        },
      }),
    });
  });
  await page.route('**/api/v1/work-items/YCE-TASK-2/comments/*/attachments/*/uploaded', async (route) => {
    const parts = new URL(route.request().url()).pathname.split('/');
    const commentId = Number(parts[parts.indexOf('comments') + 1]);
    const attachmentId = Number(parts[parts.length - 2]);
    uploadStages.push(`mark:comment:${commentId}:${attachmentId}`);
    const index = commentAttachments[commentId].findIndex((attachment) => attachment.id === attachmentId);
    commentAttachments[commentId][index] = { ...commentAttachments[commentId][index], status: 'uploaded' };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: commentAttachments[commentId][index] }),
    });
  });
  await page.route('**/api/v1/work-items/YCE-TASK-2/comments/*/attachments', async (route) => {
    const parts = new URL(route.request().url()).pathname.split('/');
    const commentId = Number(parts[parts.indexOf('comments') + 1]);
    if (route.request().method() === 'POST') {
      const payload = route.request().postDataJSON();
      commentCreateRequests.push({ commentId, payload });
      const created = attachmentFixture({
        id: commentId === 901 ? 812 : 813 + commentCreateRequests.length,
        filename: payload.original_filename,
        content_type: payload.content_type,
        byte_size: payload.byte_size,
        status: 'pending',
      });
      commentAttachments[commentId].push(created);
      uploadStages.push(`create:comment:${commentId}:${created.id}`);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: created }),
      });
      return;
    }
    commentAttachmentListGets[commentId] = (commentAttachmentListGets[commentId] || 0) + 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: commentAttachments[commentId] || [] }),
    });
  });
  await page.route('**/api/v1/work-items/YCE-TASK-2/comments/draft', async (route) => {
    const payload = route.request().postDataJSON();
    const id = nextDraftId++;
    commentDraftRequests.push(payload);
    commentAttachments[id] = [];
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ data: workItemCommentFixture({ id, body: '', body_format: 'html', is_draft: true }) }),
    });
  });
  await page.route('**/api/v1/work-items/YCE-TASK-2/comments/*/publish', async (route) => {
    const parts = new URL(route.request().url()).pathname.split('/');
    const commentId = Number(parts[parts.indexOf('comments') + 1]);
    const payload = route.request().postDataJSON();
    commentDraftPublishRequests.push({ commentId, payload });
    const published = workItemCommentFixture({ id: commentId, body: payload.body, body_format: payload.body_format, is_draft: false });
    comments.push(published);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: published }) });
  });
  await page.route('**/api/v1/work-items/YCE-TASK-2/comments/*/draft', async (route) => {
    const parts = new URL(route.request().url()).pathname.split('/');
    const commentId = Number(parts[parts.indexOf('comments') + 1]);
    commentDraftCancelRequests.push(commentId);
    commentAttachments[commentId] = [];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: workItemCommentFixture({ id: commentId, body: '', body_format: 'html', is_draft: true }) }) });
  });
  await page.route('**/api/v1/work-items/YCE-TASK-2/comments/901/attachments/811/preview', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: {
        attachment: commentAttachments[901][0],
        preview: { kind: 'document', strategy: 'text', file_type: 'txt', kind_label: '文本', is_experimental: false, legacy_preview_enabled: false, content_enabled: true },
        navigation: { position: 1, total: 1, previous: null, next: null },
        content_url: '/api/v1/work-items/YCE-TASK-2/comments/901/attachments/811/preview/content',
        download_url: '/api/v1/work-items/YCE-TASK-2/comments/901/attachments/811/download-url',
      } }),
    });
  });
  await page.route('**/api/v1/work-items/YCE-TASK-2/comments/901/attachments/811/preview/content', async (route) => {
    await route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', body: '评论附件原文' });
  });
  await page.route('**/api/v1/work-items/YCE-TASK-2/comments', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: comments }),
    });
  });
  await page.route('**/api/v1/work-items/YCE-TASK-2', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: workItemDetailFixture() }),
    });
  });

  await login(page, '/web/app/work-items/YCE-TASK-2');
  await page.evaluate(() => {
    window.__yuanceDownloadClicks = [];
    HTMLAnchorElement.prototype.click = function click() {
      window.__yuanceDownloadClicks.push(this.href);
    };
  });

  const attachmentPanel = page.locator('.work-item-attachments-panel');
  await expect(attachmentPanel).toContainText('spec.pdf');
  await expect(attachmentPanel).toContainText('2.0 KB');
  await expect(attachmentPanel).toContainText('已上传');
  await expect(attachmentPanel).toContainText('pending-dump.zip');
  await expect(attachmentPanel).toContainText('待上传');
  await expect(attachmentPanel.getByRole('button', { name: '下载附件 pending-dump.zip' })).toHaveCount(0);

  const comment901 = page.locator('#comment-901');
  const comment902 = page.locator('#comment-902');
  await expect(comment901).toContainText('comment-log.txt');
  await expect(comment902).not.toContainText('comment-log.txt');

  await comment901.getByRole('button', { name: '预览评论附件 comment-log.txt' }).click();
  const commentPreview = page.getByRole('dialog', { name: 'comment-log.txt' });
  await expect(commentPreview).toBeVisible();
  const commentTextPreview = commentPreview.locator('iframe[title="comment-log.txt 文本预览"]').contentFrame();
  await expect(commentTextPreview.locator('body')).toContainText('评论附件原文');
  await commentPreview.getByRole('button', { name: '关闭媒体预览' }).click();
  await expect(commentPreview).toBeHidden();

  await attachmentPanel.getByRole('button', { name: '下载附件 spec.pdf' }).click();
  await expect.poll(() => downloadUrlRequests.length).toBe(1);
  await expect.poll(async () => page.evaluate(() => window.__yuanceDownloadClicks[0] || '')).toContain('/signed-download/work-item-801');

  await comment901.getByRole('button', { name: '下载评论附件 comment-log.txt' }).click();
  await expect.poll(() => downloadUrlRequests.length).toBe(2);
  expect(downloadUrlRequests[1]).toContain('/api/v1/work-items/YCE-TASK-2/comments/901/attachments/811/download-url');
  await expect.poll(async () => page.evaluate(() => window.__yuanceDownloadClicks[1] || '')).toContain('/signed-download/comment-901-811');

  await chooseFile(page, attachmentPanel.getByRole('button', { name: '继续上传' }), {
    name: 'pending-dump.zip',
    mimeType: 'application/zip',
    buffer: Buffer.alloc(4096, 1),
  });
  await expect.poll(() => workItemAttachments.find((attachment) => attachment.id === 802)?.status).toBe('uploaded');
  expect(workItemCreateRequests).toHaveLength(0);
  expect(uploadStages.filter((stage) => stage.includes('work-item:802') || stage === 'put:work-item-802')).toEqual([
    'sign:work-item:802',
    'put:work-item-802',
    'mark:work-item:802',
  ]);
  await expect(attachmentPanel.getByRole('button', { name: '下载附件 pending-dump.zip' })).toBeVisible();

  await chooseFile(page, attachmentPanel.getByRole('button', { name: '选择工作项附件' }), {
    name: 'web-upload.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('hello from web'),
  });
  await expect.poll(() => workItemCreateRequests.length).toBe(1);
  expect(workItemCreateRequests[0]).toMatchObject({
    original_filename: 'web-upload.txt',
    content_type: 'text/plain',
    byte_size: 14,
  });
  expect(uploadStages.filter((stage) => stage.includes('work-item:803') || stage === 'put:work-item-803')).toEqual([
    'create:work-item:803',
    'sign:work-item:803',
    'put:work-item-803',
    'mark:work-item:803',
  ]);
  await expect.poll(() => workItemAttachmentListGets).toBeGreaterThan(1);
  await expect(attachmentPanel).toContainText('web-upload.txt');
  await expect(page.getByRole('status')).toHaveText('YCE-TASK-2 附件已上传。');

  await chooseFile(page, comment901.getByRole('button', { name: '添加附件' }), {
    name: 'comment-upload.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('hello comment'),
  });
  await expect.poll(() => commentCreateRequests.length).toBe(1);
  expect(commentCreateRequests[0]).toMatchObject({
    commentId: 901,
    payload: {
      original_filename: 'comment-upload.txt',
      content_type: 'text/plain',
      byte_size: 13,
    },
  });
  expect(uploadStages.filter((stage) => stage.includes('comment:901:812') || stage === 'put:comment-901-812')).toEqual([
    'create:comment:901:812',
    'sign:comment:901:812',
    'put:comment-901-812',
    'mark:comment:901:812',
  ]);
  await expect.poll(() => commentAttachmentListGets[901] || 0).toBeGreaterThan(1);
  await expect(comment901).toContainText('comment-upload.txt');
  await expect(comment902).not.toContainText('comment-upload.txt');
  await expect(page.getByRole('status')).toHaveText('YCE-TASK-2 评论附件已上传。');

  const newCommentEditor = page.getByLabel('新增评论');
  const newCommentForm = page.locator('.work-item-comment-form');
  await newCommentEditor.fill('带附件的新评论');
  await chooseFile(page, newCommentForm.getByRole('button', { name: '添加附件' }), {
    name: 'draft-note.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('draft attachment'),
  });
  await expect.poll(() => commentDraftRequests.length).toBe(1);
  await expect.poll(() => commentCreateRequests.some((request) => request.commentId === 950)).toBe(true);
  await expect(page.getByLabel('新评论附件')).toContainText('draft-note.txt');
  await expect(newCommentEditor).toContainText('带附件的新评论');
  await newCommentForm.getByRole('button', { name: '发表', exact: true }).click();
  await expect.poll(() => commentDraftPublishRequests.length).toBe(1);
  expect(commentDraftPublishRequests[0].commentId).toBe(950);
  expect(commentDraftPublishRequests[0].payload.body).toContain('/comments/950/attachments/');

  await newCommentEditor.fill('稍后取消');
  await chooseFile(page, newCommentForm.getByRole('button', { name: '添加附件' }), {
    name: 'cancel-me.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('cancel attachment'),
  });
  await page.getByRole('button', { name: '取消草稿' }).click();
  await expect.poll(() => commentDraftCancelRequests).toEqual([951]);
  await expect(newCommentEditor).toHaveText('');
  await expect(page.getByRole('button', { name: '取消草稿' })).toHaveCount(0);

  const pastedCommentCreateBefore = commentCreateRequests.length;
  await newCommentEditor.click();
  await newCommentEditor.evaluate((editor) => {
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'pasted.png', { type: 'image/png' });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: dataTransfer });
    editor.dispatchEvent(event);
  });
  await expect.poll(() => commentDraftRequests.length).toBe(3);
  await expect.poll(() => commentCreateRequests.length).toBe(pastedCommentCreateBefore + 1);
  const pastedCreate = commentCreateRequests[commentCreateRequests.length - 1];
  expect(pastedCreate.commentId).toBe(952);
  expect(pastedCreate.payload).toMatchObject({
    original_filename: 'pasted.png',
    content_type: 'image/png',
    byte_size: 4,
  });
  const pastedImage = newCommentEditor.getByRole('img', { name: 'pasted.png' });
  await expect(pastedImage).toBeVisible();
  await expect(pastedImage).toHaveAttribute('src', /\/comments\/952\/attachments\/\d+\/download$/u);
  await expect(pastedImage.locator('xpath=ancestor::*[@data-yuance-attachment-id][1]')).toHaveAttribute('data-yuance-attachment-id', /\d+/u);
});

test('work item attachments share preview navigation fallback download and stale-route protection', async ({ page }) => {
  const attachments = [
    attachmentFixture({ id: 821, filename: 'work-item-overview.png', content_type: 'image/png', byte_size: 68 }),
    attachmentFixture({ id: 822, filename: 'work-item-plan.pdf', content_type: 'application/pdf' }),
    attachmentFixture({ id: 823, filename: 'work-item-archive.bin', content_type: 'application/octet-stream' }),
  ];
  const previewRequests = [];
  const downloadRequests = [];
  let releaseDelayedPreview;
  const delayedPreview = new Promise((resolve) => { releaseDelayedPreview = resolve; });
  let delayNextPreview = false;
  const previewPayload = (index, kind, fileType) => ({
    attachment: attachments[index],
    preview: { kind, strategy: kind === 'image' ? 'image' : kind ? 'pdf' : null, file_type: fileType, kind_label: fileType?.toUpperCase() || null, is_experimental: false, legacy_preview_enabled: false, content_enabled: Boolean(kind) },
    navigation: {
      position: index < 2 ? index + 1 : 0,
      total: 2,
      previous: index === 1 ? { id: 821, title: attachments[0].filename, url: '/api/v1/work-items/YCE-TASK-2/attachments/821/preview' } : null,
      next: index === 0 ? { id: 822, title: attachments[1].filename, url: '/api/v1/work-items/YCE-TASK-2/attachments/822/preview' } : null,
    },
    content_url: `/api/v1/work-items/YCE-TASK-2/attachments/${attachments[index].id}/preview/content`,
    download_url: `/api/v1/work-items/YCE-TASK-2/attachments/${attachments[index].id}/download-url`,
  });

  await page.route('**/api/v1/work-items/YCE-TASK-2/attachments/*/preview', async (route) => {
    const attachmentId = Number(new URL(route.request().url()).pathname.split('/').at(-2));
    previewRequests.push(attachmentId);
    if (delayNextPreview) await delayedPreview;
    const index = attachments.findIndex((attachment) => attachment.id === attachmentId);
    const payload = index === 0 ? previewPayload(index, 'image', 'png') : index === 1 ? previewPayload(index, 'document', 'pdf') : previewPayload(index, null, null);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: payload }) });
  });
  await page.route('**/api/v1/work-items/YCE-TASK-2/attachments/821/preview/content', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: '' }));
  await page.route('**/api/v1/work-items/YCE-TASK-2/attachments/*/download-url', async (route) => {
    const attachmentId = Number(new URL(route.request().url()).pathname.split('/').at(-2));
    downloadRequests.push(attachmentId);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { attachment: attachments.find((attachment) => attachment.id === attachmentId), request: { method: 'GET', url: `/signed-download/work-item-preview-${attachmentId}`, headers: [] }, expires_in_seconds: 600 } }) });
  });
  await page.route('**/api/v1/work-items/YCE-TASK-2/attachments', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: attachments }) }));
  await page.route('**/api/v1/work-items/YCE-TASK-2/comments', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) }));
  await page.route('**/api/v1/work-items/YCE-TASK-2', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: workItemDetailFixture() }) });
  });

  await login(page, '/web/app/work-items/YCE-TASK-2');
  await page.evaluate(() => {
    window.__yuanceDownloadClicks = [];
    HTMLAnchorElement.prototype.click = function click() { window.__yuanceDownloadClicks.push(this.href); };
  });
  const attachmentPanel = page.locator('.work-item-attachments-panel');
  await attachmentPanel.getByRole('button', { name: '预览附件 work-item-overview.png' }).click();
  const imagePreview = page.getByRole('dialog', { name: 'work-item-overview.png' });
  await expect(imagePreview.getByRole('img', { name: 'work-item-overview.png' })).toHaveAttribute('src', '/api/v1/work-items/YCE-TASK-2/attachments/821/preview/content');
  await expect(imagePreview).toContainText('1 / 2');
  await imagePreview.getByRole('button', { name: '下一个' }).click();
  const documentPreview = page.getByRole('dialog', { name: 'work-item-plan.pdf' });
  await expect(documentPreview).toContainText('此文档暂不支持内嵌渲染，可下载后查看。');
  await documentPreview.getByRole('button', { name: '下载' }).click();
  await expect.poll(() => downloadRequests).toEqual([822]);
  await expect.poll(async () => page.evaluate(() => window.__yuanceDownloadClicks[0] || '')).toContain('/signed-download/work-item-preview-822');
  await documentPreview.getByRole('button', { name: '关闭附件预览' }).click();

  await attachmentPanel.getByRole('button', { name: '预览附件 work-item-archive.bin' }).click();
  const unsupportedPreview = page.getByRole('dialog', { name: 'work-item-archive.bin' });
  await expect(unsupportedPreview).toContainText('此文件类型不支持预览。');
  await unsupportedPreview.getByRole('button', { name: '关闭附件预览' }).click();

  delayNextPreview = true;
  await attachmentPanel.getByRole('button', { name: '预览附件 work-item-overview.png' }).click();
  await page.evaluate(() => {
    history.pushState({}, '', '/web/app/tasks');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  releaseDelayedPreview();
  await expect(page).toHaveURL(/\/web\/app\/tasks/u);
  await expect(page.getByRole('dialog', { name: 'work-item-overview.png' })).toHaveCount(0);
  expect(previewRequests).toEqual([821, 822, 823, 821]);
});

test('work item attachment confirmation failure keeps pending file context', async ({ page }) => {
  const workItemAttachments = [];
  const comments = [workItemCommentFixture()];
  let uploadedRequestCount = 0;
  let attachmentListGetCount = 0;
  let nextAttachmentId = 880;
  let failNextUploadedMark = true;

  await page.route('**/api/v1/test-storage/upload**', async (route) => {
    expect(route.request().headers()['x-yuance-csrf-token']).toBeTruthy();
    await route.fulfill({ status: 200, body: '' });
  });
  await page.route('**/api/v1/work-items/YCE-TASK-2/attachments/*/upload-url', async (route) => {
    const parts = new URL(route.request().url()).pathname.split('/');
    const attachmentId = Number(parts[parts.length - 2]);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          attachment: workItemAttachments.find((attachment) => attachment.id === attachmentId),
          request: {
            method: 'PUT',
            url: `/api/v1/test-storage/upload?target=work-item-${attachmentId}`,
            headers: [['content-type', 'text/plain']],
          },
          expires_in_seconds: 600,
        },
      }),
    });
  });
  await page.route('**/api/v1/work-items/YCE-TASK-2/attachments/*/uploaded', async (route) => {
    uploadedRequestCount += 1;
    const parts = new URL(route.request().url()).pathname.split('/');
    const attachmentId = Number(parts[parts.length - 2]);
    const index = workItemAttachments.findIndex((attachment) => attachment.id === attachmentId);
    if (!failNextUploadedMark) {
      workItemAttachments[index] = { ...workItemAttachments[index], status: 'uploaded' };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: workItemAttachments[index] }),
      });
      return;
    }
    failNextUploadedMark = false;
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'storage_verify_failed',
          message: '服务端确认上传失败。',
        },
      }),
    });
  });
  await page.route('**/api/v1/work-items/YCE-TASK-2/attachments', async (route) => {
    if (route.request().method() === 'POST') {
      const payload = route.request().postDataJSON();
      const attachmentId = nextAttachmentId;
      nextAttachmentId += 1;
      const created = attachmentFixture({
        id: attachmentId,
        filename: payload.original_filename,
        content_type: payload.content_type,
        byte_size: payload.byte_size,
        status: 'pending',
      });
      workItemAttachments.push(created);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: created }),
      });
      return;
    }
    attachmentListGetCount += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: workItemAttachments }),
    });
  });
  await page.route('**/api/v1/work-items/YCE-TASK-2/comments/*/attachments', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    });
  });
  await page.route('**/api/v1/work-items/YCE-TASK-2/comments', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: comments }),
    });
  });
  await page.route('**/api/v1/work-items/YCE-TASK-2', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: workItemDetailFixture() }),
    });
  });

  await login(page, '/web/app/work-items/YCE-TASK-2');

  const attachmentPanel = page.locator('.work-item-attachments-panel');
  await chooseFile(page, attachmentPanel.getByRole('button', { name: '选择工作项附件' }), {
    name: 'broken-upload.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('broken'),
  });

  await expect.poll(() => uploadedRequestCount).toBe(1);
  await expect.poll(() => attachmentListGetCount).toBeGreaterThan(1);
  await expect(page.getByRole('alert')).toHaveText('broken-upload.txt 已上传，但服务端确认失败，请手动刷新后检查。');
  await expect(attachmentPanel).toContainText('broken-upload.txt');
  await expect(attachmentPanel).toContainText('待上传');
  await expect(attachmentPanel).not.toContainText('上传失败');
  await expect(attachmentPanel).toContainText('broken-upload.txt 上传结果待确认。');
  await expect(attachmentPanel.getByRole('button', { name: '选择工作项附件' })).toBeEnabled();

  await chooseFile(page, attachmentPanel.getByRole('button', { name: '选择工作项附件' }), {
    name: 'broken-upload.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('broken'),
  });
  await expect.poll(() => uploadedRequestCount).toBe(2);
  await expect(page.getByRole('status')).toHaveText('YCE-TASK-2 附件已上传。');
  await expect(attachmentPanel).toContainText('已上传');
});

test('message center opens semantic target and unread filter becomes empty after read', async ({ page }) => {
  await login(page, '/web/messages?filter=unread');

  const openButton = page.getByRole('button', { name: '打开', exact: true }).first();
  await expect(openButton).toBeVisible();
  await Promise.all([
    page.waitForURL(/\/web\/work-items\/YCE-TASK-2/),
    openButton.click(),
  ]);
  await expect(page).toHaveURL(/\/web\/work-items\/YCE-TASK-2(#comment-\d+)?$/);
  const commentHash = new URL(page.url()).hash;
  if (commentHash) await expect(page.locator(commentHash)).toBeFocused();

  await page.goto('/web/messages?filter=unread');
  await expect(page.getByRole('heading', { level: 1, name: '消息中心' })).toBeVisible();
  await expect(page.getByText('没有未读消息。')).toBeVisible();
});

test('app-owner message center opens semantic target inside app shell', async ({ page }) => {
  await login(page, '/web/app/messages?filter=all');

  const openButton = page.getByRole('button', { name: '打开', exact: true }).first();
  await expect(openButton).toBeVisible();
  await Promise.all([
    page.waitForURL(/\/web\/app\/work-items\//),
    openButton.click(),
  ]);
  await expect(page).toHaveURL(/\/web\/app\/work-items\/[^#?]+(#comment-\d+)?$/);
  const appCommentHash = new URL(page.url()).hash;
  if (appCommentHash) await expect(page.locator(appCommentHash)).toBeFocused();
  await expect(page.locator('.work-item-detail-center').getByRole('heading', { level: 2 })).toBeVisible();
});

test('shared system dashboard renders the permission-filtered management entry set', async ({ page }) => {
  await login(page, '/web/app/system');

  const dashboard = page.getByRole('region', { name: '管理入口' });
  for (const label of ['用户管理', '角色权限', '对象存储', '系统 OpenAPI', '版本管理', '数据库统计', '审计日志']) {
    await expect(dashboard.getByRole('link', { name: new RegExp(label) })).toBeVisible();
  }
  await expect(dashboard.locator('a')).toHaveCount(7);
});

test('system dashboard preserves the main responsive geometry', async ({ page }) => {
  await login(page, '/web/app/system');
  for (const viewport of [
    { width: 390, height: 844, columns: 1 },
    { width: 768, height: 1024, columns: 2 },
    { width: 1280, height: 800, columns: 4 },
    { width: 1440, height: 900, columns: 4 },
  ]) {
    await page.setViewportSize(viewport);
    const geometry = await page.locator('.system-dashboard-page').evaluate((element) => {
      const main = element.closest('.main');
      return {
        mainWidth: main.clientWidth,
        mainScrollWidth: main.scrollWidth,
        columns: getComputedStyle(element.querySelector('.system-grid')).gridTemplateColumns.trim().split(/\s+/u).length,
      };
    });
    expect(geometry.mainScrollWidth).toBeLessThanOrEqual(geometry.mainWidth);
    expect(geometry.columns).toBe(viewport.columns);
  }
});

test('shared system permissions preserve formal owner search and fixed catalog', async ({ page }) => {
  const requests = [];
  await page.route('**/api/v1/system/permissions', async (route) => {
    requests.push(route.request().method());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [
      { permission_key: 'system.roles.view', permission_name: '查看角色权限', resource_type: 'page', resource_key: 'system.roles', granted: false },
      { permission_key: 'system.users.manage', permission_name: '管理系统用户', resource_type: 'action', resource_key: 'system.users', granted: false },
    ] }) });
  });

  await login(page, '/web/system/permissions?q=roles');
  await expect(page).toHaveTitle('权限目录 - 元策');
  await expect(page).toHaveURL('/web/system/permissions?q=roles');
  const tree = page.getByLabel('系统权限目录');
  await expect(tree).toContainText('system.roles.view');
  await expect(tree).not.toContainText('system.users.manage');
  await expect.poll(() => requests.length).toBeGreaterThan(0);
  expect(requests.every((method) => method === 'GET')).toBe(true);
  const initialRequestCount = requests.length;

  await page.getByRole('button', { name: '清除' }).click();
  await expect(page).toHaveURL('/web/system/permissions');
  await expect(tree).toContainText('system.users.manage');
  await expect.poll(() => requests.length).toBeGreaterThan(initialRequestCount);
  expect(requests.every((method) => method === 'GET')).toBe(true);
});

test('system permissions preserves the main responsive geometry', async ({ page }) => {
  await login(page, '/web/system/permissions');
  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    const geometry = await page.locator('.system-permissions-page').evaluate((element) => {
      const main = element.closest('.main');
      const tree = element.querySelector('.permission-tree');
      return { mainWidth: main.clientWidth, mainScrollWidth: main.scrollWidth, treeRight: tree.getBoundingClientRect().right, mainRight: main.getBoundingClientRect().right };
    });
    expect(geometry.mainScrollWidth).toBeLessThanOrEqual(geometry.mainWidth);
    expect(geometry.treeRight).toBeLessThanOrEqual(geometry.mainRight + 1);
  }
});

test('shared database stats load cache first and preserve it across refresh failures', async ({ page }) => {
  const cache = { refreshed_at: '2026-08-07T10:00:00Z', tables: [{ table_name: 'cached_users', remark: '缓存用户表', row_count: 2, column_count: 1, columns: [{ name: 'id', data_type: 'INTEGER', required: true, primary_key: true, default_value: null }] }] };
  const fresh = { refreshed_at: '2026-08-08T10:00:00Z', tables: [{ table_name: 'users', remark: '用户账号', row_count: 5, column_count: 2, columns: [] }] };
  await page.addInitScript((snapshot) => localStorage.setItem('yuance:database-stats:v1:yuance_admin', JSON.stringify(snapshot)), cache);
  let requestCount = 0;
  let fail = false;
  await page.route('**/api/v1/system/database-stats', async (route) => {
    requestCount += 1;
    await new Promise((resolve) => setTimeout(resolve, 80));
    await route.fulfill(fail
      ? { status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'database_stats_failed', message: '统计暂时不可用' } }) }
      : { status: 200, contentType: 'application/json', body: JSON.stringify({ data: fresh }) });
  });

  await login(page, '/web/system/database-stats');
  await expect(page).toHaveTitle('数据库统计 - 元策');
  await expect(page.getByRole('table', { name: '数据库统计大表' })).toContainText('cached_users');
  expect(requestCount).toBe(0);

  const refresh = page.getByRole('button', { name: '刷新', exact: true });
  await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((element) => element.textContent?.trim() === '刷新');
    button?.click(); button?.click();
  });
  await expect(page.getByRole('table', { name: '数据库统计大表' })).toContainText('用户账号');
  expect(requestCount).toBe(1);

  fail = true;
  await refresh.click();
  await expect(page.getByRole('alert')).toContainText('统计暂时不可用');
  await expect(page.getByRole('table', { name: '数据库统计大表' })).toContainText('用户账号');
  expect(requestCount).toBe(2);
});

test('shared system audit preserves filters pagination and read-only evidence', async ({ page }) => {
  const requests = [];
  await page.route('**/api/v1/system/audit*', async (route) => {
    const url = new URL(route.request().url());
    requests.push({ method: route.request().method(), search: url.search });
    const pageNumber = Number(url.searchParams.get('page') || 1);
    const perPage = Number(url.searchParams.get('per_page') || 10);
    const empty = url.searchParams.get('actor') === 'Nobody';
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: {
      items: empty ? [] : [{
        id: pageNumber, actor_display_name: 'Alice Chen', actor_username: 'alice', action: 'auth.login',
        target_type: 'user', target_id: '7', metadata: '{"result":"success"}', ip: '127.0.0.1',
        user_agent: 'Playwright Audit Fixture', created_at: '2026-08-08T08:00:00Z',
      }],
      pagination: { page: pageNumber, per_page: perPage, total_items: empty ? 0 : 21, total_pages: empty ? 1 : 2 },
    } }) });
  });

  await login(page, '/web/system/audit?actor=Alice&action=auth.login&target_type=user&target_id=7&per_page=20');
  await expect(page).toHaveTitle('审计日志 - 元策');
  const table = page.getByRole('table', { name: '审计日志列表' });
  await expect(table).toContainText('Alice Chen @alice');
  await expect(table).toContainText('用户登录');
  await expect(table).toContainText('auth.login');
  await expect(table).toContainText('user / 7');
  await expect(table).toContainText('127.0.0.1');
  await expect(table).toContainText('Playwright Audit Fixture');
  await expect(table).toContainText('{"result":"success"}');

  await page.getByRole('button', { name: '下一页' }).click();
  await expect(page).toHaveURL('/web/system/audit?actor=Alice&action=auth.login&target_type=user&target_id=7&page=2&per_page=20');

  await page.locator('input[name="actor"]').fill('Nobody');
  await page.getByRole('button', { name: '筛选', exact: true }).click();
  await expect(page).toHaveURL('/web/system/audit?actor=Nobody&action=auth.login&target_type=user&target_id=7&per_page=20');
  await expect(table).toContainText('暂无审计记录。');

  await page.getByRole('button', { name: '重置' }).click();
  await expect(page).toHaveURL('/web/system/audit');
  await expect.poll(() => requests.length).toBeGreaterThanOrEqual(4);
  expect(requests.every(({ method }) => method === 'GET')).toBe(true);
  expect(requests.some(({ search }) => search === '?actor=Alice&action=auth.login&target_type=user&target_id=7&page=2&per_page=20')).toBe(true);
});

test('database stats and audit preserve the main responsive geometry', async ({ page }) => {
  await login(page, '/web/system/database-stats');
  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    for (const entry of [
      { path: '/web/system/database-stats', selector: '.database-stats-panel' },
      { path: '/web/system/audit', selector: '.audit-panel' },
    ]) {
      await page.goto(entry.path);
      const geometry = await page.locator(entry.selector).evaluate((element) => {
        const main = element.closest('.main');
        return { mainWidth: main.clientWidth, mainScrollWidth: main.scrollWidth, panelRight: element.getBoundingClientRect().right, mainRight: main.getBoundingClientRect().right };
      });
      expect(geometry.mainScrollWidth).toBeLessThanOrEqual(geometry.mainWidth);
      expect(geometry.panelRight).toBeLessThanOrEqual(geometry.mainRight + 1);
    }
  }
});

test('shared system API docs render bounded endpoint navigation without remote Scalar', async ({ page }) => {
  const methods = [];
  const document = {
    openapi: '3.1.0',
    info: { title: '元策系统 API', version: '1.1.0', description: '面向版本发布自动化的系统契约。' },
    paths: {
      '/api/v1/system/releases': {
        get: { tags: ['releases'], summary: '分页获取版本列表', parameters: [{ $ref: '#/components/parameters/Page' }], responses: { 200: { description: '版本列表' } } },
        post: { tags: ['releases'], summary: '创建版本草稿', requestBody: { required: true }, responses: { 201: { description: '创建成功' } } },
      },
    },
    components: { parameters: { Page: { name: 'page', in: 'query', schema: { type: 'integer' } } } },
  };
  await page.route('**/api/v1/system/api-docs-view', async (route) => {
    methods.push(route.request().method());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { source: JSON.stringify(document) } }) });
  });

  await login(page, '/web/app/system/api-docs');
  await expect(page).toHaveTitle('系统 API 文档 - 元策');
  await expect(page.getByRole('heading', { level: 2, name: '元策系统 API' })).toBeVisible();
  const navigation = page.getByRole('navigation', { name: 'API 端点导航' });
  await expect(navigation.getByRole('link')).toHaveCount(2);
  await expect(navigation).toContainText('GET');
  await expect(navigation).toContainText('POST');
  await expect(navigation).toContainText('/api/v1/system/releases');
  await expect(navigation).toContainText('创建版本草稿');

  const operations = page.getByLabel('API 操作契约');
  await expect(operations).toContainText('分页获取版本列表');
  await operations.locator('details').first().getByText('查看完整操作契约').click();
  await expect(operations.locator('pre').first()).toContainText('#/components/parameters/Page');
  await page.getByText('查看 Components').click();
  await expect(page.locator('details', { hasText: '查看 Components' }).locator('pre')).toContainText('"Page"');
  await page.getByText('查看完整 OpenAPI JSON').click();
  await expect(page.locator('details', { hasText: '查看完整 OpenAPI JSON' }).locator('pre')).toContainText('"openapi": "3.1.0"');
  await expect(page.getByRole('link', { name: '系统 Token 管理' })).toHaveAttribute('href', '/web/app/system/openapi');
  expect(methods.length).toBeGreaterThan(0);
  expect(methods.every((method) => method === 'GET')).toBe(true);
  expect(await page.locator('script[src*="scalar"], iframe').count()).toBe(0);

  const formalResponse = await page.request.get('/web/system/api-docs');
  expect(formalResponse.status()).toBe(200);
  const formalHtml = await formalResponse.text();
  expect(formalHtml).toContain('Scalar.createApiReference');
  expect(formalHtml).toContain('/api/system/openapi.json');
  expect(formalHtml).not.toContain('<div id="root"></div>');
});

test('shared system users view renders atomic rows and preserves pagination in the app owner', async ({ page }) => {
  const requests = [];
  await page.route('**/api/v1/system/users-view*', async (route) => {
    const url = new URL(route.request().url());
    requests.push(url.search);
    const currentPage = Number(url.searchParams.get('page') || 1);
    const perPage = Number(url.searchParams.get('per_page') || 10);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: {
      items: [{
        id: currentPage, username: `shared_user_${currentPage}`, display_name: `共享用户 ${currentPage}`,
        email: 'shared@example.test', mobile: '', status: 'active', is_super_admin: false,
        role_code: 'member', role_names: '项目成员', created_at: '2026-08-08T00:00:00Z', updated_at: '2026-08-08T00:00:00Z',
        assigned_projects: [{ key: 'YCE', name: '元策', status: 'in_progress', role_code: 'member', active_assigned_count: 0, can_remove: true, can_update_role: true, remove_block_reason: '' }],
      }],
      roles: [], project_options: [], can_manage_users: true, can_manage_user_projects: true,
      pagination: { page: currentPage, per_page: perPage, total_items: 21, total_pages: Math.ceil(21 / perPage) },
    } }) });
  });

  await login(page, '/web/app/system/users');
  await expect(page).toHaveTitle('用户管理 - 元策');
  await expect(page.getByRole('heading', { level: 1, name: '用户管理' })).toBeVisible();
  const table = page.getByRole('table', { name: '系统用户列表' });
  await expect(table).toContainText('共享用户 1');
  await expect(table).toContainText('1 个项目');

  await page.getByRole('button', { name: '下一页' }).click();
  await expect(page).toHaveURL(/\/web\/app\/system\/users\?page=2$/);
  await expect(table).toContainText('共享用户 2');
  await page.getByLabel('每页').selectOption('20');
  await expect(page).toHaveURL(/\/web\/app\/system\/users\?per_page=20$/);
  await expect.poll(() => requests).toContain('?per_page=20');
});

test('system users preserves the main responsive geometry', async ({ page }) => {
  await login(page, '/web/app/system/users');
  for (const viewport of [
    { width: 390, height: 844, compact: true },
    { width: 768, height: 1024, compact: false },
    { width: 1280, height: 800, compact: false },
    { width: 1440, height: 900, compact: false },
  ]) {
    await page.setViewportSize(viewport);
    const geometry = await page.locator('.system-users-page').evaluate((element) => {
      const main = element.closest('.main');
      const hero = element.querySelector('.page-hero');
      const tableWrap = element.querySelector('.yc-table-wrap');
      return {
        mainWidth: main.clientWidth,
        mainScrollWidth: main.scrollWidth,
        heroDirection: getComputedStyle(hero).flexDirection,
        tableContained: tableWrap.getBoundingClientRect().right <= main.getBoundingClientRect().right + 1,
      };
    });
    expect(geometry.mainScrollWidth).toBeLessThanOrEqual(geometry.mainWidth);
    expect(geometry.heroDirection).toBe(viewport.compact ? 'column' : 'row');
    expect(geometry.tableContained).toBe(true);
  }
});

test('shared system roles view renders atomic selection and permissions in the app owner', async ({ page }) => {
  const requests = [];
  await page.route('**/api/v1/system/roles-view*', async (route) => {
    const url = new URL(route.request().url());
    requests.push(url.search);
    const roleCode = url.searchParams.get('role') || 'system_admin';
    const currentPage = Number(url.searchParams.get('page') || 1);
    const perPage = Number(url.searchParams.get('per_page') || 10);
    const selected = {
      role_code: roleCode, role_name: roleCode === 'qa_lead' ? '质量负责人' : '系统管理员', status: 'active',
      is_system: roleCode === 'system_admin', data_scope_type: 'all', permission_count: 1,
    };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: {
      items: [selected], selected_role: selected,
      permissions: [
        { permission_key: 'system.dashboard.view', permission_name: '查看系统管理', resource_type: 'system', resource_key: 'dashboard', granted: true },
        { permission_key: 'system.users.manage', permission_name: '管理用户', resource_type: 'system', resource_key: 'users', granted: false },
      ],
      pagination: { page: currentPage, per_page: perPage, total_items: 21, total_pages: Math.ceil(21 / perPage) },
      can_manage_roles: true, can_edit_permissions: !selected.is_system,
    } }) });
  });

  await login(page, '/web/app/system/roles?role=qa_lead&page=2&per_page=20');
  await expect(page).toHaveTitle('角色权限 - 元策');
  await expect(page.getByRole('heading', { level: 1, name: '角色权限' })).toBeVisible();
  await expect(page.getByLabel('角色列表')).toContainText('质量负责人');
  const permissions = page.getByRole('region', { name: '权限树' });
  await expect(permissions).toContainText('查看系统管理');
  await expect(permissions.getByRole('checkbox', { name: '查看系统管理 已授权' })).toBeChecked();
  await expect(permissions.getByRole('checkbox', { name: '管理用户 未授权' })).not.toBeChecked();
  await expect.poll(() => requests).toContain('?role=qa_lead&page=2&per_page=20');

  await page.goto('/web/system/roles/system_viewer/permissions?per_page=20');
  await expect(page).toHaveURL(/\/web\/system\/roles\/system_viewer\/permissions\?per_page=20$/);
  await expect(page.getByRole('region', { name: '权限树' })).toBeVisible();
  await expect.poll(() => requests).toContain('?role=system_viewer&per_page=20');
});

test('system roles preserves the main responsive geometry', async ({ page }) => {
  await login(page, '/web/app/system/roles');
  for (const viewport of [
    { width: 390, height: 844, columns: 1 },
    { width: 768, height: 1024, columns: 1 },
    { width: 1280, height: 800, columns: 2 },
    { width: 1440, height: 900, columns: 2 },
  ]) {
    await page.setViewportSize(viewport);
    const geometry = await page.locator('.system-roles-page').evaluate((element) => {
      const main = element.closest('.main');
      const workbench = element.querySelector('.role-workbench');
      return { mainWidth: main.clientWidth, mainScrollWidth: main.scrollWidth, columns: getComputedStyle(workbench).gridTemplateColumns.trim().split(/\s+/u).length };
    });
    expect(geometry.mainScrollWidth).toBeLessThanOrEqual(geometry.mainWidth);
    expect(geometry.columns).toBe(viewport.columns);
  }
});

test('shared system storage view renders one masked paginated snapshot in the app owner', async ({ page }) => {
  const requests = [];
  await page.route('**/api/v1/system/storage-view*', async (route) => {
    const url = new URL(route.request().url());
    requests.push(url.pathname + url.search);
    const currentPage = Number(url.searchParams.get('page') || 1);
    const perPage = Number(url.searchParams.get('per_page') || 10);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: {
      config: {
        id: 12, provider: 'aliyun_oss', endpoint: 'https://oss-cn-hangzhou.aliyuncs.com', region: 'cn-hangzhou',
        bucket: 'yuance-shared-files', access_key_id_hint: 'AKIA****E2E1', status: 'active', version: 12,
        created_by: '系统管理员', created_at: '2026-08-08T00:00:00Z', updated_at: '2026-08-08T01:00:00Z',
      },
      versions: [{
        id: currentPage, provider: 'aliyun_oss', endpoint: 'https://oss-cn-hangzhou.aliyuncs.com', region: 'cn-hangzhou',
        bucket: `yuance-version-${currentPage}`, access_key_id_hint: 'AKIA****HIST', current_status: 'inactive', version: currentPage,
        created_by: '系统管理员', created_at: '2026-08-08T00:00:00Z',
      }],
      pagination: { page: currentPage, per_page: perPage, total_items: 41, total_pages: Math.ceil(41 / perPage) },
      inspection: {
        ok: false, needs_initialization: true, message: 'Bucket 尚未初始化。',
        checks: [{ code: 'bucket_layout', status: 'missing', message: '缺少元策目录结构。' }],
      },
      inspection_error: '', can_manage_storage: true,
    } }) });
  });

  await login(page, '/web/app/system/storage?page=2&per_page=20');
  await expect(page).toHaveTitle('对象存储 - 元策');
  await expect(page.getByRole('heading', { level: 1, name: '阿里云 OSS' })).toBeVisible();
  const workspace = page.getByRole('region', { name: '存储工作台' });
  await expect(workspace).toContainText('yuance-shared-files');
  await expect(workspace).toContainText('AKIA****E2E1');
  await expect(workspace).toContainText('需要初始化');
  await expect(page.getByLabel('存储检查项目')).toContainText('缺少元策目录结构。');
  await expect(page.getByLabel('存储配置版本')).toContainText('yuance-version-2');
  await expect(page.locator('body')).not.toContainText('AKIAORIGINALSECRET');
  await expect(page.locator('body')).not.toContainText('StorageSecret2026!');
  await expect.poll(() => requests).toContain('/api/v1/system/storage-view?page=2&per_page=20');

  await page.getByRole('button', { name: '下一页' }).click();
  await expect(page).toHaveURL('/web/app/system/storage?page=3&per_page=20');
  await expect(page.getByLabel('存储配置版本')).toContainText('yuance-version-3');
  await expect.poll(() => requests).toContain('/api/v1/system/storage-view?page=3&per_page=20');
});

test('formal web system storage owner keeps its route while rendering the shared workspace', async ({ page }) => {
  const requests = [];
  await page.route('**/api/v1/system/storage-view*', async (route) => {
    const url = new URL(route.request().url());
    requests.push(url.pathname + url.search);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: {
      config: {
        id: 12, provider: 'aliyun_oss', endpoint: 'https://oss-cn-hangzhou.aliyuncs.com', region: 'cn-hangzhou',
        bucket: 'yuance-formal-files', access_key_id_hint: 'AKIA****E2E1', status: 'active', version: 12,
        created_by: '系统管理员', created_at: '2026-08-08T00:00:00Z', updated_at: '2026-08-08T01:00:00Z',
      },
      versions: [],
      pagination: { page: 2, per_page: 20, total_items: 21, total_pages: 2 },
      inspection: { ok: true, needs_initialization: false, message: '对象存储桶运行就绪', checks: [] },
      inspection_error: '', can_manage_storage: true,
    } }) });
  });

  await login(page, '/web/system/storage?page=2&per_page=20');

  await expect(page).toHaveURL(/\/web\/system\/storage\?page=2&per_page=20$/);
  await expect(page).toHaveTitle('对象存储 - 元策');
  await expect(page.getByRole('heading', { level: 1, name: '阿里云 OSS' })).toBeVisible();
  await expect(page.getByRole('region', { name: '存储工作台' })).toContainText('yuance-formal-files');
  await expect.poll(() => requests).toContain('/api/v1/system/storage-view?page=2&per_page=20');
  expect(page.url()).not.toContain('/web/app/system/storage');
});

test('system storage preserves the main responsive geometry', async ({ page }) => {
  await page.route('**/api/v1/system/storage-view*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: {
    config: { id: 12, provider: 'aliyun_oss', endpoint: 'https://oss-cn-hangzhou.aliyuncs.com', region: 'cn-hangzhou', bucket: 'yuance-files', access_key_id_hint: 'AKIA****E2E1', status: 'active', version: 12, updated_at: '2026-08-08T01:00:00Z' },
    versions: [{ id: 11, provider: 'aliyun_oss', endpoint: 'https://oss-cn-hangzhou.aliyuncs.com', region: 'cn-hangzhou', bucket: 'yuance-files-old', access_key_id_hint: 'AKIA****HIST', current_status: 'inactive', version: 11, created_by: '系统管理员', created_at: '2026-08-08T00:00:00Z' }],
    pagination: { page: 1, per_page: 10, total_items: 1, total_pages: 1 }, inspection: { ok: false, needs_initialization: true, message: 'Bucket 尚未初始化。', checks: [{ code: 'bucket_layout', status: 'missing', message: '缺少元策目录结构。' }] }, inspection_error: '', can_manage_storage: true,
  } }) }));
  await login(page, '/web/system/storage');

  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    const geometry = await page.locator('.storage-page').evaluate((element) => {
      const main = element.closest('.main');
      const layout = element.querySelector('.storage-layout');
      return { mainWidth: main.clientWidth, mainScrollWidth: main.scrollWidth, columns: getComputedStyle(layout).gridTemplateColumns, pageRight: element.getBoundingClientRect().right, mainRight: main.getBoundingClientRect().right };
    });
    expect(geometry.mainScrollWidth).toBeLessThanOrEqual(geometry.mainWidth);
    expect(geometry.pageRight).toBeLessThanOrEqual(geometry.mainRight + 1);
    expect(geometry.columns.trim().split(/\s+/u).length).toBe(viewport.width > 1280 ? 2 : 1);
  }
});

test('shared system OpenAPI tokens preserve one-time plaintext and confirmed lifecycle', async ({ page }) => {
  const mutations = [];
  const viewRequests = [];
  let nextId = 8;
  let tokens = [{
    id: 7, name: 'Release robot', scopes: ['system_release:read', 'system_release:write'], token_suffix: '12345678',
    created_by: '系统管理员', updated_by: '系统管理员', last_used_at: '', created_at: '2026-08-08T00:00:00Z', updated_at: '2026-08-08T00:00:00Z',
  }];
  const view = () => ({ items: tokens, active_count: tokens.length, token_limit: 100, can_manage_tokens: true });
  await page.route('**/api/v1/system/openapi-view*', (route) => {
    viewRequests.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: view() }) });
  });
  await page.route('**/api/v1/system/api-tokens', async (route) => {
    const body = route.request().postDataJSON();
    mutations.push(['create', body]);
    const token = { id: nextId++, name: body.name, scopes: body.scopes, token_suffix: '87654321', created_by: '系统管理员', updated_by: '系统管理员', last_used_at: '', created_at: '2026-08-08T01:00:00Z', updated_at: '2026-08-08T01:00:00Z' };
    tokens = [token, ...tokens];
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: { token, raw_token: 'yuance_sys_pat_once_only' } }) });
  });
  await page.route(/\/api\/v1\/system\/api-tokens\/(\d+)$/u, async (route) => {
    const id = Number(new URL(route.request().url()).pathname.split('/').pop());
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON();
      mutations.push(['update', id, body]);
      tokens = tokens.map((token) => token.id === id ? { ...token, name: body.name, scopes: body.scopes, updated_at: '2026-08-08T02:00:00Z' } : token);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: tokens.find((token) => token.id === id) }) });
    }
    mutations.push(['delete', id]);
    const [deleted] = tokens.filter((token) => token.id === id);
    tokens = tokens.filter((token) => token.id !== id);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: deleted }) });
  });

  await login(page, '/web/system/openapi');
  await expect(page).toHaveURL('/web/system/openapi');
  await expect(page).toHaveTitle('系统 OpenAPI - 元策');
  await expect.poll(() => viewRequests.length).toBeGreaterThan(0);
  await expect(page.getByRole('table', { name: '系统 OpenAPI Token 列表' })).toContainText('Release robot');
  await expect(page.locator('body')).not.toContainText('yuance_sys_pat_');

  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    const geometry = await page.locator('.system-openapi-page').evaluate((element) => {
      const main = element.closest('.main');
      const layout = element.querySelector('.system-openapi-layout');
      return { mainWidth: main.clientWidth, mainScrollWidth: main.scrollWidth, columns: getComputedStyle(layout).gridTemplateColumns, pageRight: element.getBoundingClientRect().right, mainRight: main.getBoundingClientRect().right };
    });
    expect(geometry.mainScrollWidth).toBeLessThanOrEqual(geometry.mainWidth);
    expect(geometry.pageRight).toBeLessThanOrEqual(geometry.mainRight + 1);
    expect(geometry.columns.trim().split(/\s+/u).length).toBe(viewport.width > 1280 ? 2 : 1);
  }

  await page.getByRole('button', { name: '创建 Token' }).click();
  const creator = page.getByRole('dialog', { name: '创建系统 Token' });
  await creator.getByLabel('名称').fill('Desktop release');
  await creator.getByLabel('版本写入 / 发布 / 资产上传').check();
  await creator.getByRole('button', { name: '创建', exact: true }).click();
  await expect(page.getByLabel('Token 明文')).toHaveValue('yuance_sys_pat_once_only');
  await expect(page.getByRole('table', { name: '系统 OpenAPI Token 列表' })).toContainText('Desktop release');

  const row = page.getByRole('row', { name: /Desktop release/ });
  await row.getByRole('button', { name: '编辑' }).click();
  const editor = page.getByRole('dialog', { name: '编辑系统 Token' });
  await editor.getByLabel('名称').fill('Desktop release reader');
  await editor.getByLabel('版本写入 / 发布 / 资产上传').uncheck();
  await editor.getByRole('button', { name: '保存' }).click();
  await expect(page.getByLabel('Token 明文')).toHaveCount(0);
  await expect(page.getByRole('table', { name: '系统 OpenAPI Token 列表' })).toContainText('Desktop release reader');

  await page.getByRole('row', { name: /Desktop release reader/ }).getByRole('button', { name: '删除' }).click();
  const deletion = page.getByRole('dialog', { name: '删除系统 Token' });
  await expect(deletion).toContainText('自动化会立即失去访问权限');
  await deletion.getByRole('button', { name: '确认删除' }).click();
  await expect(page.getByRole('table', { name: '系统 OpenAPI Token 列表' })).not.toContainText('Desktop release reader');
  expect(mutations).toEqual([
    ['create', { name: 'Desktop release', scopes: ['system_release:read', 'system_release:write'] }],
    ['update', 8, { name: 'Desktop release reader', scopes: ['system_release:read'] }],
    ['delete', 8],
  ]);
});

test('shared system releases view renders one atomic policy version and asset snapshot', async ({ page }) => {
  const requests = [];
  await page.route('**/api/v1/system/releases-view*', async (route) => {
    const url = new URL(route.request().url());
    requests.push(url.pathname + url.search);
    const currentPage = Number(url.searchParams.get('page') || 1);
    const perPage = Number(url.searchParams.get('per_page') || 10);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: {
      settings: { retention_count: 5, updated_by: '发布管理员', updated_at: '2026-08-08T01:00:00Z' },
      items: [{
        release: {
          id: currentPage, version_name: `v2.0.${currentPage}`, title: '共享桌面版本', notes: '统一 Browser 与 Desktop 发布视图。',
          status: 'draft', channel: 'internal', verification_status: 'pending', manifest_sha256: '', signing_key_id: '',
          source_commit: '', source_tag: '', published_at: '', verified_at: '', withdrawn_at: '', withdrawal_reason: '',
          github_withdrawal_status: '', created_by: '发布管理员', updated_by: '发布管理员',
          created_at: '2026-08-08T00:00:00Z', updated_at: '2026-08-08T01:00:00Z', asset_count: 1, platform_count: 1,
        },
        assets: [{ id: currentPage, release_id: currentPage, platform: 'macos', architecture: 'arm64', artifact_kind: 'installer', filename: `yuance-${currentPage}.dmg`, content_type: 'application/x-apple-diskimage', byte_size: 4096, status: 'uploaded', checksum_sha256: 'abc123', created_at: '2026-08-08T00:30:00Z' }],
      }],
      pagination: { page: currentPage, per_page: perPage, total_items: 41, total_pages: Math.ceil(41 / perPage) },
      can_manage_releases: true,
    } }) });
  });

  await login(page, '/web/system/releases?page=2&per_page=20');
  await expect(page).toHaveTitle('版本管理 - 元策');
  await expect(page.getByRole('heading', { level: 1, name: '版本管理' })).toBeVisible();
  await expect(page.getByRole('region', { name: '发布工作台' })).toContainText('发布管理员');
  await expect(page.getByRole('table', { name: '系统版本列表' })).toContainText('v2.0.2');
  await expect(page.getByRole('table', { name: '系统版本资产' })).toContainText('yuance-2.dmg');
  await expect(page.locator('body')).not.toContainText('release/private/object-key');
  await expect.poll(() => requests).toContain('/api/v1/system/releases-view?page=2&per_page=20');

  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    const geometry = await page.locator('.system-release-page').evaluate((element) => {
      const main = element.closest('.main');
      const layout = element.querySelector('.system-release-policy-layout');
      return { mainWidth: main.clientWidth, mainScrollWidth: main.scrollWidth, columns: getComputedStyle(layout).gridTemplateColumns, pageRight: element.getBoundingClientRect().right, mainRight: main.getBoundingClientRect().right };
    });
    expect(geometry.mainScrollWidth).toBeLessThanOrEqual(geometry.mainWidth);
    expect(geometry.pageRight).toBeLessThanOrEqual(geometry.mainRight + 1);
    expect(geometry.columns.trim().split(/\s+/u).length).toBe(viewport.width > 1280 ? 2 : 1);
  }

  await page.getByRole('button', { name: '下一页' }).click();
  await expect(page).toHaveURL('/web/system/releases?page=3&per_page=20');
  await expect(page.getByRole('table', { name: '系统版本列表' })).toContainText('v2.0.3');
});

test('shared system release management preserves state transitions, locks, and final refresh semantics', async ({ page }) => {
  const mutations = [];
  let retentionCount = 5;
  let viewRequests = 0;
  let failNextView = false;
  let releaseSettingsMutation;
  const releaseSettingsGate = new Promise((resolve) => { releaseSettingsMutation = resolve; });
  let holdSettingsMutation = true;
  const releases = [
    { id: 7, version_name: 'v2.1.0', title: '待校验版本', notes: '内部桌面发布', status: 'draft', channel: 'internal', verification_status: 'pending', manifest_sha256: 'a'.repeat(64), signing_key_id: 'release-key-1', source_commit: 'b'.repeat(40), source_tag: 'desktop-v2.1.0', published_at: '', verified_at: '', withdrawn_at: '', withdrawal_reason: '', github_withdrawal_status: '', created_by: '发布管理员', updated_by: '发布管理员', created_at: '2026-08-08T00:00:00Z', updated_at: '2026-08-08T01:00:00Z', asset_count: 6, platform_count: 3 },
    { id: 8, version_name: 'v2.0.0', title: '线上版本', notes: '稳定版本', status: 'published', channel: 'legacy', verification_status: 'not_required', manifest_sha256: '', signing_key_id: '', source_commit: '', source_tag: '', published_at: '2026-08-07T01:00:00Z', verified_at: '', withdrawn_at: '', withdrawal_reason: '', github_withdrawal_status: '', created_by: '发布管理员', updated_by: '发布管理员', created_at: '2026-08-07T00:00:00Z', updated_at: '2026-08-07T01:00:00Z', asset_count: 1, platform_count: 1 },
  ];
  const view = () => ({
    settings: { retention_count: retentionCount, updated_by: '发布管理员', updated_at: '2026-08-08T01:00:00Z' },
    items: releases.map((release) => ({ release, assets: [] })),
    pagination: { page: 1, per_page: 10, total_items: releases.length, total_pages: 1 },
    can_manage_releases: true,
  });

  await page.route('**/api/v1/system/releases-view*', async (route) => {
    viewRequests += 1;
    if (failNextView) {
      failNextView = false;
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'temporarily_unavailable', message: '发布视图暂不可用' } }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: view() }) });
  });
  await page.route('**/api/v1/system/releases/settings', async (route) => {
    const body = route.request().postDataJSON();
    mutations.push(['settings', body]);
    if (holdSettingsMutation) await releaseSettingsGate;
    retentionCount = body.retention_count;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: view().settings }) });
  });
  await page.route('**/api/v1/system/releases', async (route) => {
    const body = route.request().postDataJSON();
    mutations.push(['create', body]);
    releases.unshift({ id: 9, version_name: body.version_name, title: body.title, notes: body.notes, status: 'draft', channel: body.channel, verification_status: body.channel === 'internal' ? 'pending' : 'not_required', manifest_sha256: body.manifest_sha256, signing_key_id: body.signing_key_id, source_commit: body.source_commit, source_tag: body.source_tag, published_at: '', verified_at: '', withdrawn_at: '', withdrawal_reason: '', github_withdrawal_status: '', created_by: '发布管理员', updated_by: '发布管理员', created_at: '2026-08-08T02:00:00Z', updated_at: '2026-08-08T02:00:00Z', asset_count: 0, platform_count: 0 });
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: {} }) });
  });
  await page.route(/\/api\/v1\/system\/releases\/\d+(?:\/verify|\/withdraw)?$/u, async (route) => {
    const url = new URL(route.request().url());
    const [, releaseIdText, action] = url.pathname.match(/\/releases\/(\d+)(?:\/(verify|withdraw))?$/u);
    const release = releases.find((item) => item.id === Number(releaseIdText));
    const body = route.request().postData() ? route.request().postDataJSON() : undefined;
    mutations.push([action || 'update', Number(releaseIdText), body]);
    if (action === 'verify') release.verification_status = 'verified';
    else if (action === 'withdraw') { release.status = 'withdrawn'; release.withdrawal_reason = body.reason; release.github_withdrawal_status = body.github_withdrawal_status; }
    else { release.version_name = body.version_name; release.title = body.title; release.notes = body.notes; if (body.publish) release.status = 'published'; }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: {} }) });
  });

  await login(page, '/web/app/system/releases');
  const settingsInput = page.getByLabel('已发布版本保留数');
  await settingsInput.fill('8');
  const saveSettings = page.locator('form').filter({ has: settingsInput }).getByRole('button');
  await saveSettings.evaluate((button) => { button.click(); button.click(); });
  await expect(saveSettings).toBeDisabled();
  expect(mutations.filter(([kind]) => kind === 'settings')).toHaveLength(1);
  holdSettingsMutation = false;
  releaseSettingsMutation();
  await expect(page.getByRole('status')).toHaveText('发布保留策略已更新。');
  await expect(settingsInput).toHaveValue('8');

  await page.getByRole('button', { name: '新建版本' }).click();
  const createDialog = page.getByRole('dialog', { name: '新建版本草稿' });
  await createDialog.getByLabel('版本号').fill('v2.2.0');
  await createDialog.getByLabel('版本标题').fill('下一版本');
  await createDialog.getByLabel('版本说明').fill('跨宿主一致发布');
  await createDialog.locator('#system-release-channel-native').selectOption('internal');
  await createDialog.getByLabel('Manifest SHA-256').fill('c'.repeat(64));
  await createDialog.getByLabel('签名 Key ID').fill('release-key-2');
  await createDialog.getByLabel('Source Commit').fill('d'.repeat(40));
  await createDialog.getByLabel('Source Tag').fill('desktop-v2.2.0');
  await createDialog.getByRole('button', { name: '保存草稿' }).click();
  await expect(page.getByRole('table', { name: '系统版本列表' })).toContainText('v2.2.0');

  const createdRow = page.getByRole('row').filter({ hasText: 'v2.2.0' });
  await createdRow.getByRole('button', { name: '编辑' }).click();
  const editDialog = page.getByRole('dialog', { name: '编辑版本草稿' });
  await editDialog.getByLabel('版本标题').fill('下一版本修订');
  await editDialog.getByRole('button', { name: '保存草稿' }).click();
  await expect(page.getByRole('table', { name: '系统版本列表' })).toContainText('下一版本修订');

  const verifyRow = page.getByRole('row').filter({ hasText: 'v2.1.0' });
  await expect(verifyRow.getByRole('button', { name: '发布' })).toHaveCount(0);
  await verifyRow.getByRole('button', { name: '校验' }).click();
  await page.getByRole('dialog', { name: '校验内部版本' }).getByRole('button', { name: '确认' }).click();
  await expect(verifyRow).toContainText('verified');
  await expect(verifyRow.getByRole('button', { name: '发布' })).toBeVisible();
  await verifyRow.getByRole('button', { name: '发布' }).click();
  await page.getByRole('dialog', { name: '发布版本' }).getByRole('button', { name: '确认' }).click();
  await expect(verifyRow).toContainText('published');

  const publishedRow = page.getByRole('row').filter({ hasText: 'v2.0.0' });
  await publishedRow.getByRole('button', { name: '撤回' }).click();
  const withdrawDialog = page.getByRole('dialog', { name: '撤回版本' });
  await expect(withdrawDialog.getByRole('button', { name: '确认' })).toBeDisabled();
  await withdrawDialog.getByLabel('撤回原因').fill('发现阻断缺陷');
  await withdrawDialog.getByRole('button', { name: '确认' }).click();
  await expect(publishedRow).toContainText('withdrawn');

  failNextView = true;
  await settingsInput.fill('9');
  await saveSettings.click();
  await expect(page.getByRole('status')).toHaveText('发布保留策略已更新。');
  await expect(page.getByRole('alert').getByText(/操作已成功，但发布工作台刷新失败/u)).toBeVisible();
  expect(viewRequests).toBeGreaterThanOrEqual(8);
  expect(mutations).toEqual([
    ['settings', { retention_count: 8 }],
    ['create', { version_name: 'v2.2.0', title: '下一版本', notes: '跨宿主一致发布', channel: 'internal', manifest_sha256: 'c'.repeat(64), signing_key_id: 'release-key-2', source_commit: 'd'.repeat(40), source_tag: 'desktop-v2.2.0' }],
    ['update', 9, { version_name: 'v2.2.0', title: '下一版本修订', notes: '跨宿主一致发布', publish: false }],
    ['verify', 7, undefined],
    ['update', 7, { version_name: 'v2.1.0', title: '待校验版本', notes: '内部桌面发布', publish: true }],
    ['withdraw', 8, { reason: '发现阻断缺陷', github_withdrawal_status: 'pending' }],
    ['settings', { retention_count: 9 }],
  ]);
});

test('shared system release assets complete browser upload download and confirmed deletion', async ({ page }) => {
  const requests = [];
  const release = { id: 7, version_name: 'v2.3.0', title: '资产生命周期', notes: 'Browser 直传', status: 'draft', channel: 'internal', verification_status: 'pending', manifest_sha256: 'a'.repeat(64), signing_key_id: 'release-key-1', source_commit: 'b'.repeat(40), source_tag: 'desktop-v2.3.0', published_at: '', verified_at: '', withdrawn_at: '', withdrawal_reason: '', github_withdrawal_status: '', created_by: '发布管理员', updated_by: '发布管理员', created_at: '2026-08-08T00:00:00Z', updated_at: '2026-08-08T01:00:00Z', asset_count: 0, platform_count: 0 };
  const assets = [];
  const view = () => ({ settings: { retention_count: 5, updated_by: '发布管理员', updated_at: '2026-08-08T01:00:00Z' }, items: [{ release: { ...release, asset_count: assets.length, platform_count: new Set(assets.map((asset) => asset.platform)).size }, assets: [...assets] }], pagination: { page: 1, per_page: 10, total_items: 1, total_pages: 1 }, can_manage_releases: true });
  await page.route('**/api/v1/system/releases-view*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: view() }) }));
  await page.route('**/api/v1/system/releases/7/assets', async (route) => {
    const body = route.request().postDataJSON();
    requests.push(['create', body]);
    const asset = { id: 19, release_id: 7, platform: body.platform, architecture: body.architecture, artifact_kind: body.artifact_kind, filename: body.original_filename, content_type: body.content_type, byte_size: body.byte_size, status: 'pending', checksum_sha256: body.checksum_sha256, created_at: '2026-08-08T02:00:00Z' };
    assets.push(asset);
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: asset }) });
  });
  await page.route('**/api/v1/system/releases/7/assets/19/upload-url*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { attachment: { id: 19, file_object_id: 99, object_key: 'private/release', filename: 'desktop.exe', content_type: 'application/octet-stream', byte_size: 12, status: 'pending', created_by: '', created_at: '2026-08-08T02:00:00Z' }, request: { method: 'PUT', url: '/e2e-release-upload', headers: [['content-type', 'application/octet-stream']] }, expires_in_seconds: 60, expires_at: new Date(Date.now() + 60_000).toISOString(), checksum_sha256: '' } }) }));
  await page.route('**/e2e-release-upload', async (route) => { requests.push(['upload', route.request().method(), route.request().postDataBuffer()?.length]); await route.fulfill({ status: 200, body: '' }); });
  await page.route('**/api/v1/system/releases/7/assets/19/uploaded', async (route) => { requests.push(['confirm']); assets[0] = { ...assets[0], status: 'uploaded' }; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: assets[0] }) }); });
  await page.route('**/api/v1/system/releases/7/assets/19/download-url*', (route) => { requests.push(['download-sign']); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { attachment: { id: 19, file_object_id: 99, object_key: 'private/release', filename: 'desktop.exe', content_type: 'application/octet-stream', byte_size: 12, status: 'uploaded', created_by: '', created_at: '2026-08-08T02:00:00Z' }, request: { method: 'GET', url: '/e2e-release-download', headers: [] }, expires_in_seconds: 60, expires_at: new Date(Date.now() + 60_000).toISOString(), checksum_sha256: assets[0].checksum_sha256 } }) }); });
  await page.route('**/e2e-release-download', (route) => route.fulfill({ status: 200, contentType: 'application/octet-stream', body: 'desktop-data' }));
  await page.route('**/api/v1/system/releases/7/assets/19', async (route) => { requests.push(['delete']); const deleted = assets.shift(); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: deleted }) }); });

  await login(page, '/web/app/system/releases');
  await page.getByRole('row').filter({ hasText: 'v2.3.0' }).getByRole('button', { name: '编辑' }).click();
  const editor = page.getByRole('dialog', { name: '编辑版本草稿' });
  await editor.locator('#system-release-asset-platform-native').selectOption('windows');
  await editor.locator('#system-release-asset-architecture-native').selectOption('x64');
  await editor.locator('#system-release-asset-kind-native').selectOption('installer');
  await chooseFile(page, editor.getByRole('button', { name: '选择并上传' }), { name: 'desktop.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('desktopdata') });
  await expect(page.locator('p.shell-live-region[role="status"]')).toHaveText('desktop.exe 已上传。');
  await editor.getByRole('button', { name: '取消' }).click();
  const assetRow = page.getByRole('row').filter({ hasText: 'desktop.exe' });
  await expect(assetRow).toContainText('uploaded');
  const popupPromise = page.waitForEvent('popup');
  await assetRow.getByRole('button', { name: '下载' }).click();
  const popup = await popupPromise;
  await popup.close();
  await expect(page.locator('p.shell-live-region[role="status"]')).toHaveText('desktop.exe 下载已开始。');
  await assetRow.getByRole('button', { name: '删除' }).click();
  const deletion = page.getByRole('dialog', { name: '删除版本资产' });
  await expect(deletion).toContainText('desktop.exe');
  await deletion.getByRole('button', { name: '确认删除' }).click();
  await expect(page.getByRole('table', { name: '系统版本资产' })).toContainText('当前页版本暂无资产。');
  expect(requests.map(([kind]) => kind)).toEqual(['create', 'upload', 'confirm', 'download-sign', 'delete']);
  expect(requests[0][1]).toMatchObject({ platform: 'windows', architecture: 'x64', artifact_kind: 'installer', original_filename: 'desktop.exe', byte_size: 11 });
  expect(requests[0][1].checksum_sha256).toMatch(/^[0-9a-f]{64}$/u);
});

test('shared system storage mutations preserve confirmation lock and final refresh semantics', async ({ page }) => {
  const mutations = [];
  let version = 3;
  let bucket = 'yuance-files';
  let initialized = false;
  const view = () => ({
    config: { id: version, provider: 'aliyun_oss', endpoint: 'https://oss.example', region: 'cn-test', bucket, access_key_id_hint: 'AKIA****E2E1', status: 'active', version, updated_at: '2026-08-08T01:00:00Z' },
    versions: [
      { id: version, storage_config_id: version, version, provider: 'aliyun_oss', endpoint: 'https://oss.example', region: 'cn-test', bucket, access_key_id_hint: 'AKIA****E2E1', snapshot_status: 'active', current_status: 'active', created_by: '系统管理员', created_at: '2026-08-08T01:00:00Z' },
      { id: 2, storage_config_id: 2, version: 2, provider: 'aliyun_oss', endpoint: 'https://oss-old.example', region: 'cn-old', bucket: 'yuance-old', access_key_id_hint: 'AKIA****OLD1', snapshot_status: 'active', current_status: 'disabled', created_by: '系统管理员', created_at: '2026-08-07T01:00:00Z' },
    ],
    pagination: { page: 1, per_page: 10, total_items: 2, total_pages: 1 },
    inspection: { ok: initialized, provider: 'aliyun_oss', bucket, initialized, needs_initialization: !initialized, can_write: false, can_read: initialized, can_delete: false, marker_key: 'yuance-system/.initialized', checks: [{ code: 'init_marker', status: initialized ? 'pass' : 'warn', message: initialized ? '初始化标记存在。' : '初始化标记缺失。' }], message: initialized ? '对象存储桶运行就绪' : '对象存储桶需要初始化' },
    inspection_error: '', can_manage_storage: true,
  });
  await page.route('**/api/v1/system/storage-view*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: view() }) }));
  await page.route('**/api/v1/storage/config', async (route) => {
    const body = route.request().postDataJSON();
    mutations.push(['save', body]);
    version += 1; bucket = body.bucket;
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: view().config }) });
  });
  await page.route('**/api/v1/storage/config/probe', async (route) => {
    mutations.push(['probe']);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { ok: true, provider: 'aliyun_oss', bucket, message: '对象存储探测通过' } }) });
  });
  await page.route('**/api/v1/storage/config/initialize', async (route) => {
    mutations.push(['initialize']); initialized = true;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { ok: true, provider: 'aliyun_oss', bucket, marker_key: 'yuance-system/.initialized', message: '对象存储桶初始化完成' } }) });
  });
  await page.route('**/api/v1/storage/config/versions/2/rollback', async (route) => {
    mutations.push(['rollback', 2]); version += 1; bucket = 'yuance-old';
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: view().config }) });
  });

  await login(page, '/web/app/system/storage');
  await page.getByRole('button', { name: '编辑配置' }).click();
  const editor = page.getByRole('dialog', { name: '编辑阿里云 OSS 配置' });
  await editor.getByLabel('Bucket').fill('yuance-next');
  await editor.getByLabel('AccessKey ID').fill('AKIAORIGINALSECRET');
  await editor.getByLabel('AccessKey Secret').fill('StorageSecret2026!');
  await editor.getByRole('button', { name: '保存并激活' }).click();
  const switchConfirmation = page.getByRole('dialog', { name: '切换对象存储目标' });
  await expect(mutations).toHaveLength(0);
  await switchConfirmation.getByRole('button', { name: '确认' }).click();
  await expect(editor).not.toBeVisible();
  await expect(page.getByRole('region', { name: '存储工作台' })).toContainText('yuance-next');

  await page.getByRole('button', { name: '测试连接' }).click();
  await expect(page.getByRole('status')).toHaveText('对象存储探测通过');
  await page.getByRole('button', { name: '初始化桶' }).click();
  await page.getByRole('dialog', { name: '初始化对象存储 Bucket' }).getByRole('button', { name: '确认' }).click();
  await expect(page.getByRole('region', { name: '存储工作台' })).toContainText('运行就绪');

  await page.getByLabel('存储配置版本').getByRole('button', { name: '回滚到此版本' }).click();
  await page.getByRole('dialog', { name: '回滚对象存储配置' }).getByRole('button', { name: '确认' }).click();
  await expect.poll(() => mutations.map(([kind]) => kind)).toEqual(['save', 'probe', 'initialize', 'rollback']);
  await expect(page.getByRole('region', { name: '存储工作台' }).locator('dl')).toContainText('yuance-old');
  expect(mutations[0][1]).toEqual({ endpoint: 'https://oss.example', region: 'cn-test', bucket: 'yuance-next', access_key_id: 'AKIAORIGINALSECRET', access_key_secret: 'StorageSecret2026!', activate: true });
});

test('shared system storage reports committed probe separately when final refresh fails', async ({ page }) => {
  let failRefresh = false;
  let failedRefreshRequests = 0;
  await page.route('**/api/v1/system/storage-view*', (route) => {
    if (failRefresh) { failedRefreshRequests += 1; return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'unavailable', message: '读取暂时不可用。' } }) }); }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: {
      config: { id: 1, provider: 'aliyun_oss', endpoint: 'https://oss.example', region: 'cn-test', bucket: 'yuance-files', access_key_id_hint: 'AKIA****E2E1', status: 'active', version: 1, updated_at: '2026-08-08T01:00:00Z' },
      versions: [], pagination: { page: 1, per_page: 10, total_items: 0, total_pages: 1 }, inspection: null,
      inspection_error: '检查暂时不可用。', can_manage_storage: true,
    } }) });
  });
  await page.route('**/api/v1/storage/config/probe', (route) => { failRefresh = true; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { ok: true, provider: 'aliyun_oss', bucket: 'yuance-files', message: '对象存储探测通过' } }) }); });

  await login(page, '/web/app/system/storage');
  await page.getByRole('button', { name: '测试连接' }).click();
  await expect(page.locator('p.shell-live-region[role="status"]')).toContainText('对象存储探测通过');
  await expect(page.getByRole('alert')).toContainText('操作已成功，但存储工作台刷新失败');
  await expect(page.getByRole('alert')).not.toContainText('探测失败');
  expect(failedRefreshRequests).toBe(1);
});

test('shared system role mutations preserve permission parent and confirmation semantics', async ({ page }) => {
  const mutations = [];
  let status = 'active';
  const permissions = [
    { permission_key: 'system.users.view', permission_name: '查看用户管理', resource_type: 'page', resource_key: 'system.users', granted: false },
    { permission_key: 'system.users.manage', permission_name: '管理用户', resource_type: 'action', resource_key: 'system.users', granted: false },
  ];
  await page.route('**/api/v1/system/roles-view*', async (route) => {
    const url = new URL(route.request().url());
    const roleCode = url.searchParams.get('role') || 'qa_lead';
    const selected = { role_code: roleCode, role_name: roleCode === 'release_lead' ? '发布负责人' : '质量负责人', status, is_system: false, data_scope_type: 'all', permission_count: permissions.filter((item) => item.granted).length };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: {
      items: [selected], selected_role: selected, permissions,
      pagination: { page: 1, per_page: 10, total_items: 1, total_pages: 1 },
      can_manage_roles: true, can_edit_permissions: true,
    } }) });
  });
  await page.route('**/api/v1/system/roles/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const body = request.postDataJSON();
    mutations.push([request.method(), url.pathname, body]);
    if (url.pathname.endsWith('/permissions')) {
      for (const permission of permissions) permission.granted = body.permission_keys.includes(permission.permission_key);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: permissions }) });
      return;
    }
    status = body.status;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { role_code: 'qa_lead', role_name: '质量负责人', status, is_system: false, data_scope_type: 'all', permission_count: permissions.filter((item) => item.granted).length } }) });
  });
  await page.route('**/api/v1/system/roles', async (route) => {
    const request = route.request();
    mutations.push([request.method(), new URL(request.url()).pathname, request.postDataJSON()]);
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: { role_code: 'release_lead', role_name: '发布负责人', status: 'active', is_system: false, data_scope_type: 'all', permission_count: 0 } }) });
  });

  await login(page, '/web/app/system/roles?role=qa_lead');
  const permissionsTree = page.getByRole('region', { name: '权限树' });
  await permissionsTree.getByRole('checkbox', { name: '管理用户 未授权' }).check();
  await expect(permissionsTree.getByRole('checkbox', { name: '查看用户管理 已授权' })).toBeChecked();
  await page.getByRole('button', { name: '保存权限' }).click();
  await expect.poll(() => mutations.some(([method, path]) => method === 'PATCH' && path.endsWith('/permissions'))).toBe(true);

  await page.getByRole('button', { name: '禁用', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '确认禁用角色' })).toBeVisible();
  await page.getByRole('dialog', { name: '确认禁用角色' }).getByRole('button', { name: '确认禁用' }).click();
  await expect.poll(() => mutations.some(([method, path]) => method === 'PATCH' && path.endsWith('/status'))).toBe(true);

  await page.getByRole('button', { name: '新建角色' }).click();
  const createDialog = page.getByRole('dialog', { name: '创建角色' });
  await createDialog.getByLabel('角色编码').fill('release_lead');
  await createDialog.getByLabel('角色名称').fill('发布负责人');
  await createDialog.locator('#system-role-scope-native').selectOption('all');
  await createDialog.getByRole('button', { name: '创建', exact: true }).click();
  await expect(page).toHaveURL(/\/web\/app\/system\/roles\?role=release_lead$/);

  expect(mutations).toEqual([
    ['PATCH', '/api/v1/system/roles/qa_lead/permissions', { permission_keys: ['system.users.manage', 'system.users.view'] }],
    ['PATCH', '/api/v1/system/roles/qa_lead/status', { status: 'disabled' }],
    ['POST', '/api/v1/system/roles', { role_code: 'release_lead', role_name: '发布负责人', data_scope_type: 'all' }],
  ]);
});

test('shared system users core mutations use the same confirmed interaction contract', async ({ page }) => {
  const mutations = [];
  const user = {
    id: 7, username: 'shared_member', display_name: '共享成员', email: 'member@example.test', mobile: '', status: 'active',
    is_super_admin: false, role_code: 'member', role_names: '项目成员', created_at: '2026-08-08T00:00:00Z', updated_at: '2026-08-08T00:00:00Z', assigned_projects: [],
  };
  await page.route('**/api/v1/system/users-view*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: {
    items: [user], roles: [
      { role_code: 'member', role_name: '项目成员', status: 'active', is_system: true, data_scope_type: 'project', permission_count: 1 },
      { role_code: 'viewer', role_name: '只读成员', status: 'active', is_system: true, data_scope_type: 'project', permission_count: 1 },
    ], project_options: [], pagination: { page: 1, per_page: 10, total_items: 1, total_pages: 1 }, can_manage_users: true, can_manage_user_projects: true,
  } }) }));
  await page.route('**/api/v1/system/users', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    mutations.push({ method: route.request().method(), path: new URL(route.request().url()).pathname, body: route.request().postDataJSON() });
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: user }) });
  });
  await page.route(/\/api\/v1\/system\/users\/shared_member\/(status|role|password)$/u, async (route) => {
    mutations.push({ method: route.request().method(), path: new URL(route.request().url()).pathname, body: route.request().postDataJSON() });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: user }) });
  });

  await login(page, '/web/app/system/users');
  await page.getByRole('button', { name: '新建用户' }).click();
  const createDialog = page.getByRole('dialog', { name: '新建用户' });
  await createDialog.locator('#system-user-password').fill('DiscardedPass2026!');
  await createDialog.getByRole('button', { name: '取消' }).click();
  await page.getByRole('button', { name: '新建用户' }).click();
  await expect(createDialog.locator('#system-user-password')).toHaveValue('');
  await createDialog.getByLabel('用户名').fill('new_member');
  await createDialog.getByLabel('显示名称').fill('新成员');
  await createDialog.getByLabel('邮箱').fill('new@example.test');
  await createDialog.locator('#system-user-role-native').selectOption('member');
  await createDialog.locator('#system-user-password').fill('NewMemberPass2026!');
  await createDialog.locator('#system-user-password-confirm').fill('NewMemberPass2026!');
  await createDialog.getByRole('button', { name: '创建' }).click();
  await expect(createDialog).not.toBeVisible();

  const table = page.getByRole('table', { name: '系统用户列表' });
  await table.getByRole('button', { name: '角色' }).click();
  const roleDialog = page.getByRole('dialog', { name: '调整全局角色' });
  await roleDialog.locator('#system-user-role-value-native').selectOption('viewer');
  await roleDialog.getByRole('button', { name: '保存' }).click();
  await expect(roleDialog).not.toBeVisible();

  await table.getByRole('button', { name: '停用' }).click();
  const statusDialog = page.getByRole('dialog', { name: '停用用户' });
  await expect(statusDialog).toContainText('Browser/Desktop 会话、Token 和设备访问');
  await statusDialog.getByRole('button', { name: '确认停用' }).click();
  await expect(statusDialog).not.toBeVisible();

  await table.getByRole('button', { name: '重置密码' }).click();
  const passwordDialog = page.getByRole('dialog', { name: '重置用户密码' });
  await passwordDialog.locator('#system-user-new-password').fill('DiscardedReset2026!');
  await passwordDialog.getByRole('button', { name: '取消' }).click();
  await table.getByRole('button', { name: '重置密码' }).click();
  await expect(passwordDialog.locator('#system-user-new-password')).toHaveValue('');
  await passwordDialog.locator('#system-user-new-password').fill('ResetMemberPass2026!');
  await passwordDialog.locator('#system-user-new-password-confirm').fill('ResetMemberPass2026!');
  await passwordDialog.getByRole('button', { name: '确认重置' }).click();
  await expect(passwordDialog).not.toBeVisible();

  expect(mutations).toEqual([
    { method: 'POST', path: '/api/v1/system/users', body: { username: 'new_member', display_name: '新成员', email: 'new@example.test', mobile: '', password: 'NewMemberPass2026!', role_code: 'member' } },
    { method: 'PATCH', path: '/api/v1/system/users/shared_member/role', body: { role_code: 'viewer' } },
    { method: 'PATCH', path: '/api/v1/system/users/shared_member/status', body: { status: 'disabled' } },
    { method: 'POST', path: '/api/v1/system/users/shared_member/password', body: { password: 'ResetMemberPass2026!' } },
  ]);
});

test('shared system user project relationships preserve batch and blocking semantics', async ({ page }) => {
  const mutations = [];
  const project = (key, name, roleCode = 'member', overrides = {}) => ({
    key, name, status: 'in_progress', role_code: roleCode, active_assigned_count: 0,
    can_remove: true, can_update_role: true, remove_block_reason: '', ...overrides,
  });
  const user = {
    id: 8, username: 'project_member', display_name: '项目成员', email: '', mobile: '', status: 'active', is_super_admin: false,
    role_code: 'member', role_names: '项目成员', created_at: '2026-08-08T00:00:00Z', updated_at: '2026-08-08T00:00:00Z',
    assigned_projects: [
      project('YCE-A', '项目 A'),
      project('YCE-BLOCK', '阻塞项目', 'member', { active_assigned_count: 2, can_remove: false, remove_block_reason: '仍有 2 个活跃工作项，需先转交处理人' }),
    ],
  };
  const view = () => ({
    items: [user], roles: [{ role_code: 'member', role_name: '项目成员', status: 'active', is_system: true, data_scope_type: 'project', permission_count: 1 }],
    project_options: [
      { key: 'YCE-A', name: '项目 A', owner: '管理员', status: 'in_progress' },
      { key: 'YCE-B', name: '项目 B', owner: '管理员', status: 'in_progress' },
      { key: 'YCE-C', name: '项目 C', owner: '管理员', status: 'in_progress' },
      { key: 'YCE-BLOCK', name: '阻塞项目', owner: '管理员', status: 'in_progress' },
    ],
    pagination: { page: 1, per_page: 10, total_items: 1, total_pages: 1 }, can_manage_users: true, can_manage_user_projects: true,
  });
  await page.route('**/api/v1/system/users-view*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: view() }) }));
  await page.route(/\/api\/v1\/system\/users\/project_member\/projects(?:\/[^/]+(?:\/role)?)?$/u, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const body = request.postData() ? request.postDataJSON() : undefined;
    mutations.push({ method: request.method(), path, body });
    if (request.method() === 'POST') {
      for (const key of body.project_keys) user.assigned_projects.push(project(key, `项目 ${key.at(-1)}`, body.member_role));
    } else if (request.method() === 'PATCH') {
      const key = decodeURIComponent(path.split('/').at(-2));
      const relation = user.assigned_projects.find((entry) => entry.key === key);
      if (relation) relation.role_code = body.member_role;
    } else if (path.endsWith('/projects')) {
      user.assigned_projects = user.assigned_projects.filter((entry) => !body.project_keys.includes(entry.key));
    } else {
      const key = decodeURIComponent(path.split('/').at(-1));
      user.assigned_projects = user.assigned_projects.filter((entry) => entry.key !== key);
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: user }) });
  });

  await login(page, '/web/app/system/users');
  await page.getByRole('table', { name: '系统用户列表' }).getByRole('button', { name: '项目' }).click();
  const manageDialog = page.getByRole('dialog', { name: '管理用户项目' });
  await expect(manageDialog).toContainText('仍有 2 个活跃工作项');
  await expect(manageDialog.getByLabel('选择移除 阻塞项目')).toBeDisabled();
  await manageDialog.getByLabel(/YCE-B · 项目 B/u).check();
  await manageDialog.getByLabel(/YCE-C · 项目 C/u).check();
  await manageDialog.locator('#system-user-project-assign-role-native').selectOption('viewer');
  await manageDialog.getByRole('button', { name: '分配所选项目' }).click();
  await expect(manageDialog.getByRole('table', { name: '已分配项目' })).toContainText('YCE-C');

  const assignedTable = manageDialog.getByRole('table', { name: '已分配项目' });
  await assignedTable.getByRole('row').filter({ hasText: /YCE-B ·/u }).getByRole('button', { name: '角色' }).click();
  const roleDialog = page.getByRole('dialog', { name: '调整项目角色' });
  await roleDialog.locator('#system-user-project-role-native').selectOption('maintainer');
  await roleDialog.getByRole('button', { name: '保存' }).click();
  await expect(manageDialog).toBeVisible();

  await assignedTable.getByRole('row').filter({ hasText: /YCE-A ·/u }).getByRole('button', { name: '移除' }).click();
  let removeDialog = page.getByRole('dialog', { name: '移除项目关系' });
  await expect(removeDialog).toContainText('1 个项目关系');
  await removeDialog.getByRole('button', { name: '确认移除' }).click();
  await expect(manageDialog.getByRole('table', { name: '已分配项目' })).not.toContainText('YCE-A');

  await manageDialog.getByLabel('选择移除 项目 C').check();
  await manageDialog.getByRole('button', { name: '移除所选项目' }).click();
  removeDialog = page.getByRole('dialog', { name: '移除项目关系' });
  await removeDialog.getByRole('button', { name: '确认移除' }).click();
  await expect(manageDialog.getByRole('table', { name: '已分配项目' })).not.toContainText('YCE-C');

  expect(mutations).toEqual([
    { method: 'POST', path: '/api/v1/system/users/project_member/projects', body: { project_keys: ['YCE-B', 'YCE-C'], member_role: 'viewer' } },
    { method: 'PATCH', path: '/api/v1/system/users/project_member/projects/YCE-B/role', body: { member_role: 'maintainer' } },
    { method: 'DELETE', path: '/api/v1/system/users/project_member/projects/YCE-A', body: undefined },
    { method: 'DELETE', path: '/api/v1/system/users/project_member/projects', body: { project_keys: ['YCE-C'] } },
  ]);
});

test('project list can switch current project inside the app shell', async ({ page }) => {
  await login(page, '/web/app/projects');

  await expect(page).toHaveURL(/\/web\/app\/projects/);
  await expect(page.getByRole('heading', { level: 1, name: '项目' })).toBeVisible();
  await page.getByLabel('每页').selectOption('20');
  const opsRow = page.locator('.project-row', { hasText: 'OPS' });
  await expect(opsRow).toBeVisible();
  await opsRow.getByRole('button', { name: '设为当前项目' }).click();
  await expect(page.getByRole('button', { name: '切换当前项目' })).toContainText('交付运维台');
  await expect(page.locator('.project-row', { hasText: 'OPS' }).getByRole('button', { name: '当前项目' })).toBeVisible();
  await expect(page.getByRole('link', { name: '需求' })).toHaveAttribute('href', /project_key=OPS/);
  await expect(page.getByRole('link', { name: '任务' })).toHaveAttribute('href', /project_key=OPS/);
  await expect(page.getByRole('link', { name: 'Bug' })).toHaveAttribute('href', /project_key=OPS/);
});

test('project list preserves the main responsive card geometry', async ({ page }) => {
  await login(page, '/web/app/projects');
  for (const viewport of [
    { width: 390, height: 844, columns: 1 },
    { width: 768, height: 1024, columns: 2 },
    { width: 1280, height: 800, columns: 3 },
    { width: 1440, height: 900, columns: 3 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/web/app/projects');
    await expect(page.getByRole('heading', { level: 1, name: '项目' })).toBeVisible();
    const geometry = await page.locator('.projects-page').evaluate((element) => {
      const main = element.closest('.main');
      return {
        mainWidth: main.clientWidth,
        mainScrollWidth: main.scrollWidth,
        metricColumns: getComputedStyle(element.querySelector('.project-list-metrics')).gridTemplateColumns.split(' ').length,
        cardColumns: getComputedStyle(element.querySelector('.project-card-grid')).gridTemplateColumns.split(' ').length,
      };
    });
    expect(geometry.mainScrollWidth).toBeLessThanOrEqual(geometry.mainWidth);
    expect(geometry.metricColumns).toBe(viewport.width <= 720 ? 1 : 3);
    expect(geometry.cardColumns).toBe(viewport.columns);
  }
});

test('project detail preserves the main responsive geometry', async ({ page }) => {
  await login(page, '/web/app/projects/YCE');
  for (const viewport of [
    { width: 390, height: 844, metrics: 1, tabsVertical: true, overview: 1 },
    { width: 768, height: 1024, metrics: 4, tabsVertical: false, overview: 1 },
    { width: 1280, height: 800, metrics: 4, tabsVertical: false, overview: 1 },
    { width: 1440, height: 900, metrics: 4, tabsVertical: false, overview: 2 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/web/app/projects/YCE');
    await expect(page.locator('.project-detail-page h1')).toHaveText(/\S/u);
    const geometry = await page.locator('.project-detail-page').evaluate((element) => {
      const main = element.closest('.main');
      const hero = element.querySelector('.detail-hero').getBoundingClientRect();
      const metrics = element.querySelector('.project-detail-metrics');
      const tabsCard = element.querySelector('.project-tabs-card').getBoundingClientRect();
      const tabsHead = element.querySelector('.project-tabs-head');
      const overview = element.querySelector('.project-detail-overview');
      return {
        mainWidth: main.clientWidth,
        mainScrollWidth: main.scrollWidth,
        heroBottom: hero.bottom,
        metricsTop: metrics.getBoundingClientRect().top,
        metricsBottom: metrics.getBoundingClientRect().bottom,
        tabsTop: tabsCard.top,
        metricColumns: getComputedStyle(metrics).gridTemplateColumns.split(' ').length,
        tabsDirection: getComputedStyle(tabsHead).flexDirection,
        overviewColumns: getComputedStyle(overview).gridTemplateColumns.split(' ').length,
      };
    });
    expect(geometry.mainScrollWidth).toBeLessThanOrEqual(geometry.mainWidth);
    expect(geometry.heroBottom).toBeLessThanOrEqual(geometry.metricsTop);
    expect(geometry.metricsBottom).toBeLessThanOrEqual(geometry.tabsTop);
    expect(geometry.metricColumns).toBe(viewport.metrics);
    expect(geometry.tabsDirection).toBe(viewport.tabsVertical ? 'column' : 'row');
    expect(geometry.overviewColumns).toBe(viewport.overview);
  }
});

test('shared project list creates a project with one validated request', async ({ page }) => {
  await login(page, '/web/app/projects');
  const requests = [];
  await page.route('**/api/v1/projects', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    requests.push({ headers: route.request().headers(), payload: route.request().postDataJSON() });
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: {
      key: 'P260808123456', name: '共享创建项目', description: '项目创建 E2E', status: 'not_started',
      owner_username: 'yuance_admin', owner: '元策开发管理员', start_date: '2026-08-08', due_date: '2026-08-31',
      created_at: '2026-08-08T00:00:00Z', updated_at: '2026-08-08T00:00:00Z',
    } }) });
  });
  await page.getByRole('button', { name: '新建项目' }).click();
  const dialog = page.getByRole('dialog', { name: '新建项目' });
  await dialog.getByLabel('项目名称').fill('共享创建项目');
  await dialog.locator('#project-create-status-native').selectOption('not_started');
  await dialog.getByLabel('开始日期').fill('2026-08-08');
  await dialog.getByLabel('截止日期').fill('2026-08-31');
  await dialog.getByLabel('项目描述').fill('项目创建 E2E');
  await dialog.getByRole('button', { name: '创建' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('status')).toHaveText('项目 P260808123456 已创建。');
  expect(requests).toHaveLength(1);
  expect(requests[0].headers['x-yuance-csrf-token']).toBeTruthy();
  expect(requests[0].payload).toEqual({ name: '共享创建项目', description: '项目创建 E2E', status: 'not_started', start_date: '2026-08-08', due_date: '2026-08-31' });
});

test('shared project detail manages project information and member lifecycle', async ({ page }) => {
  const detail = {
    key: 'YCE', name: '元策研发平台', description: '原始描述', status: 'in_progress',
    owner_username: 'yuance_admin', owner: '元策开发管理员', start_date: '2026-08-01', due_date: '2026-08-31',
    created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-07T00:00:00Z',
  };
  let members = [{ user_id: 1, display_name: '元策开发管理员', username: 'yuance_admin', member_role: 'owner', joined_at: '2026-08-01T00:00:00Z' }];
  const memberCandidates = [
    { display_name: '协作成员', username: 'collaborator', roles: '普通成员' },
    { display_name: '评审成员', username: 'reviewer', roles: '质量负责人' },
  ];
  const mutations = [];
  await page.route('**/api/v1/projects/YCE', async (route) => {
    if (route.request().method() === 'PATCH') {
      mutations.push(['update', route.request().postDataJSON()]);
      Object.assign(detail, route.request().postDataJSON());
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: detail }) });
  });
  await page.route('**/api/v1/projects/YCE/members', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: members }) });
  });
  await page.route('**/api/v1/projects/YCE/members/candidates', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: memberCandidates }) });
  });
  await page.route('**/api/v1/projects/YCE/members/batch', async (route) => {
    const payload = route.request().postDataJSON();
    mutations.push(['batch', payload]);
    members.push(...payload.usernames.map((username, index) => ({ user_id: index + 2, display_name: memberCandidates.find((candidate) => candidate.username === username).display_name, username, member_role: payload.member_role, joined_at: '2026-08-08T00:00:00Z' })));
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: members.slice(1) }) });
  });
  await page.route('**/api/v1/projects/YCE/members/collaborator', async (route) => {
    if (route.request().method() === 'PATCH') {
      const payload = route.request().postDataJSON(); mutations.push(['role', payload]); members = members.map((member) => member.username === 'collaborator' ? { ...member, member_role: payload.member_role } : member);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: members.find((member) => member.username === 'collaborator') }) }); return;
    }
    mutations.push(['remove']); members = members.filter((member) => member.username !== 'collaborator');
    await route.fulfill({ status: 204, body: '' });
  });

  await login(page, '/web/app/projects/YCE');
  await expect(page.getByRole('heading', { level: 1, name: '元策研发平台' })).toBeVisible();
  await page.getByRole('button', { name: '编辑项目' }).click();
  const editDialog = page.getByRole('dialog', { name: '编辑项目' });
  await editDialog.getByLabel('项目描述').fill('共享详情描述');
  await editDialog.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText('共享详情描述')).toBeVisible();

  await page.getByRole('link', { name: '成员', exact: true }).click();
  await page.getByRole('button', { name: '添加成员' }).click();
  const addDialog = page.getByRole('dialog', { name: '添加项目成员' });
  await addDialog.getByLabel('搜索用户').fill('协作');
  await addDialog.getByRole('checkbox', { name: /协作成员/ }).check();
  await addDialog.getByLabel('搜索用户').fill('');
  await addDialog.getByRole('checkbox', { name: /评审成员/ }).check();
  await addDialog.locator('#project-member-role-native').selectOption('member');
  await addDialog.getByRole('button', { name: '加入项目' }).click();
  const memberRow = page.getByRole('row', { name: /协作成员/ });
  await memberRow.getByRole('button', { name: '调整角色' }).click();
  const roleDialog = page.getByRole('dialog', { name: '调整成员角色' });
  await roleDialog.locator('#project-member-role-value-native').selectOption('maintainer');
  await roleDialog.getByRole('button', { name: '保存' }).click();
  await expect(memberRow).toContainText('项目管理员');
  await memberRow.getByRole('button', { name: '移除' }).click();
  await page.getByRole('dialog', { name: '移除项目成员' }).getByRole('button', { name: '确认移除' }).click();
  await expect(page.getByRole('row', { name: /协作成员/ })).toHaveCount(0);
  expect(mutations.map(([kind]) => kind)).toEqual(['update', 'batch', 'role', 'remove']);
  expect(mutations[1][1]).toEqual({ usernames: ['collaborator', 'reviewer'], member_role: 'member' });
});

test('shared project resources filter read and unlock protected details', async ({ page }) => {
  await routeEmptyProjectResourceAttachments(page);
  const project = { key: 'YCE', name: '元策研发平台', description: '', status: 'in_progress', owner_username: 'yuance_admin', owner: '元策开发管理员', start_date: '', due_date: '', created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-07T00:00:00Z' };
  const members = [{ user_id: 1, display_name: '元策开发管理员', username: 'yuance_admin', member_role: 'owner', joined_at: '2026-08-01T00:00:00Z' }];
  const publicResource = projectResourceFixture();
  const protectedSummary = projectResourceFixture({ id: 902, title: '正式环境密钥', body: '', summary: '仅授权成员可解锁', is_protected: true, tags: ['正式环境'], related_work_item: null, url: '/web/projects/YCE/resources/902' });
  const resourceQueries = [];
  const unlockPasswords = [];
  let releaseDelayedUnlock;
  const delayedUnlockStarted = new Promise((resolve) => {
    releaseDelayedUnlock = resolve;
  });

  await page.route(/\/api\/v1\/projects\/YCE\/resources(?:\?.*)?$/, async (route) => {
    const url = new URL(route.request().url());
    resourceQueries.push(url.search);
    const filtered = url.searchParams.get('q') === '客户端' ? [publicResource] : [publicResource, protectedSummary];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: filtered }) });
  });
  await page.route('**/api/v1/projects/YCE/resources/901', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: publicResource }) }));
  await page.route('**/api/v1/projects/YCE/resources/902/unlock', async (route) => {
    const password = route.request().postDataJSON().access_password;
    unlockPasswords.push(password);
    if (password === 'stale-pass') {
      releaseDelayedUnlock();
      await new Promise((resolve) => { releaseDelayedUnlock = resolve; });
    }
    if (password !== 'safe-pass') {
      await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: { code: 'forbidden', message: '访问密码不正确' } }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { ...protectedSummary, body: 'secret=desktop-browser-parity' } }) });
  });
  await page.route('**/api/v1/projects/YCE/members', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: members }) }));
  await page.route('**/api/v1/projects/YCE', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: project }) }));

  await login(page, '/web/app/projects/YCE/resources');
  const list = page.getByRole('list', { name: '项目资料列表' });
  await expect(list).toContainText('客户端联调参数');
  await expect(list).toContainText('正式环境密钥');
  await page.getByLabel('关键词').fill('客户端');
  await page.getByRole('button', { name: '筛选' }).click();
  await expect(list).toContainText('客户端联调参数');
  await expect(list).not.toContainText('正式环境密钥');
  expect(resourceQueries.at(-1)).toBe('?q=%E5%AE%A2%E6%88%B7%E7%AB%AF');

  await list.getByRole('link', { name: '客户端联调参数' }).click();
  await expect(page).toHaveURL(/\/web\/app\/projects\/YCE\/resources\/901$/);
  await expect(page.locator('.resource-content-card')).toBeVisible();
  await expect(page.getByText('client_id=yuance-e2e')).toBeVisible();
  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    const geometry = await page.locator('.resource-detail-page').evaluate((element) => { const main = element.closest('.main'); return { mainWidth: main.clientWidth, mainScrollWidth: main.scrollWidth, summaryColumns: getComputedStyle(element.querySelector('.resource-summary-grid')).gridTemplateColumns.split(' ').length, heroDirection: getComputedStyle(element.querySelector('.resource-hero')).flexDirection }; });
    expect(geometry.mainScrollWidth).toBeLessThanOrEqual(geometry.mainWidth);
    expect(geometry.summaryColumns).toBe(viewport.width <= 720 ? 1 : 2);
    expect(geometry.heroDirection).toBe(viewport.width <= 720 ? 'column' : 'row');
  }
  await page.getByRole('link', { name: '返回资料库' }).click();
  await page.getByRole('list', { name: '项目资料列表' }).getByRole('link', { name: '正式环境密钥' }).click();

  await expect(page.getByRole('heading', { level: 2, name: '这条资料已设置访问密码' })).toBeVisible();
  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    const geometry = await page.locator('.resource-detail-page').evaluate((element) => { const main = element.closest('.main'); const lock = element.querySelector('.resource-lock-card'); return { mainWidth: main.clientWidth, mainScrollWidth: main.scrollWidth, lockWidth: lock.getBoundingClientRect().width }; });
    expect(geometry.mainScrollWidth).toBeLessThanOrEqual(geometry.mainWidth);
    expect(geometry.lockWidth).toBeLessThanOrEqual(560);
  }
  await page.locator('#project-resource-password').fill('stale-pass');
  await page.getByRole('button', { name: '验证并查看' }).click();
  await delayedUnlockStarted;
  await page.getByRole('link', { name: '返回资料库' }).click();
  releaseDelayedUnlock();
  await expect(page.getByRole('list', { name: '项目资料列表' })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: '资料' })).toHaveCount(0);
  await page.getByRole('list', { name: '项目资料列表' }).getByRole('link', { name: '正式环境密钥' }).click();
  await page.locator('#project-resource-password').fill('wrong-pass');
  await page.getByRole('button', { name: '验证并查看' }).click();
  await expect(page.getByRole('alert').filter({ hasText: '资料操作失败' })).toContainText('访问密码不正确');
  await expect(page.getByRole('heading', { level: 2, name: '这条资料已设置访问密码' })).toBeVisible();
  await page.locator('#project-resource-password').fill('safe-pass');
  await page.getByRole('button', { name: '验证并查看' }).click();
  await expect(page.locator('.resource-content-card')).toBeVisible();
  await expect(page.getByText('secret=desktop-browser-parity')).toBeVisible();
  expect(unlockPasswords).toEqual(['stale-pass', 'wrong-pass', 'safe-pass']);
});

test('shared project resources create edit password actions and archive', async ({ page }) => {
  await routeEmptyProjectResourceAttachments(page);
  const project = { key: 'YCE', name: '元策研发平台', description: '', status: 'in_progress', owner_username: 'yuance_admin', owner: '元策开发管理员', start_date: '', due_date: '', created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-07T00:00:00Z' };
  const members = [{ user_id: 1, display_name: '元策开发管理员', username: 'yuance_admin', member_role: 'owner', joined_at: '2026-08-01T00:00:00Z' }];
  let resource = projectResourceFixture({ id: 930, title: '待创建资料', body: 'initial', tags: [], related_work_item: null });
  let resources = [];
  const mutations = [];
  await page.route(/\/api\/v1\/projects\/YCE\/resources(?:\?.*)?$/, async (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      const payload = request.postDataJSON();
      mutations.push(['create', payload]);
      resource = projectResourceFixture({ id: 930, title: payload.title, category: payload.category, body: `${payload.body}<img src="/broken-rich-image" onerror="window.__resourceRichXss=true"><script>window.__resourceRichXss=true</script>`, body_format: payload.body_format, summary: payload.body, is_protected: Boolean(payload.access_password), tags: payload.tags, related_work_item: payload.related_work_item_key ? { key: payload.related_work_item_key, item_type: 'task', title: '关联工作项', url: `/web/work-items/${payload.related_work_item_key}` } : null, related_cycle: payload.related_cycle_id ? { id: payload.related_cycle_id, name: '迭代一', start_date: '2026-08-01', end_date: '2026-08-15', url: `/web/projects/YCE/cycles/${payload.related_cycle_id}` } : null, url: '/web/projects/YCE/resources/930' });
      resources = [resource];
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: resource }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: resources }) });
  });
  await page.route('**/api/v1/projects/YCE/resources/930', async (route) => {
    const request = route.request();
    if (request.method() === 'PATCH') {
      const payload = request.postDataJSON();
      mutations.push(['update', payload]);
      resource = { ...resource, title: payload.title, category: payload.category, body: payload.body, body_format: payload.body_format, summary: payload.body, is_protected: payload.access_password_action === 'set' ? true : payload.access_password_action === 'clear' ? false : resource.is_protected, tags: payload.tags, updated_at: '2026-08-07T09:00:00Z' };
      resources = [resource];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: resource }) });
      return;
    }
    if (request.method() === 'DELETE') {
      mutations.push(['archive', null]);
      resource = { ...resource, status: 'archived' };
      resources = [resource];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: resource }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: resource }) });
  });
  await page.route('**/api/v1/projects/YCE/resources/930/unlock', async (route) => {
    expect(route.request().postDataJSON()).toEqual({ access_password: 'safe-pass' });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: resource }) });
  });
  await page.route('**/api/v1/projects/YCE/resources/930/password/reset', async (route) => {
    const payload = route.request().postDataJSON();
    mutations.push(['reset', payload]);
    resource = { ...resource, is_protected: payload.access_password_action === 'set' };
    resources = [resource];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: resource }) });
  });
  await page.route('**/api/v1/projects/YCE/members', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: members }) }));
  await page.route('**/api/v1/projects/YCE', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: project }) }));

  await login(page, '/web/app/projects/YCE/resources');
  await page.getByRole('button', { name: '新建资料' }).click();
  const createDialog = page.getByRole('dialog', { name: '新建项目资料' });
  await expect(createDialog.getByRole('button', { name: '选择附件' })).toHaveCount(0);
  await expect(createDialog.getByLabel('关联工作项 Key')).toHaveCount(0);
  await expect(createDialog.getByLabel('关联周期 ID')).toHaveCount(0);
  const createFieldGrid = createDialog.locator('.project-resource-form-fields');
  await expect.poll(() => createFieldGrid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(4);
  await expect.poll(() => createDialog.locator('#project-resource-form').evaluate((form) => form.lastElementChild?.classList.contains('yc-rich-field'))).toBe(true);
  await expect.poll(() => createDialog.locator('.yc-rich-text-editor').evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(400);
  await createDialog.getByLabel('资料标题').fill('部署手册');
  await createDialog.locator('#project-resource-category-native').selectOption('implementation');
  await createDialog.getByLabel('标签').fill('发布，运维');
  await createDialog.getByLabel('资料正文').evaluate((input) => {
    input.innerHTML = '<h2>发布方案</h2><pre><code>release=v1</code></pre>';
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  });
  await createDialog.getByLabel('初始访问密码').fill('safe-pass');
  await createDialog.getByRole('button', { name: '保存' }).click();
  await expect(page.getByRole('list', { name: '项目资料列表' })).toContainText('部署手册');
  expect(mutations[0]).toEqual(['create', { title: '部署手册', category: 'implementation', body: '<h2>发布方案</h2><pre><code>release=v1</code></pre>', body_format: 'html', access_password: 'safe-pass', tags: ['发布', '运维'], related_work_item_key: '', related_cycle_id: null }]);

  await page.getByRole('link', { name: '部署手册' }).click();
  await page.getByRole('button', { name: '重置保险箱密码' }).click();
  let resetDialog = page.getByRole('dialog', { name: '重置资料访问密码' });
  await resetDialog.getByLabel('新访问密码').fill('reset-pass');
  await resetDialog.getByRole('button', { name: '确认重置' }).click();
  await expect(resetDialog).not.toBeVisible();
  await expect(page.getByText('资料访问密码已重置。')).toBeVisible();
  await expect(page.getByRole('button', { name: '验证并查看' })).toBeVisible();
  expect(mutations[1]).toEqual(['reset', { access_password_action: 'set', access_password: 'reset-pass' }]);
  await page.getByRole('button', { name: '重置保险箱密码' }).click();
  resetDialog = page.getByRole('dialog', { name: '重置资料访问密码' });
  await resetDialog.locator('#project-resource-password-reset-action-native').selectOption('clear');
  await resetDialog.getByRole('button', { name: '确认重置' }).click();
  await expect(page.locator('.resource-content-card')).toBeVisible();
  expect(mutations[2]).toEqual(['reset', { access_password_action: 'clear', access_password: '' }]);
  await expect(page.getByRole('heading', { level: 2, name: '发布方案' })).toBeVisible();
  await expect(page.locator('.yc-rich-text-content code')).toHaveText('release=v1');
  await expect(page.locator('.yc-rich-text-content script')).toHaveCount(0);
  await expect(page.locator('.yc-rich-text-content img')).not.toHaveAttribute('onerror');
  expect(await page.evaluate(() => window.__resourceRichXss === true)).toBe(false);
  await page.getByRole('button', { name: '编辑' }).click();
  const editDialog = page.getByRole('dialog', { name: '编辑项目资料' });
  await expect(editDialog.getByLabel('关联工作项 Key')).toHaveCount(0);
  await expect(editDialog.getByLabel('关联周期 ID')).toHaveCount(0);
  const editFieldGrid = editDialog.locator('.project-resource-form-fields');
  await expect.poll(() => editFieldGrid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(4);
  await expect.poll(() => editDialog.locator('#project-resource-form').evaluate((form) => form.lastElementChild?.classList.contains('yc-rich-field'))).toBe(true);
  await expect.poll(() => editDialog.locator('.yc-rich-text-editor').evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(400);
  await editDialog.getByLabel('资料标题').fill('部署手册 2.0');
  await editDialog.locator('#project-resource-password-action-native').selectOption('set');
  await editDialog.getByLabel('新访问密码').fill('next-pass');
  await editDialog.getByRole('button', { name: '保存' }).click();
  await expect(page.getByRole('heading', { level: 2, name: '部署手册 2.0' })).toBeVisible();
  expect(mutations[3][1]).toMatchObject({ access_password_action: 'set', access_password: 'next-pass' });

  await page.getByRole('button', { name: '编辑' }).click();
  const clearDialog = page.getByRole('dialog', { name: '编辑项目资料' });
  await clearDialog.locator('#project-resource-password-action-native').selectOption('clear');
  await clearDialog.getByRole('button', { name: '保存' }).click();
  await expect(clearDialog).not.toBeVisible();
  expect(mutations[4][1]).toMatchObject({ access_password_action: 'clear', access_password: '' });
  await page.getByRole('button', { name: '归档' }).click();
  await page.getByRole('dialog', { name: '归档项目资料' }).getByRole('button', { name: '确认归档' }).click();
  await expect(page).toHaveURL(/\/web\/app\/projects\/YCE\/resources$/);
  await expect(page.getByRole('list', { name: '项目资料列表' })).toContainText('已归档');
  expect(mutations[5]).toEqual(['archive', null]);
});

test('shared project resource creation uploads attachments through rich text', async ({ page }) => {
  const project = { key: 'YCE', name: '元策研发平台', description: '', status: 'in_progress', owner_username: 'yuance_admin', owner: '元策开发管理员', start_date: '', due_date: '', created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-07T00:00:00Z' };
  const members = [{ user_id: 1, display_name: '元策开发管理员', username: 'yuance_admin', member_role: 'owner', joined_at: '2026-08-01T00:00:00Z' }];
  const operations = [];
  let checksum = '';
  let resource = projectResourceFixture({ id: 970, title: '创建附件资料', body: '<p>正文</p>', url: '/web/projects/YCE/resources/970' });
  let attachment = { id: 971, filename: 'create-notes.txt', content_type: 'text/plain', byte_size: 11, status: 'pending', created_by: '元策开发管理员', created_at: '2026-08-07T00:00:00Z' };
  await page.route('**/api/v1/test-storage/upload**', async (route) => {
    operations.push('put');
    await route.fulfill({ status: 200, body: '' });
  });
  await page.route('**/api/v1/projects/YCE/resources/970/attachments/971/upload-url', async (route) => {
    operations.push('sign');
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { attachment, request: { method: 'PUT', url: '/api/v1/test-storage/upload?target=create-resource-971', headers: [['content-type', 'text/plain']] }, expires_in_seconds: 600, checksum_sha256: checksum } }) });
  });
  await page.route('**/api/v1/projects/YCE/resources/970/attachments/971/uploaded', async (route) => {
    operations.push('confirm'); attachment = { ...attachment, status: 'uploaded' };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: attachment }) });
  });
  await page.route('**/api/v1/projects/YCE/resources/970/attachments', async (route) => {
    operations.push('register'); checksum = route.request().postDataJSON().checksum_sha256;
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: attachment }) });
  });
  await page.route('**/api/v1/projects/YCE/resources/970', async (route) => {
    const payload = route.request().postDataJSON(); operations.push('patch'); resource = { ...resource, body: payload.body, body_format: payload.body_format };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: resource }) });
  });
  await page.route(/\/api\/v1\/projects\/YCE\/resources(?:\?.*)?$/u, async (route) => {
    if (route.request().method() === 'POST') { operations.push('create'); await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: resource }) }); return; }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: operations.includes('create') ? [resource] : [] }) });
  });
  await page.route('**/api/v1/projects/YCE/members', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: members }) }));
  await page.route('**/api/v1/projects/YCE', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: project }) }));

  await login(page, '/web/app/projects/YCE/resources');
  await page.getByRole('button', { name: '新建资料' }).click();
  const dialog = page.getByRole('dialog', { name: '新建项目资料' });
  await dialog.getByLabel('资料标题').fill('创建附件资料');
  await dialog.getByLabel('资料正文').evaluate((input) => { input.innerHTML = '<p>正文</p>'; input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' })); });
  await expect(dialog.getByRole('button', { name: '选择附件' })).toHaveCount(0);
  await dialog.getByLabel('资料正文').evaluate((input) => {
    const file = new File(['hello world'], 'create-notes.txt', { type: 'text/plain' });
    const clipboardData = new DataTransfer();
    clipboardData.items.add(file);
    input.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }));
  });
  await expect.poll(() => operations.length).toBe(5);
  await expect(dialog.getByLabel('资料正文').locator('[data-yuance-attachment-id="971"]')).toHaveCount(1);
  await dialog.getByRole('button', { name: '保存' }).click();
  await expect(dialog).not.toBeVisible();
  expect(operations).toEqual(['create', 'register', 'sign', 'put', 'confirm', 'patch']);
  expect(resource.body).toContain('data-yuance-attachment-id="971"');
  expect(resource.body).toContain('/web/projects/YCE/resources/970/attachments/971/download');
});

test('shared project resource attachments render inline and are managed from the editor', async ({ page }) => {
  const project = { key: 'YCE', name: '元策研发平台', description: '', status: 'in_progress', owner_username: 'yuance_admin', owner: '元策开发管理员', start_date: '', due_date: '', created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-07T00:00:00Z' };
  const members = [{ user_id: 1, display_name: '元策开发管理员', username: 'yuance_admin', member_role: 'owner', joined_at: '2026-08-01T00:00:00Z' }];
  const attachment = attachmentFixture({ id: 961, filename: 'resource-notes.md', content_type: 'text/markdown' });
  const inlineBody = '<p>正文</p><a data-yuance-attachment-id="961" data-yuance-attachment-kind="file" data-yuance-align="left" href="/web/projects/YCE/resources/960/attachments/961/download" title="resource-notes.md" data-yuance-file-kind="code" data-yuance-file-ext="MD" rel="noopener noreferrer">resource-notes.md</a>';
  let resource = projectResourceFixture({ id: 960, title: '附件资料', body: inlineBody, body_format: 'html', url: '/web/projects/YCE/resources/960' });
  const inlineOperations = [];
  let downloadRequests = 0;

  await page.route('**/api/v1/projects/YCE/resources/960/attachments/961/download-url**', async (route) => {
    downloadRequests += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { attachment, request: { method: 'GET', url: '/signed-download/resource-961?token=e2e', headers: [] }, expires_in_seconds: 600 } }) });
  });
  await page.route('**/api/v1/projects/YCE/resources/960/attachments/961/preview**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { attachment, preview: { kind: 'document', strategy: 'text', file_type: 'md', kind_label: '文本', is_experimental: false, legacy_preview_enabled: false, content_enabled: true }, navigation: { position: 1, total: 1, previous: null, next: null }, content_url: '/api/v1/projects/YCE/resources/960/attachments/961/preview/content', download_url: '/api/v1/projects/YCE/resources/960/attachments/961/download-url' } }) });
  });
  await page.route('**/api/v1/projects/YCE/resources/960/attachments/961/preview/content', (route) => route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', body: '# Markdown 预览\n\n- 保持原文展示' }));
  await page.route('**/api/v1/projects/YCE/resources/960/attachments/961', async (route) => {
    expect(route.request().method()).toBe('DELETE'); inlineOperations.push('delete');
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { ...attachment, status: 'deleted' } }) });
  });
  await page.route(/\/api\/v1\/projects\/YCE\/resources\/960\/attachments(?:\?.*)?$/u, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [attachment] }) }));
  await page.route('**/api/v1/projects/YCE/resources/960', async (route) => {
    if (route.request().method() === 'PATCH') {
      const payload = route.request().postDataJSON(); inlineOperations.push(['patch', payload.body]); resource = { ...resource, ...payload, body_format: payload.body_format };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: resource }) });
  });
  await page.route('**/api/v1/projects/YCE/resources', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [resource] }) }));
  await page.route('**/api/v1/projects/YCE/members', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: members }) }));
  await page.route('**/api/v1/projects/YCE', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: project }) }));

  await login(page, '/web/app/projects/YCE/resources/960');
  await page.evaluate(() => { window.__yuanceDownloadClicks = []; HTMLAnchorElement.prototype.click = function click() { window.__yuanceDownloadClicks.push(this.href); }; });
  await expect(page.getByRole('heading', { name: '资料附件' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '选择附件上传' })).toHaveCount(0);
  const inlineLink = page.getByRole('link', { name: 'resource-notes.md' });
  await expect(inlineLink).toBeVisible();
  await inlineLink.click();
  const previewDialog = page.getByRole('dialog', { name: 'resource-notes.md' });
  const textPreview = previewDialog.locator('iframe[title="resource-notes.md 文本预览"]').contentFrame();
  await expect(textPreview.locator('body')).toContainText('# Markdown 预览');
  await expect(textPreview.locator('body')).toContainText('- 保持原文展示');
  await previewDialog.getByRole('button', { name: '下载附件' }).click();
  await expect.poll(() => downloadRequests).toBe(1);
  await expect.poll(async () => page.evaluate(() => window.__yuanceDownloadClicks[0] || '')).toContain('/signed-download/resource-961?token=e2e');
  await previewDialog.getByRole('button', { name: '关闭媒体预览' }).click();
  await expect(previewDialog).toHaveCount(0);
  await page.getByRole('button', { name: '编辑' }).click();
  const resourceDialog = page.getByRole('dialog', { name: '编辑项目资料' });
  const resourceEditor = resourceDialog.getByRole('textbox', { name: '资料正文' });
  await resourceEditor.evaluate((editor) => {
    editor.querySelector('[data-yuance-attachment-id="961"]')?.remove();
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await resourceDialog.getByRole('button', { name: '保存' }).click();
  await expect(resourceDialog).not.toBeVisible();
  await expect.poll(() => inlineOperations.length).toBe(2);
  expect(inlineOperations.map((entry) => Array.isArray(entry) ? entry[0] : entry)).toEqual(['patch', 'delete']);
  expect(inlineOperations[0][1]).not.toContain('data-yuance-attachment-id="961"');
  await expect(page.getByRole('link', { name: 'resource-notes.md' })).toHaveCount(0);
});

test('shared project resources hide mutations from viewers', async ({ page }) => {
  const project = { key: 'YCE', name: '元策研发平台', description: '', status: 'in_progress', owner_username: 'yuance_admin', owner: '元策开发管理员', start_date: '', due_date: '', created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-07T00:00:00Z' };
  const resource = projectResourceFixture({ id: 940, title: '只读资料', url: '/web/projects/YCE/resources/940' });
  const attachment = attachmentFixture({ id: 941, filename: 'viewer-readable.txt', content_type: 'text/plain' });
  await login(page, '/web/app');
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { id: 2, username: 'resource_viewer', display_name: '资料只读成员', email: '', mobile: '', status: 'active', is_super_admin: false, roles: '', created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-07T00:00:00Z' } }) }));
  await page.route(/\/api\/v1\/projects\/YCE\/resources(?:\?.*)?$/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [resource] }) }));
  await page.route('**/api/v1/projects/YCE/resources/940', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: resource }) }));
  await page.route('**/api/v1/projects/YCE/resources/940/attachments', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [attachment] }) }));
  await page.route('**/api/v1/projects/YCE/members', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ user_id: 2, display_name: '资料只读成员', username: 'resource_viewer', member_role: 'viewer', joined_at: '2026-08-01T00:00:00Z' }] }) }));
  await page.route('**/api/v1/projects/YCE', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: project }) }));
  await page.goto('/web/app/projects/YCE/resources');
  await expect(page.getByRole('button', { name: '新建资料' })).toHaveCount(0);
  await page.getByRole('link', { name: '只读资料' }).click();
  await expect(page.getByRole('button', { name: '编辑' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '归档' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '重置保险箱密码' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '选择附件上传' })).toHaveCount(0);
  await expect(page.getByRole('list', { name: '资料附件列表' })).toHaveCount(0);
});

test('shared project resources expose content mutations to member role', async ({ page }) => {
  await routeEmptyProjectResourceAttachments(page);
  const project = { key: 'YCE', name: '元策研发平台', description: '', status: 'in_progress', owner_username: 'yuance_admin', owner: '元策开发管理员', start_date: '', due_date: '', created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-07T00:00:00Z' };
  let resource = projectResourceFixture({ id: 945, title: '成员待编辑资料', body: 'initial', tags: [], related_work_item: null });
  let resources = [resource];
  const mutations = [];
  await page.route(/\/api\/v1\/projects\/YCE\/resources(?:\?.*)?$/, async (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      const payload = request.postDataJSON();
      mutations.push(['create', payload]);
      resource = projectResourceFixture({ id: 946, title: payload.title, category: payload.category, body: payload.body, body_format: payload.body_format, summary: payload.body, tags: payload.tags, related_work_item: null, url: '/web/projects/YCE/resources/946' });
      resources = [resource];
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: resource }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: resources }) });
  });
  await page.route('**/api/v1/projects/YCE/resources/946', async (route) => {
    const request = route.request();
    if (request.method() === 'PATCH') {
      const payload = request.postDataJSON();
      mutations.push(['update', payload]);
      resource = { ...resource, title: payload.title, body: payload.body, body_format: payload.body_format, summary: payload.body, tags: payload.tags };
      resources = [resource];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: resource }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: resource }) });
  });
  await page.route('**/api/v1/projects/YCE/members', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ user_id: 2, display_name: '资料编辑成员', username: 'resource_editor', member_role: 'member', joined_at: '2026-08-01T00:00:00Z' }] }) }));
  await page.route('**/api/v1/projects/YCE', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: project }) }));
  await login(page, '/web/app');
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { id: 2, username: 'resource_editor', display_name: '资料编辑成员', email: '', mobile: '', status: 'active', is_super_admin: false, roles: '', created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-07T00:00:00Z' } }) }));
  await page.goto('/web/app/projects/YCE/resources');
  await expect(page.getByRole('button', { name: '新建资料' })).toBeVisible();
  await page.getByRole('button', { name: '新建资料' }).click();
  const createDialog = page.getByRole('dialog', { name: '新建项目资料' });
  await createDialog.getByLabel('资料标题').fill('成员新建资料');
  await createDialog.getByLabel('资料正文').evaluate((input) => {
    input.innerHTML = '<p>member body</p>';
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  });
  await createDialog.getByRole('button', { name: '保存' }).click();
  await expect(page.getByRole('list', { name: '项目资料列表' })).toContainText('成员新建资料');
  expect(mutations[0]).toEqual(['create', { title: '成员新建资料', category: 'other', body: '<p>member body</p>', body_format: 'html', access_password: '', tags: [], related_work_item_key: '', related_cycle_id: null }]);
  await page.getByRole('link', { name: '成员新建资料' }).click();
  await expect(page.getByRole('button', { name: '编辑资料' })).toBeVisible();
  await expect(page.getByRole('button', { name: '归档' })).toBeVisible();
  await page.getByRole('button', { name: '编辑资料' }).click();
  const editDialog = page.getByRole('dialog', { name: '编辑项目资料' });
  await editDialog.getByLabel('资料标题').fill('成员编辑资料');
  await editDialog.getByRole('button', { name: '保存' }).click();
  await expect(page.getByRole('heading', { level: 2, name: '成员编辑资料' })).toBeVisible();
  expect(mutations[1][1]).toMatchObject({ title: '成员编辑资料' });
});

test('shared project resource mutation ignores a late response after navigation', async ({ page }) => {
  await routeEmptyProjectResourceAttachments(page);
  const project = { key: 'YCE', name: '元策研发平台', description: '', status: 'in_progress', owner_username: 'yuance_admin', owner: '元策开发管理员', start_date: '', due_date: '', created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-07T00:00:00Z' };
  const members = [{ user_id: 1, display_name: '元策开发管理员', username: 'yuance_admin', member_role: 'owner', joined_at: '2026-08-01T00:00:00Z' }];
  const resource = projectResourceFixture({ id: 950, title: '慢更新资料', url: '/web/projects/YCE/resources/950' });
  let releaseUpdate;
  const updateStarted = new Promise((resolve) => { releaseUpdate = resolve; });
  await page.route(/\/api\/v1\/projects\/YCE\/resources(?:\?.*)?$/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [resource] }) }));
  await page.route('**/api/v1/projects/YCE/resources/950', async (route) => {
    if (route.request().method() === 'PATCH') {
      releaseUpdate();
      await new Promise((resolve) => { releaseUpdate = resolve; });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { ...resource, title: '不应污染新路由' } }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: resource }) });
  });
  await page.route('**/api/v1/projects/YCE/members', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: members }) }));
  await page.route('**/api/v1/projects/YCE', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: project }) }));
  await login(page, '/web/app/projects/YCE/resources/950');
  await page.getByRole('button', { name: '编辑' }).click();
  const dialog = page.getByRole('dialog', { name: '编辑项目资料' });
  await dialog.getByLabel('资料标题').fill('迟到更新');
  await dialog.getByRole('button', { name: '保存' }).click();
  await updateStarted;
  await page.evaluate(() => {
    history.pushState({}, '', '/web/app/projects/YCE/resources');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page).toHaveURL(/\/web\/app\/projects\/YCE\/resources$/);
  await expect(page.getByRole('heading', { level: 3, name: '项目资料库' })).toBeVisible();
  await expect(page.getByRole('button', { name: '新建资料' })).toBeDisabled();
  releaseUpdate();
  await expect(page.getByRole('button', { name: '新建资料' })).toBeEnabled();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText('不应污染新路由')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('project detail tabs slide without replacing the page surface', async ({ page }) => {
  await login(page, '/web/app/projects/YCE?tab=info');

  const tabsCard = page.locator('.project-tabs-card');
  const tabs = tabsCard.locator('.yc-content-tabs');
  const indicator = tabs.locator('.yc-content-tabs-indicator');
  await expect(tabs.locator('.yc-content-tab')).toHaveText(['详情', '周期', '时间', '成员']);
  await expect(tabs.getByRole('link', { name: '项目文件' })).toHaveCount(0);
  const initialGeometry = await page.locator('.project-detail-page').evaluate((element) => {
    const main = element.closest('.main');
    const button = element.querySelector('.detail-hero .yc-button');
    const buttonStyle = getComputedStyle(button);
    return {
      mainWidth: main.clientWidth,
      scrollbarReservation: main.offsetWidth - main.clientWidth,
      webkitScrollbarWidth: getComputedStyle(main, '::-webkit-scrollbar').width,
      buttonHeight: buttonStyle.height,
      buttonRadius: buttonStyle.borderRadius,
      buttonFontSize: buttonStyle.fontSize,
    };
  });
  expect(initialGeometry).toMatchObject({ scrollbarReservation: 0, webkitScrollbarWidth: '0px', buttonHeight: '32px', buttonRadius: '8px', buttonFontSize: '13px' });
  await tabsCard.evaluate((element) => { element.dataset.tabTransitionMarker = 'preserved'; });
  const initialX = await indicator.evaluate((element) => element.getBoundingClientRect().x);

  await tabs.getByRole('link', { name: '时间' }).click();
  await expect(page).toHaveURL(/tab=time/);
  await expect(tabsCard).toHaveAttribute('data-tab-transition-marker', 'preserved');
  await expect(tabs.getByRole('link', { name: '时间' })).toHaveAttribute('aria-current', 'page');
  await expect.poll(() => indicator.evaluate((element) => getComputedStyle(element).transitionDuration)).not.toBe('0s');
  await expect.poll(() => indicator.evaluate((element) => element.getBoundingClientRect().x)).toBeGreaterThan(initialX);
  await expect(page.getByRole('heading', { level: 3, name: '项目时间排期' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 3, name: '项目资料库' })).toHaveCount(0);
  await expect.poll(() => page.locator('.main').evaluate((element) => element.clientWidth)).toBe(initialGeometry.mainWidth);
});

test('global navigation indicator slides between application sections', async ({ page }) => {
  await login(page, '/web/app');

  const navigation = page.getByRole('navigation', { name: '应用导航' });
  const indicator = navigation.locator('.global-nav-links-indicator');
  const initialX = await indicator.evaluate((element) => element.getBoundingClientRect().x);
  const navLabels = await navigation.locator('.global-nav-link').allTextContents();
  await expect(navigation.getByRole('link', { name: '资料库', exact: true })).toBeVisible();
  expect(navLabels.indexOf('时间管理')).toBeGreaterThanOrEqual(0);
  expect(navLabels.indexOf('资料库')).toBeGreaterThan(navLabels.indexOf('时间管理'));

  await navigation.getByRole('link', { name: '项目', exact: true }).click();
  await expect(page).toHaveURL(/\/web\/app\/projects/u);
  await expect(navigation.getByRole('link', { name: '项目', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect.poll(() => indicator.evaluate((element) => getComputedStyle(element).transitionDuration)).not.toBe('0s');
  await expect.poll(() => indicator.evaluate((element) => element.getBoundingClientRect().x)).toBeGreaterThan(initialX);
});

test('time management page stays independent from the project resource library', async ({ page }) => {
  const project = { key: 'YCE', name: '元策研发平台', description: '', status: 'in_progress', owner_username: 'yuance_admin', owner: '元策开发管理员', start_date: '', due_date: '', created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-07T00:00:00Z' };
  const resource = projectResourceFixture({ id: 980, title: '全局时间管理资料', url: '/web/projects/YCE/resources/980' });
  await page.route('**/api/v1/topbar/status', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: {
    requirements_count: 0, tasks_count: 0, bugs_count: 0, notifications_count: 0,
    project_badges: [{ project_key: 'YCE', pending_count: 0 }],
    project_options: [{ key: 'YCE', name: '元策研发平台', pending_count: 0 }],
    system_links: [],
    current_project: { key: 'YCE', name: '元策研发平台', pending_count: 0 },
  } }) }));
  await page.route('**/api/v1/time-management/overview', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) }));
  await page.route('**/api/v1/time-management/members', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) }));
  await page.route(/\/api\/v1\/projects\?per_page=100$/u, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { items: [{ key: 'YCE', name: '元策研发平台' }], pagination: { page: 1, per_page: 100, total_items: 1, total_pages: 1 } } }) }));
  await page.route(/\/api\/v1\/projects\/YCE\/resources(?:\?.*)?$/u, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [resource] }) }));
  await page.route('**/api/v1/projects/YCE/members', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ user_id: 1, display_name: '元策开发管理员', username: 'yuance_admin', member_role: 'owner', joined_at: '2026-08-01T00:00:00Z' }] }) }));
  await page.route('**/api/v1/projects/YCE', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: project }) }));
  await login(page, '/web/app');
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { id: 1, username: 'yuance_admin', display_name: '元策开发管理员', email: '', mobile: '', status: 'active', is_super_admin: true, roles: '', created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-07T00:00:00Z' } }) }));
  await page.goto('/web/app/time-management');
  await expect(page.locator('.time-management')).toBeVisible();
  await expect(page.getByRole('heading', { level: 3, name: '项目资料库' })).toHaveCount(0);
  const resourceLibraryLink = page.getByRole('navigation', { name: '应用导航' }).getByRole('link', { name: '资料库', exact: true });
  await expect(resourceLibraryLink).toHaveAttribute('href', /\/web\/app\/projects\/YCE\/resources$/);
  await resourceLibraryLink.click();
  await expect(page).toHaveURL(/\/web\/app\/projects\/YCE\/resources$/);
  await expect(page.getByRole('heading', { level: 3, name: '项目资料库' })).toBeVisible();
  await expect(page.getByRole('link', { name: '全局时间管理资料' })).toBeVisible();
  await expect(page.getByRole('link', { name: '返回项目' })).toHaveCount(0);
  await expect.poll(() => page.locator('.project-resource-library-page').evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(1200);
});

test('shared project personal analysis preserves metrics, filters and completion semantics', async ({ page }) => {
  const project = { key: 'YCE', name: '元策研发平台', description: '', status: 'in_progress', owner_username: 'yuance_admin', owner: '元策开发管理员', start_date: '', due_date: '', created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-07T00:00:00Z' };
  let recentCompletions = [{ key: 'YCE-TASK-2', item_type: 'task', title: '完成共享体验', completed_at: '2026-08-07T08:00:00Z' }];
  const currentProjectMutations = [];
  let projectSwitchCompleted = false;
  let analysisReadBeforeProjectSwitch = false;
  await page.route('**/api/v1/current-project', async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    currentProjectMutations.push(route.request().postDataJSON());
    await new Promise((resolve) => setTimeout(resolve, 50));
    projectSwitchCompleted = true;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { key: 'YCE', name: '元策研发平台', pending_count: 0 } }) });
  });
  await page.route('**/api/v1/projects/YCE/my-analysis', (route) => {
    analysisReadBeforeProjectSwitch ||= !projectSwitchCompleted;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: {
    username: 'yuance_admin', display_name: '元策开发管理员', joined_at: '2026-08-01T00:00:00Z',
    completed_total: 12, completed_requirements: 3, completed_tasks: 7, completed_bugs: 2, completed_last_30_days: 5,
    pending: { requirements: 0, tasks: 3, bugs: 1 }, daily_average: 0.5, daily_peak: 3, daily_peak_date: '2026-08-06',
    monthly_average: 6, monthly_peak: 12, monthly_peak_month: '2026-08', active_days: 8, comment_count: 21, handoff_count: 4,
    recent_completions: recentCompletions,
    } }) });
  });
  await page.route('**/api/v1/projects/YCE', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: project }) }));

  await login(page, '/web/app/projects/YCE/my-analysis');
  await expect(page).toHaveTitle('我的项目分析 - 元策研发平台 - 元策');
  await expect(page.getByRole('heading', { level: 1, name: '元策研发平台' })).toBeVisible();
  await expect(page.getByText('仅统计 元策开发管理员 在该项目中的实际处理与协作记录。')).toBeVisible();
  await expect(page.getByLabel('个人处理产出')).toContainText('累计处理12');
  await expect(page.getByLabel('个人处理产出')).toContainText('当前待处理4');
  await expect(page.getByText('日平均处理').locator('../..')).toContainText('0.50');
  await expect(page.getByText('月平均处理').locator('../..')).toContainText('6.00');
  await expect(page.getByRole('heading', { level: 2, name: '沟通与推进' }).locator('../../..')).toContainText('活跃天数8');
  const pending = page.getByRole('heading', { level: 2, name: '我的待处理' }).locator('../../..');
  await expect(pending.getByRole('link', { name: '需求 0' })).toHaveAttribute('href', '/web/app/requirements?status=pending&assignee_username=yuance_admin&project_key=YCE');
  await expect(pending.getByRole('link', { name: '任务 3' })).toHaveAttribute('href', '/web/app/tasks?status=pending&assignee_username=yuance_admin&project_key=YCE');
  await expect(pending.getByRole('link', { name: 'Bug 1' })).toHaveAttribute('href', '/web/app/bugs?status=pending&assignee_username=yuance_admin&project_key=YCE');
  await expect(page.getByRole('link', { name: /YCE-TASK-2.*完成共享体验/ })).toHaveAttribute('href', '/web/app/work-items/YCE-TASK-2');
  await expect(page.getByText('处理量按你实际执行的终态流转事件统计')).toBeVisible();
  expect(currentProjectMutations).toEqual([{ project_key: 'YCE' }]);
  expect(analysisReadBeforeProjectSwitch).toBe(false);

  await page.goto('/web/projects/YCE/my-analysis');
  await expect(page).toHaveURL(/\/web\/projects\/YCE\/my-analysis$/);
  await expect(page.getByRole('heading', { level: 1, name: '元策研发平台' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: '我的待处理' }).locator('../../..').getByRole('link', { name: '任务 3' })).toHaveAttribute('href', '/web/tasks?status=pending&assignee_username=yuance_admin&project_key=YCE');
  await expect(page.getByRole('link', { name: /YCE-TASK-2.*完成共享体验/ })).toHaveAttribute('href', '/web/work-items/YCE-TASK-2');

  recentCompletions = [];
  await page.reload();
  await expect(page.getByText('暂无完成记录')).toBeVisible();
  await expect(page.getByText('工作项由你推进到完成、解决、验证或关闭后会记录在这里。')).toBeVisible();
});

test('shared shell reports API failures through a bounded global toast', async ({ page }) => {
  await page.route('**/api/v1/projects/YCE/my-analysis', (route) => route.fulfill({
    status: 500,
    contentType: 'application/json',
    body: JSON.stringify({ error: { code: 'database_error', message: 'internal database decoder detail' } }),
  }));

  await login(page, '/web/app/projects/YCE/my-analysis');

  const toast = page.locator('.yc-error-toast');
  await expect(toast).toBeVisible();
  await expect(toast).toContainText('操作未完成');
  await expect(toast).toContainText('服务暂时无法完成请求，请稍后重试。');
  await expect(page.getByRole('main')).not.toContainText('internal database decoder detail');
  await toast.getByRole('button', { name: '关闭提示' }).click();
  await expect(toast).toBeHidden();
});

test('project personal analysis serializes current project changes across rapid navigation', async ({ page }) => {
  let releaseFirstSwitch = () => {};
  let markFirstSwitchStarted = () => {};
  const firstSwitchStarted = new Promise((resolve) => { markFirstSwitchStarted = resolve; });
  const firstSwitchGate = new Promise((resolve) => { releaseFirstSwitch = resolve; });
  const order = [];
  await page.route('**/api/v1/current-project', async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    const projectKey = route.request().postDataJSON().project_key;
    order.push(`start:${projectKey}`);
    if (projectKey === 'YCE') { markFirstSwitchStarted(); await firstSwitchGate; }
    order.push(`finish:${projectKey}`);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { key: projectKey, name: `${projectKey} 项目`, pending_count: 0 } }) });
  });
  await page.route(/\/api\/v1\/projects\/(YCE|OPS)\/my-analysis$/u, (route) => {
    const projectKey = route.request().url().includes('/OPS/') ? 'OPS' : 'YCE';
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { username: 'yuance_admin', display_name: '元策开发管理员', joined_at: '2026-08-01T00:00:00Z', completed_total: 0, completed_requirements: 0, completed_tasks: 0, completed_bugs: 0, completed_last_30_days: 0, pending: { requirements: 0, tasks: 0, bugs: 0 }, daily_average: 0, daily_peak: 0, daily_peak_date: '', monthly_average: 0, monthly_peak: 0, monthly_peak_month: '', active_days: 0, comment_count: 0, handoff_count: 0, recent_completions: [], project_key: projectKey } }) });
  });
  await page.route(/\/api\/v1\/projects\/(YCE|OPS)$/u, (route) => {
    const projectKey = route.request().url().endsWith('/OPS') ? 'OPS' : 'YCE';
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { key: projectKey, name: `${projectKey} 项目`, description: '', status: 'in_progress', owner_username: 'yuance_admin', owner: '元策开发管理员', start_date: '', due_date: '', created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-07T00:00:00Z' } }) });
  });

  await login(page, '/web/app');
  await page.evaluate(() => { history.pushState({}, '', '/web/app/projects/YCE/my-analysis'); dispatchEvent(new PopStateEvent('popstate')); });
  await firstSwitchStarted;
  await page.evaluate(() => { history.pushState({}, '', '/web/app/projects/OPS/my-analysis'); dispatchEvent(new PopStateEvent('popstate')); });
  await expect.poll(() => order).toEqual(['start:YCE']);
  releaseFirstSwitch();
  await expect(page.getByRole('heading', { level: 1, name: 'OPS 项目' })).toBeVisible();
  await expect.poll(() => order).toEqual(['start:YCE', 'finish:YCE', 'start:OPS', 'finish:OPS']);
});

test('project personal analysis preserves the main responsive geometry', async ({ page }) => {
  await login(page, '/web/app/projects/YCE/my-analysis');
  for (const viewport of [
    { width: 390, height: 844, columns: 1 },
    { width: 768, height: 1024, columns: 1 },
    { width: 1280, height: 800, columns: 2 },
    { width: 1440, height: 900, columns: 2 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/web/app/projects/YCE/my-analysis');
    await expect(page.locator('.personal-analysis-page h1')).toHaveText(/\S/u);
    const geometry = await page.locator('.personal-analysis-page').evaluate((element) => {
      const main = element.closest('.main');
      return {
        mainWidth: main.clientWidth,
        mainScrollWidth: main.scrollWidth,
        outputColumns: getComputedStyle(element.querySelector('.personal-analysis-output')).gridTemplateColumns.split(' ').length,
        efficiencyColumns: getComputedStyle(element.querySelector('.compact-metrics')).gridTemplateColumns.split(' ').length,
        analysisColumns: getComputedStyle(element.querySelector('.analysis-columns')).gridTemplateColumns.split(' ').length,
      };
    });
    expect(geometry.mainScrollWidth).toBeLessThanOrEqual(geometry.mainWidth);
    expect(geometry.outputColumns).toBe(viewport.width <= 960 ? 1 : 4);
    expect(geometry.efficiencyColumns).toBe(viewport.width <= 960 ? 1 : 4);
    expect(geometry.analysisColumns).toBe(viewport.columns);
  }
});

test('shared project cycle creates updates closes and opens the status board', async ({ page }) => {
  const project = { key: 'YCE', name: '元策研发平台', description: '', status: 'in_progress', owner_username: 'yuance_admin', owner: '元策开发管理员', start_date: '', due_date: '', created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-07T00:00:00Z' };
  const members = [{ user_id: 1, display_name: '元策开发管理员', username: 'yuance_admin', member_role: 'owner', joined_at: '2026-08-01T00:00:00Z' }];
  let cycles = [];
  const cyclePayload = () => ({ id: 7, name: '迭代一', goal: '交付周期', description: '共享周期', owner_username: 'yuance_admin', owner: '元策开发管理员', start_date: '2026-08-01', end_date: '2026-08-31', closed_at: '', is_closed: false, total_items: 1, requirement_count: 0, task_count: 1, bug_count: 0, pending_count: 1, created_at: '2026-08-08T00:00:00Z', updated_at: '2026-08-08T00:00:00Z', work_items: [{ key: 'YCE-TASK-2', item_type: 'task', title: '周期任务', status: 'in_progress', priority: 'P1', assignee_username: 'yuance_admin', assignee: '元策开发管理员', due_date: '2026-08-20', updated_at: '2026-08-08T00:00:00Z' }] });
  await page.route('**/api/v1/projects/YCE', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: project }) }));
  await page.route('**/api/v1/projects/YCE/members', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: members }) }));
  await page.route('**/api/v1/projects/YCE/cycles', async (route) => {
    if (route.request().method() === 'POST') { cycles = [{ ...cyclePayload(), work_items: [] }]; await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: cycles[0] }) }); return; }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: cycles }) });
  });
  await page.route('**/api/v1/projects/YCE/cycles/7', async (route) => {
    if (route.request().method() === 'PATCH') { const body = route.request().postDataJSON(); cycles = [{ ...cycles[0], ...body, owner: '元策开发管理员' }]; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: cycles[0] }) }); return; }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { ...cyclePayload(), ...cycles[0], work_items: cyclePayload().work_items } }) });
  });
  await page.route('**/api/v1/projects/YCE/cycles/7/close', async (route) => { cycles = [{ ...cycles[0], is_closed: true, closed_at: '2026-08-08T12:00:00Z' }]; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: cycles[0] }) }); });

  await login(page, '/web/app/projects/YCE?tab=cycles');
  await page.getByRole('button', { name: '新建周期' }).click();
  const createDialog = page.getByRole('dialog', { name: '新建项目周期' });
  await createDialog.getByLabel('周期名称').fill('迭代一'); await createDialog.getByLabel('周期目标').fill('交付周期'); await createDialog.getByLabel('负责人用户名').fill('yuance_admin'); await createDialog.getByLabel('开始日期').fill('2026-08-01'); await createDialog.getByLabel('结束日期').fill('2026-08-31'); await createDialog.getByLabel('周期说明').fill('共享周期'); await createDialog.getByRole('button', { name: '保存' }).click();
  const cycleRow = page.getByRole('row', { name: /迭代一/ }); await expect(cycleRow).toBeVisible();
  await cycleRow.getByRole('button', { name: '编辑' }).click(); const editDialog = page.getByRole('dialog', { name: '编辑项目周期' }); await editDialog.getByLabel('周期名称').fill('迭代一更新'); await editDialog.getByRole('button', { name: '保存' }).click(); await expect(page.getByRole('row', { name: /迭代一更新/ })).toBeVisible();
  await page.getByRole('link', { name: '迭代一更新' }).click(); await expect(page.getByRole('heading', { level: 2, name: '当前节奏' })).toBeVisible(); await expect(page.getByRole('progressbar', { name: '周期时间进度' })).toBeVisible(); await expect(page.getByRole('heading', { level: 2, name: '工作项状态看板' })).toBeVisible(); await expect(page.getByText('YCE-TASK-2 · 周期任务')).toBeVisible(); await expect(page.getByRole('table', { name: '周期成员负载' })).toContainText('元策开发管理员');
  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    const geometry = await page.locator('.cycle-detail-page').evaluate((element) => { const main = element.closest('.main'); return { mainWidth: main.clientWidth, mainScrollWidth: main.scrollWidth, metrics: getComputedStyle(element.querySelector('.cycle-detail-metrics')).gridTemplateColumns.split(' ').length, overview: getComputedStyle(element.querySelector('.cycle-detail-overview')).gridTemplateColumns.split(' ').length, board: getComputedStyle(element.querySelector('.cycle-board-grid')).gridTemplateColumns.split(' ').length }; });
    expect(geometry.mainScrollWidth).toBeLessThanOrEqual(geometry.mainWidth);
    expect(geometry.metrics).toBe(viewport.width <= 960 ? 1 : 4);
    expect(geometry.overview).toBe(viewport.width <= 1280 ? 1 : 2);
    expect(geometry.board).toBe(viewport.width <= 1100 ? 1 : 2);
  }
  await page.getByRole('link', { name: 'YCE-TASK-2 · 周期任务' }).click(); await expect(page).toHaveURL(/\/web\/app\/work-items\/YCE-TASK-2$/); await page.goBack(); await expect(page.getByRole('heading', { level: 1, name: '迭代一更新' })).toBeVisible();
  await page.getByRole('link', { name: '返回项目周期' }).click(); const updatedRow = page.getByRole('row', { name: /迭代一更新/ }); await updatedRow.getByRole('button', { name: '关闭' }).click(); await page.getByRole('dialog', { name: '关闭项目周期' }).getByRole('button', { name: '确认关闭' }).click(); await expect(page.getByRole('row', { name: /迭代一更新/ })).toContainText('已关闭'); await expect(updatedRow.getByRole('button', { name: '编辑' })).toHaveCount(0); await expect(updatedRow.getByRole('button', { name: '关闭' })).toHaveCount(0);
});

test('shared project cycles keep viewer access read only', async ({ page }) => {
  const project = { key: 'YCE', name: '元策研发平台', description: '', status: 'in_progress', owner_username: 'yuance_admin', owner: '元策开发管理员', start_date: '', due_date: '', created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-07T00:00:00Z' };
  const cycle = { id: 7, name: '只读周期', goal: '', description: '', owner_username: 'yuance_admin', owner: '元策开发管理员', start_date: '2026-08-01', end_date: '2026-08-31', closed_at: '', is_closed: false, total_items: 0, requirement_count: 0, task_count: 0, bug_count: 0, pending_count: 0, created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-07T00:00:00Z', work_items: [] };
  await login(page, '/web/app');
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { id: 2, username: 'cycle_viewer', display_name: '周期只读成员', email: '', mobile: '', status: 'active', is_super_admin: false, roles: '', created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-07T00:00:00Z' } }) }));
  await page.route('**/api/v1/projects/YCE', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: project }) }));
  await page.route('**/api/v1/projects/YCE/members', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ user_id: 2, display_name: '周期只读成员', username: 'cycle_viewer', member_role: 'viewer', joined_at: '2026-08-01T00:00:00Z' }] }) }));
  await page.route('**/api/v1/projects/YCE/cycles', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [cycle] }) }));
  await page.goto('/web/app/projects/YCE?tab=cycles');
  await expect(page.getByRole('heading', { level: 3, name: '项目周期' })).toBeVisible();
  await expect(page.getByRole('button', { name: '新建周期' })).toHaveCount(0);
  const row = page.getByRole('row', { name: /只读周期/ });
  await expect(row).toContainText('只读');
  await expect(row.getByRole('button')).toHaveCount(0);
});

test('project switch serializes repeated input and refreshes the current context', async ({ page }) => {
  await login(page, '/web/app/projects');
  await ensureCurrentProject(page, 'YCE');
  let patchCount = 0;
  let switched = false;
  let releaseSwitch = () => {};
  const switchRelease = new Promise((resolve) => { releaseSwitch = resolve; });

  await page.route('**/api/v1/current-project', async (route) => {
    if (route.request().method() !== 'PATCH') {
      await route.continue();
      return;
    }
    patchCount += 1;
    await switchRelease;
    switched = true;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { key: 'OPS', name: '交付运维台' } }) });
  });
  await page.route('**/api/v1/topbar/status', async (route) => {
    if (!switched) {
      await route.continue();
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: {
      requirements_count: 0, tasks_count: 0, bugs_count: 0, notifications_count: 0,
      project_badges: [{ project_key: 'OPS', pending_count: 0 }],
      current_project: { key: 'OPS', name: '交付运维台', pending_count: 0 },
    } }) });
  });

  const opsRow = page.locator('.project-row', { hasText: 'OPS' });
  const switchButton = opsRow.getByRole('button', { name: '设为当前项目' });
  await switchButton.click();
  await expect.poll(() => patchCount).toBe(1);
  await expect(opsRow.getByRole('button', { name: '切换中…' })).toBeDisabled();
  await expect(page.locator('.project-row button:enabled', { hasText: '设为当前项目' })).toHaveCount(0);

  releaseSwitch();
  await expect(opsRow.getByRole('button', { name: '当前项目' })).toBeVisible();
  await expect(page.getByRole('button', { name: '切换当前项目' })).toContainText('交付运维台');
  await expect(page.getByRole('link', { name: '需求' })).toHaveAttribute('href', /project_key=OPS/);
  await expect(page.getByRole('link', { name: '任务' })).toHaveAttribute('href', /project_key=OPS/);
  await expect(page.getByRole('link', { name: 'Bug' })).toHaveAttribute('href', /project_key=OPS/);
  expect(patchCount).toBe(1);
});

test('global project switch navigates the current work item list to the selected project', async ({ page }) => {
  await login(page, '/web/app/tasks?project_key=YCE');
  await expect(page.getByRole('heading', { level: 2, name: '任务列表' })).toBeVisible();
  let switched = false;

  await page.route('**/api/v1/current-project', async (route) => {
    if (route.request().method() !== 'PATCH') {
      await route.continue();
      return;
    }
    switched = true;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { key: 'OPS', name: '交付运维台' } }) });
  });
  await page.route('**/api/v1/topbar/status', async (route) => {
    if (!switched) {
      await route.continue();
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: {
      requirements_count: 0, tasks_count: 0, bugs_count: 0, notifications_count: 0,
      project_badges: [{ project_key: 'OPS', pending_count: 0 }],
      project_options: [{ key: 'OPS', name: '交付运维台', pending_count: 0 }],
      current_project: { key: 'OPS', name: '交付运维台', pending_count: 0 },
    } }) });
  });

  await page.getByRole('button', { name: '切换当前项目' }).click();
  await page.locator('.global-nav-project-menu').getByPlaceholder('搜索项目名称').fill('交付');
  await page.locator('.global-nav-project-menu').getByRole('button', { name: /交付运维台/ }).click();
  await expect(page).toHaveURL(/\/web\/app\/tasks\?project_key=OPS/);
  await expect(page.getByRole('link', { name: '需求' })).toHaveAttribute('href', /project_key=OPS/);
  await expect(page.getByRole('link', { name: '任务' })).toHaveAttribute('href', /project_key=OPS/);
  await expect(page.getByRole('link', { name: 'Bug' })).toHaveAttribute('href', /project_key=OPS/);
});

test('global project switch keeps the current project detail tab on the selected project', async ({ page }) => {
  await login(page, '/web/app/projects/YCE?tab=time');
  await expect(page.getByRole('heading', { level: 3, name: '项目时间排期' })).toBeVisible();
  let switched = false;

  await page.route('**/api/v1/current-project', async (route) => {
    if (route.request().method() !== 'PATCH') {
      await route.continue();
      return;
    }
    switched = true;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { key: 'OPS', name: '交付运维台' } }) });
  });
  await page.route('**/api/v1/topbar/status', async (route) => {
    if (!switched) {
      await route.continue();
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: {
      requirements_count: 0, tasks_count: 0, bugs_count: 0, notifications_count: 0,
      project_badges: [{ project_key: 'OPS', pending_count: 0 }],
      project_options: [{ key: 'OPS', name: '交付运维台', pending_count: 0 }],
      current_project: { key: 'OPS', name: '交付运维台', pending_count: 0 },
    } }) });
  });

  await page.getByRole('button', { name: '切换当前项目' }).click();
  await page.locator('.global-nav-project-menu').getByPlaceholder('搜索项目名称').fill('交付');
  await page.locator('.global-nav-project-menu').getByRole('button', { name: /交付运维台/ }).click();
  await expect(page).toHaveURL(/\/web\/app\/projects\/OPS\?tab=time/);
  await expect(page.getByRole('heading', { level: 3, name: '项目时间排期' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 3, name: '项目资料库' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '需求' })).toHaveAttribute('href', /project_key=OPS/);
  await expect(page.getByRole('link', { name: '任务' })).toHaveAttribute('href', /project_key=OPS/);
  await expect(page.getByRole('link', { name: 'Bug' })).toHaveAttribute('href', /project_key=OPS/);
});

test('shared global shell remains usable at canonical responsive widths', async ({ page }, testInfo) => {
  await login(page, '/web/app');

  await page.getByRole('button', { name: '切换当前项目' }).click();
  const projectMenu = page.locator('.global-nav-project-menu');
  await projectMenu.getByPlaceholder('搜索项目名称').fill('交付');
  await expect(projectMenu.getByRole('button', { name: /交付运维台/ })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: '系统管理', exact: true }).click();
  await expect(page.locator('.global-nav-system-menu').getByRole('link', { name: '用户管理' })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: '打开消息通知' }).click();
  await expect(page.getByRole('dialog', { name: '最近消息' })).toBeVisible();
  await expect(page.getByRole('button', { name: '一键已读' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.shell-header')).toHaveCount(0);
  await expect(page.getByLabel('顶部状态摘要')).toHaveCount(0);
  await expect(page.locator('.metric-grid > .metric')).toHaveCount(4);
  await expect(page.locator('.compact-table')).toBeVisible();
  await expect(page.locator('.workspace-side')).toContainText('待我处理讨论');
  await expect(page.locator('.workspace-side')).toContainText('最近动态');

  for (const width of [390, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator('.global-nav')).toBeVisible();
    await expect(page.getByRole('navigation', { name: '应用导航' })).toBeVisible();
    await expect(page.getByRole('search')).toBeVisible();
    await expect(page.getByRole('button', { name: '切换当前项目' })).toBeVisible();
    await expect(page.locator('.global-nav-mark')).toBeVisible();
    await expect(page.getByRole('button', { name: /打开 .* 的账户菜单/ })).toBeVisible();
    const geometry = await page.evaluate(() => {
      const nav = document.querySelector('.global-nav')?.getBoundingClientRect();
      const brand = document.querySelector('.global-nav-brand')?.getBoundingClientRect();
      const links = document.querySelector('.global-nav-links')?.getBoundingClientRect();
      const tools = document.querySelector('.global-nav-tools')?.getBoundingClientRect();
      const search = document.querySelector('.global-nav-search')?.getBoundingClientRect();
      const project = document.querySelector('.global-nav-project')?.getBoundingClientRect();
      const workspaceColumns = getComputedStyle(document.querySelector('.workspace-grid')).gridTemplateColumns;
      const metricColumns = getComputedStyle(document.querySelector('.metric-grid')).gridTemplateColumns;
      const toolRects = [...document.querySelectorAll('.global-nav-tools > *')].map((element) => element.getBoundingClientRect()).filter((rect) => rect.width > 0);
      return {
        navHeight: nav?.height || 0, navWidth: nav?.width || 0, searchWidth: search?.width || 0, projectWidth: project?.width || 0,
        brandRight: brand?.right || 0, linksLeft: links?.left || 0, linksRight: links?.right || 0, toolsLeft: tools?.left || 0,
        workspaceColumns, metricColumns,
        toolRects: toolRects.map((rect) => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom })),
      };
    });
    if (width <= 768) {
      expect(geometry.searchWidth).toBeGreaterThanOrEqual(geometry.navWidth - 24);
      expect(geometry.projectWidth).toBeGreaterThanOrEqual(geometry.navWidth - 24);
    } else {
      expect(geometry.navHeight).toBe(58);
      expect(geometry.brandRight).toBeLessThanOrEqual(geometry.linksLeft);
      expect(geometry.linksRight).toBeLessThanOrEqual(geometry.toolsLeft);
      for (let index = 1; index < geometry.toolRects.length; index += 1) {
        expect(geometry.toolRects[index - 1].right).toBeLessThanOrEqual(geometry.toolRects[index].left);
      }
    }
    expect(geometry.workspaceColumns.trim().split(/\s+/u)).toHaveLength(width <= 1280 ? 1 : 2);
    expect(geometry.metricColumns.trim().split(/\s+/u)).toHaveLength(width <= 960 ? 1 : 4);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`global-shell-${width}.png`), fullPage: true });
  }

  await page.setViewportSize({ width: 390, height: 900 });
  await page.getByRole('button', { name: /打开 .* 的账户菜单/ }).click();
  await page.getByRole('button', { name: '深色模式' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: testInfo.outputPath('global-shell-390-dark.png'), fullPage: true });
});
