import { expect, test } from '@playwright/test';

async function chooseFile(page, button, file) {
  const chooser = page.waitForEvent('filechooser');
  await button.click();
  await (await chooser).setFiles(file);
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
  await expect(page.getByRole('heading', { level: 1, name: '项目列表' })).toBeVisible();
  const row = page.locator('.project-row', { hasText: projectKey });
  const currentButton = row.getByRole('button', { name: '当前项目' });
  if (await currentButton.count()) {
    return;
  }
  await row.getByRole('button', { name: '设为当前项目' }).click();
  await expect(row.getByRole('button', { name: '当前项目' })).toBeVisible();
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

test('browser shell restores login return_to for direct /web/app/messages entry', async ({ page }) => {
  await login(page, '/web/app/messages?filter=unread');

  await expect(page).toHaveURL(/\/web\/app\/messages\?filter=unread/);
  await expect(page).toHaveTitle('消息中心 - 元策');
  await expect(page.getByRole('heading', { level: 1, name: '消息中心' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: '消息中心' })).toBeFocused();
  await expect(page.getByRole('button', { name: '打开', exact: true })).toBeVisible();
});

test('browser shell preserves the shared deep link when the session expires', async ({ page }) => {
  await login(page, '/web/app');
  await page.route('**/api/v1/auth/me', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'unauthorized', message: '登录已失效。' } }),
    });
  });

  await page.goto('/web/app/search?q=YCE-TASK-2');

  await expect(page).toHaveURL(/\/web\/login\?return_to=%2Fweb%2Fapp%2Fsearch%3Fq%3DYCE-TASK-2/);
  await expect(page.getByRole('heading', { name: '登录' })).toBeVisible();
});

test('browser shell supports root navigation and logout on /web owner route', async ({ page }) => {
  await login(page, '/web');

  await expect(page).toHaveURL(/\/web$/);
  await expect(page).toHaveTitle('元策浏览器工作台 - 元策');
  await expect(page.getByRole('heading', { level: 1, name: '元策浏览器工作台' })).toBeVisible();

  await page.getByRole('navigation', { name: '应用导航' }).getByRole('link', { name: /消息中心/ }).click();
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
  await expect(page.getByRole('heading', { level: 1, name: '全局搜索' })).toBeVisible();
  const result = page.getByRole('list', { name: '搜索结果列表' }).locator('li', { hasText: 'YCE-TASK-2' });
  await expect(result).toContainText('设计项目与工作项数据模型');
  await result.getByRole('link', { name: '打开' }).click();

  await expect(page).toHaveURL(/\/web\/app\/work-items\/YCE-TASK-2$/);
  await expect(page.getByRole('heading', { level: 2, name: /YCE-TASK-2/ })).toBeVisible();
});

test('shared profile page updates account identity through the common modal', async ({ page }) => {
  await login(page, '/web/app');
  await page.getByRole('button', { name: /打开 .* 的账户菜单/ }).click();
  await page.getByRole('link', { name: '我的账号' }).click();

  await expect(page).toHaveURL(/\/web\/app\/me$/);
  await expect(page).toHaveTitle('个人中心 - 元策');
  await expect(page.getByRole('heading', { level: 1, name: '个人中心' })).toBeVisible();

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
  await expect(page.getByRole('heading', { level: 2, name: '统一体验管理员' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('个人资料已保存。');
  await expect(page.getByRole('button', { name: '打开 统一体验管理员 的账户菜单' })).toBeVisible();
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

  await page.getByRole('button', { name: '新建 Token' }).click();
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
  await expect(page.getByRole('heading', { level: 1, name: '任务列表' })).toBeVisible();
  await expect(page.locator('.work-item-row', { hasText: 'YCE-TASK-2' })).toBeVisible();

  await page.locator('.work-item-row', { hasText: 'YCE-TASK-2' }).getByRole('link', { name: '打开详情' }).click();
  await expect(page).toHaveURL(/\/web\/app\/work-items\/YCE-TASK-2/);
  await expect(page.getByRole('heading', { level: 2, name: 'YCE-TASK-2 · 设计项目与工作项数据模型' })).toBeVisible();
  await expect(page.getByRole('link', { name: '打开旧版详情' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 3, name: '评论与流转' })).toBeVisible();
});

test('work item detail can edit and handoff through app shell forms', async ({ page }) => {
  await login(page, '/web/app/work-items/YCE-TASK-2');
  await expect(page.getByRole('heading', { level: 2, name: 'YCE-TASK-2 · 设计项目与工作项数据模型' })).toBeVisible();

  const editRequests = [];
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

  const editForm = page.locator('.work-item-action-form', { hasText: '保存修改' });
  await editForm.getByLabel('标题').fill(editedDetail.title);
  await editForm.getByLabel('描述').fill(editedDetail.description);
  await editForm.getByLabel('状态').selectOption('in_progress');
  await editForm.getByLabel('优先级').selectOption('P1');
  await editForm.getByLabel('处理人用户名').fill('yuance_admin');
  await editForm.getByLabel('截止日期').fill('2026-08-15');
  await editForm.getByLabel('父级工作项 Key').fill('');
  await editForm.getByRole('button', { name: '保存修改' }).click();

  await expect.poll(() => editRequests.length).toBe(1);
  expect(editRequests[0].headers['x-yuance-csrf-token']).toBeTruthy();
  expect(editRequests[0].headers['content-type']).toContain('application/json');
  expect(editRequests[0].payload).toMatchObject({
    title: editedDetail.title,
    description: editedDetail.description,
    status: 'in_progress',
    priority: 'P1',
    assignee_username: 'yuance_admin',
    due_date: '2026-08-15',
    parent_item_key: '',
  });
  await expect(page.getByRole('heading', { level: 2, name: `YCE-TASK-2 · ${editedDetail.title}` })).toBeVisible();
  await expect(page.locator('.work-item-detail-description')).toHaveText('通过 Web app shell 保存的描述。');
  await expect(page.getByRole('status')).toHaveText('YCE-TASK-2 已保存。');
  await expect(page.getByText('Web 保存后刷新评论')).toBeVisible();
  await expect(page.locator('.shell-stats')).toContainText(/任务\s*7/);

  await page.route('**/api/v1/work-items/YCE-TASK-2/handoff', async (route) => {
    handoffRequests.push({
      headers: route.request().headers(),
      payload: route.request().postDataJSON(),
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          ...editedDetail,
          status: 'pending_confirmation',
          updated_at: '2026-07-30T12:30:00Z',
        },
      }),
    });
  });

  const handoffForm = page.locator('.work-item-action-form', { hasText: '确认推进' });
  await handoffForm.getByLabel('目标状态').selectOption('pending_confirmation');
  await handoffForm.getByLabel('指派给用户名').fill('yuance_admin');
  await handoffForm.getByLabel('处理说明').fill('请确认 Web shell 表单提交。');
  await handoffForm.getByRole('button', { name: '确认推进' }).click();

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
  await expect(page.locator('.work-item-detail-meta')).toContainText('待确认');
  await expect(page.locator('.shell-stats')).toContainText(/任务\s*8/);
  await expect(page).toHaveURL(/\/web\/app\/work-items\/YCE-TASK-2$/);
});

test('work item edit success survives comments or topbar refresh failures', async ({ page }) => {
  await login(page, '/web/app/work-items/YCE-TASK-2');
  await expect(page.getByRole('heading', { level: 2, name: 'YCE-TASK-2 · 设计项目与工作项数据模型' })).toBeVisible();

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

  const editForm = page.locator('.work-item-action-form', { hasText: '保存修改' });
  await editForm.getByLabel('标题').fill(editedDetail.title);
  await editForm.getByLabel('描述').fill(editedDetail.description);
  await editForm.getByRole('button', { name: '保存修改' }).click();

  await expect(page.getByRole('heading', { level: 2, name: `YCE-TASK-2 · ${editedDetail.title}` })).toBeVisible();
  await expect(page.locator('.work-item-detail-description')).toHaveText(editedDetail.description);
  await expect(page.getByRole('status')).toHaveText('YCE-TASK-2 已保存。');
  await expect(page.locator('.shell-stats')).toContainText(/任务\s*9/);
  await expect(page.getByRole('alert')).toHaveText('工作项已保存，但评论或顶部状态刷新失败，请手动刷新。');
});

test('work item detail load failure does not expose stale write forms', async ({ page }) => {
  await login(page, '/web/app/work-items/YCE-TASK-2');
  await expect(page.getByRole('heading', { level: 2, name: 'YCE-TASK-2 · 设计项目与工作项数据模型' })).toBeVisible();

  await page.route('**/api/v1/work-items/YCE-TASK-1', async (route) => {
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

  await page.getByRole('navigation', { name: '工作项类型导航' }).getByRole('link', { name: '任务' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '任务列表' })).toBeVisible();
  await page.locator('.work-item-row', { hasText: 'YCE-TASK-1' }).getByRole('link', { name: '打开详情' }).click();

  await expect(page).toHaveURL(/\/web\/app\/work-items\/YCE-TASK-1$/);
  await expect(page.getByRole('alert')).toContainText('详情加载失败。');
  await expect(page.getByText('工作项详情暂不可用。')).toBeVisible();
  await expect(page.locator('.work-item-action-form')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 2, name: /YCE-TASK-2/ })).toHaveCount(0);
});

test('work item mutation disables peer form and ignores stale responses after navigation', async ({ page }) => {
  await login(page, '/web/app/work-items/YCE-TASK-2');
  await expect(page.getByRole('heading', { level: 2, name: 'YCE-TASK-2 · 设计项目与工作项数据模型' })).toBeVisible();

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

  const editPanel = page.locator('.work-item-detail-panel', { hasText: '编辑工作项' });
  const editForm = editPanel.locator('.work-item-action-form');
  const saveButton = editForm.locator('button[type="submit"]');
  const handoffPanel = page.locator('.work-item-detail-panel', { hasText: '推进并指派' });
  const handoffButton = handoffPanel.locator('button[type="submit"]');
  await editForm.getByLabel('标题').fill(staleDetail.title);
  await saveButton.click();

  await expect.poll(() => patchCount).toBe(1);
  await expect(saveButton).toBeDisabled();
  await expect(handoffButton).toBeDisabled();

  await page.getByRole('navigation', { name: '工作项类型导航' }).getByRole('link', { name: '任务' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '任务列表' })).toBeVisible();
  await page.locator('.work-item-row', { hasText: 'YCE-TASK-1' }).getByRole('link', { name: '打开详情' }).click();
  await expect(page.getByRole('heading', { level: 2, name: /YCE-TASK-1/ })).toBeVisible();

  releasePatch();

  await expect(page.getByRole('heading', { level: 2, name: /YCE-TASK-1/ })).toBeVisible();
  await expect(page.getByText(staleDetail.title)).toHaveCount(0);
  await expect(page).toHaveURL(/\/web\/app\/work-items\/YCE-TASK-1$/);
});

test('work item mutation ignores stale response after re-entering the same item', async ({ page }) => {
  await login(page, '/web/app/work-items/YCE-TASK-2');
  await expect(page.getByRole('heading', { level: 2, name: 'YCE-TASK-2 · 设计项目与工作项数据模型' })).toBeVisible();

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

  const firstEditForm = page.locator('.work-item-action-form', { hasText: '保存修改' });
  await firstEditForm.getByLabel('标题').fill(staleDetail.title);
  await firstEditForm.getByRole('button', { name: '保存修改' }).click();
  await expect.poll(() => patchCount).toBe(1);

  await page.getByRole('navigation', { name: '工作项类型导航' }).getByRole('link', { name: '任务' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '任务列表' })).toBeVisible();
  await page.locator('.work-item-row', { hasText: 'YCE-TASK-2' }).getByRole('link', { name: '打开详情' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'YCE-TASK-2 · 设计项目与工作项数据模型' })).toBeVisible();

  const currentEditForm = page.locator('.work-item-action-form', { hasText: '保存修改' });
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
  await expect(page.getByRole('heading', { level: 2, name: 'YCE-TASK-2 · 设计项目与工作项数据模型' })).toBeVisible();

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

  await page.route('**/api/v1/work-items/YCE-TASK-2', async (route) => {
    if (route.request().method() === 'PATCH') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: savedDetail }),
      });
      return;
    }
    delayedRefreshCount += 1;
    await refreshRelease;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: oldRefreshDetail }),
    });
  });

  await page.getByRole('button', { name: '刷新' }).click();
  await expect.poll(() => delayedRefreshCount).toBe(1);

  const editForm = page.locator('.work-item-action-form', { hasText: '保存修改' });
  await editForm.getByLabel('标题').fill(savedDetail.title);
  await editForm.getByLabel('描述').fill(savedDetail.description);
  await editForm.getByRole('button', { name: '保存修改' }).click();
  await expect(page.getByRole('heading', { level: 2, name: `YCE-TASK-2 · ${savedDetail.title}` })).toBeVisible();

  releaseRefresh();

  await expect(page.getByRole('heading', { level: 2, name: `YCE-TASK-2 · ${savedDetail.title}` })).toBeVisible();
  await expect(page.locator('.work-item-detail-description')).toHaveText(savedDetail.description);
  await expect(page.getByText(oldRefreshDetail.title)).toHaveCount(0);
});

test('work item edit form keeps input on validation and server errors', async ({ page }) => {
  await login(page, '/web/app/work-items/YCE-TASK-2');
  await expect(page.getByRole('heading', { level: 2, name: 'YCE-TASK-2 · 设计项目与工作项数据模型' })).toBeVisible();

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

  const editForm = page.locator('.work-item-action-form', { hasText: '保存修改' });
  const titleInput = editForm.getByLabel('标题');
  await titleInput.fill('   ');
  await editForm.getByRole('button', { name: '保存修改' }).click();

  await expect(page.getByRole('alert')).toHaveText('标题不能为空。');
  await expect.poll(() => patchCount).toBe(0);
  await expect(titleInput).toHaveValue('   ');

  await titleInput.fill('不会成功的标题');
  await editForm.getByLabel('描述').fill('失败后仍保留的描述');
  await editForm.getByRole('button', { name: '保存修改' }).click();

  await expect.poll(() => patchCount).toBe(1);
  await expect(page.getByRole('alert')).toHaveText('服务端拒绝保存。');
  await expect(titleInput).toHaveValue('不会成功的标题');
  await expect(editForm.getByLabel('描述')).toHaveValue('失败后仍保留的描述');
  await expect(editForm.getByRole('button', { name: '保存修改' })).toBeEnabled();

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

  const handoffForm = page.locator('.work-item-action-form', { hasText: '确认推进' });
  await handoffForm.getByLabel('处理说明').fill('失败后仍保留的推进说明');
  await handoffForm.getByRole('button', { name: '确认推进' }).click();

  await expect(page.getByRole('alert')).toHaveText('服务端拒绝推进。');
  await expect(handoffForm.getByLabel('处理说明')).toHaveValue('失败后仍保留的推进说明');
  await expect(handoffForm.getByRole('button', { name: '确认推进' })).toBeEnabled();
});

test('work item comments can create and edit plain comments', async ({ page }) => {
  const createRequests = [];
  const updateRequests = [];
  const comments = [
    workItemCommentFixture(),
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
        id: 903,
        body: payload.body,
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
  await newCommentInput.fill('新增 Web 评论');
  await page.getByRole('button', { name: '发布评论' }).click();

  await expect.poll(() => createRequests.length).toBe(1);
  expect(createRequests[0].headers['x-yuance-csrf-token']).toBeTruthy();
  expect(createRequests[0].payload).toMatchObject({
    body: '新增 Web 评论',
    body_format: 'plain',
  });
  await expect(page.getByRole('status')).toHaveText('YCE-TASK-2 评论已发布。');
  await expect(page.getByText('新增 Web 评论')).toBeVisible();
  await expect(newCommentInput).toHaveValue('');

  const newCommentRow = page.locator('#comment-903');
  await newCommentRow.getByRole('button', { name: '编辑' }).click();
  await expect(newCommentRow.getByLabel('编辑评论')).toBeFocused();
  await expect(page.locator('#comment-901').getByRole('button', { name: '编辑' })).toHaveCount(0);
  await newCommentRow.getByLabel('编辑评论').fill('编辑后的 Web 评论');
  await newCommentRow.getByRole('button', { name: '保存评论' }).click();

  await expect.poll(() => updateRequests.length).toBe(1);
  expect(updateRequests[0].url).toContain('/api/v1/work-items/YCE-TASK-2/comments/903');
  expect(updateRequests[0].headers['x-yuance-csrf-token']).toBeTruthy();
  expect(updateRequests[0].payload).toMatchObject({
    body: '编辑后的 Web 评论',
    body_format: 'plain',
  });
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
  await expect(newCommentInput).toHaveValue('   ');

  const commentRow = page.locator('#comment-901');
  await commentRow.getByRole('button', { name: '编辑' }).click();
  await expect(commentRow.getByLabel('编辑评论')).toBeFocused();
  await commentRow.getByLabel('编辑评论').fill('服务端会拒绝的评论');
  await commentRow.getByRole('button', { name: '保存评论' }).click();

  await expect(page.getByRole('alert')).toHaveText('不能编辑这条评论。');
  await expect(commentRow.getByLabel('编辑评论')).toHaveValue('服务端会拒绝的评论');
  await expect(page.locator('.work-item-comment-body', { hasText: '初始可编辑评论' })).toBeVisible();
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
        id: 812,
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

  await attachmentPanel.getByRole('button', { name: '下载附件 spec.pdf' }).click();
  await expect.poll(() => downloadUrlRequests.length).toBe(1);
  await expect.poll(async () => page.evaluate(() => window.__yuanceDownloadClicks[0] || '')).toContain('/signed-download/work-item-801');

  await comment901.getByRole('button', { name: '下载评论附件 comment-log.txt' }).click();
  await expect.poll(() => downloadUrlRequests.length).toBe(2);
  expect(downloadUrlRequests[1]).toContain('/api/v1/work-items/YCE-TASK-2/comments/901/attachments/811/download-url');
  await expect.poll(async () => page.evaluate(() => window.__yuanceDownloadClicks[1] || '')).toContain('/signed-download/comment-901-811');

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

  await chooseFile(page, comment901.getByRole('button', { name: '选择评论附件' }), {
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

  const openButton = page.getByRole('button', { name: '打开', exact: true }).first();
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
  await expect(page.getByLabel('顶部状态摘要').getByText('OPS · 交付运维台')).toBeVisible();
  await expect(page.locator('.project-row', { hasText: 'OPS' }).getByRole('button', { name: '当前项目' })).toBeVisible();
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
  await dialog.getByLabel('状态').selectOption('not_started');
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
  const mutations = [];
  await page.route('**/api/v1/projects/YCE', async (route) => {
    if (route.request().method() === 'PATCH') {
      mutations.push(['update', route.request().postDataJSON()]);
      Object.assign(detail, route.request().postDataJSON());
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: detail }) });
  });
  await page.route('**/api/v1/projects/YCE/members', async (route) => {
    if (route.request().method() === 'POST') {
      const payload = route.request().postDataJSON();
      mutations.push(['add', payload]);
      members.push({ user_id: 2, display_name: '协作成员', username: payload.username, member_role: payload.member_role, joined_at: '2026-08-08T00:00:00Z' });
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: members.at(-1) }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: members }) });
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
  await expect(page.getByRole('heading', { level: 2, name: 'YCE · 元策研发平台' })).toBeVisible();
  await page.getByRole('button', { name: '编辑项目' }).click();
  const editDialog = page.getByRole('dialog', { name: '编辑项目' });
  await editDialog.getByLabel('项目描述').fill('共享详情描述');
  await editDialog.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText('共享详情描述')).toBeVisible();

  await page.getByRole('link', { name: '项目成员' }).click();
  await page.getByRole('button', { name: '添加成员' }).click();
  const addDialog = page.getByRole('dialog', { name: '添加项目成员' });
  await addDialog.getByLabel('用户名').fill('collaborator');
  await addDialog.getByLabel('项目角色').selectOption('member');
  await addDialog.getByRole('button', { name: '添加' }).click();
  const memberRow = page.getByRole('row', { name: /协作成员/ });
  await memberRow.getByRole('button', { name: '调整角色' }).click();
  const roleDialog = page.getByRole('dialog', { name: '调整成员角色' });
  await roleDialog.getByLabel('项目角色').selectOption('maintainer');
  await roleDialog.getByRole('button', { name: '保存' }).click();
  await expect(memberRow).toContainText('项目管理员');
  await memberRow.getByRole('button', { name: '移除' }).click();
  await page.getByRole('dialog', { name: '移除项目成员' }).getByRole('button', { name: '确认移除' }).click();
  await expect(page.getByRole('row', { name: /协作成员/ })).toHaveCount(0);
  expect(mutations.map(([kind]) => kind)).toEqual(['update', 'add', 'role', 'remove']);
});

test('shared project files cover empty upload download and archive lifecycle', async ({ page }) => {
  const project = { key: 'YCE', name: '元策研发平台', description: '', status: 'in_progress', owner_username: 'yuance_admin', owner: '元策开发管理员', start_date: '', due_date: '', created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-07T00:00:00Z' };
  const members = [{ user_id: 1, display_name: '元策开发管理员', username: 'yuance_admin', member_role: 'owner', joined_at: '2026-08-01T00:00:00Z' }];
  const uploadStages = [];
  const createRequests = [];
  const downloadUrlRequests = [];
  let attachments = [];

  await page.route('**/api/v1/test-storage/upload**', async (route) => {
    uploadStages.push(`put:${new URL(route.request().url()).searchParams.get('target')}`);
    await route.fulfill({ status: 200, body: '' });
  });
  await page.route('**/api/v1/projects/YCE/attachments/701/upload-url', async (route) => {
    uploadStages.push('sign:701');
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: {
      attachment: attachments[0],
      request: { method: 'PUT', url: '/api/v1/test-storage/upload?target=project-701', headers: [['content-type', 'text/plain']] },
      expires_in_seconds: 600,
      checksum_sha256: '70195378e26400f321a170529a641bb13d5560b94c4d1a11be937870225461a0',
    } }) });
  });
  await page.route('**/api/v1/projects/YCE/attachments/701/uploaded', async (route) => {
    uploadStages.push('mark:701');
    attachments = [{ ...attachments[0], status: 'uploaded' }];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: attachments[0] }) });
  });
  await page.route('**/api/v1/projects/YCE/attachments/701/download-url', async (route) => {
    downloadUrlRequests.push(route.request().url());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: {
      attachment: attachments[0],
      request: { method: 'GET', url: '/signed-download/project-701?token=browser-e2e', headers: [] },
      expires_in_seconds: 600,
    } }) });
  });
  await page.route('**/api/v1/projects/YCE/attachments/701', async (route) => {
    expect(route.request().method()).toBe('DELETE');
    attachments = [{ ...attachments[0], status: 'deleted' }];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: attachments[0] }) });
  });
  await page.route('**/api/v1/projects/YCE/attachments', async (route) => {
    if (route.request().method() === 'POST') {
      const payload = route.request().postDataJSON();
      createRequests.push(payload);
      attachments = [attachmentFixture({ id: 701, filename: payload.original_filename, content_type: payload.content_type, byte_size: payload.byte_size, status: 'pending' })];
      uploadStages.push('create:701');
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: attachments[0] }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: attachments }) });
  });
  await page.route('**/api/v1/projects/YCE/members', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: members }) }));
  await page.route('**/api/v1/projects/YCE', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: project }) }));

  await login(page, '/web/app/projects/YCE?tab=files');
  await page.evaluate(() => {
    window.__yuanceDownloadClicks = [];
    HTMLAnchorElement.prototype.click = function click() { window.__yuanceDownloadClicks.push(this.href); };
  });

  await expect(page.getByText('当前项目暂无文件。')).toBeVisible();
  await chooseFile(page, page.getByRole('button', { name: '选择文件上传' }), {
    name: 'project-notes.txt', mimeType: 'text/plain', buffer: Buffer.from('project file'),
  });
  await expect.poll(() => uploadStages).toEqual(['create:701', 'sign:701', 'put:project-701', 'mark:701']);
  expect(createRequests).toEqual([{ original_filename: 'project-notes.txt', content_type: 'text/plain', byte_size: 12, checksum_sha256: '70195378e26400f321a170529a641bb13d5560b94c4d1a11be937870225461a0' }]);

  const fileList = page.getByRole('list', { name: '项目文件列表' });
  await expect(fileList).toContainText('project-notes.txt');
  await expect(fileList).toContainText('已上传');
  await fileList.getByRole('button', { name: '下载附件 project-notes.txt' }).click();
  await expect.poll(() => downloadUrlRequests.length).toBe(1);
  expect(downloadUrlRequests[0]).toContain('/api/v1/projects/YCE/attachments/701/download-url');
  await expect.poll(async () => page.evaluate(() => window.__yuanceDownloadClicks[0] || '')).toContain('/signed-download/project-701?token=browser-e2e');

  await fileList.getByRole('button', { name: '归档' }).click();
  const archiveDialog = page.getByRole('dialog', { name: '归档项目文件' });
  await expect(archiveDialog).toContainText('确认归档文件“project-notes.txt”？');
  await archiveDialog.getByRole('button', { name: '确认归档' }).click();
  await expect(fileList).toContainText('已归档');
  await expect(fileList.getByRole('button', { name: '下载附件 project-notes.txt' })).toHaveCount(0);
  await expect(fileList.getByRole('button', { name: '归档' })).toHaveCount(0);
});

test('shared project files hide upload and archive actions from viewers', async ({ page }) => {
  const project = { key: 'YCE', name: '元策研发平台', description: '', status: 'in_progress', owner_username: 'yuance_admin', owner: '元策开发管理员', start_date: '', due_date: '', created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-07T00:00:00Z' };
  const attachment = attachmentFixture({ id: 702, filename: 'viewer-readable.txt', content_type: 'text/plain' });
  await login(page, '/web/app');
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { id: 2, username: 'file_viewer', display_name: '文件只读成员', email: '', mobile: '', status: 'active', is_super_admin: false, roles: '', created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-07T00:00:00Z' } }) }));
  await page.route('**/api/v1/projects/YCE', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: project }) }));
  await page.route('**/api/v1/projects/YCE/members', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ user_id: 2, display_name: '文件只读成员', username: 'file_viewer', member_role: 'viewer', joined_at: '2026-08-01T00:00:00Z' }] }) }));
  await page.route('**/api/v1/projects/YCE/attachments', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [attachment] }) }));

  await page.goto('/web/app/projects/YCE?tab=files');
  const fileList = page.getByRole('list', { name: '项目文件列表' });
  await expect(fileList).toContainText('viewer-readable.txt');
  await expect(page.getByRole('button', { name: '选择文件上传' })).toHaveCount(0);
  await expect(fileList.getByRole('button', { name: '归档' })).toHaveCount(0);
  await expect(fileList.getByRole('button', { name: '下载附件 viewer-readable.txt' })).toBeVisible();
});

test('shared project file upload failure keeps registered file context', async ({ page }) => {
  const project = { key: 'YCE', name: '元策研发平台', description: '', status: 'in_progress', owner_username: 'yuance_admin', owner: '元策开发管理员', start_date: '', due_date: '', created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-07T00:00:00Z' };
  const members = [{ user_id: 1, display_name: '元策开发管理员', username: 'yuance_admin', member_role: 'owner', joined_at: '2026-08-01T00:00:00Z' }];
  let attachments = [];
  let createCount = 0;
  let uploadCount = 0;
  await page.route('**/api/v1/test-storage/upload**', (route) => {
    uploadCount += 1;
    return uploadCount === 1
      ? route.fulfill({ status: 503, contentType: 'text/plain', body: 'storage unavailable' })
      : route.fulfill({ status: 200, body: '' });
  });
  await page.route('**/api/v1/projects/YCE/attachments/703/upload-url', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: {
    attachment: attachments[0], request: { method: 'PUT', url: '/api/v1/test-storage/upload?target=project-703', headers: [['content-type', 'text/plain']] }, expires_in_seconds: 600,
    checksum_sha256: 'f165ee2c07068cf64844ac64730421e4d38013a1fe048f157c8272547fc82c1c',
  } }) }));
  await page.route('**/api/v1/projects/YCE/attachments/703/uploaded', (route) => {
    attachments = [{ ...attachments[0], status: 'uploaded' }];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: attachments[0] }) });
  });
  await page.route('**/api/v1/projects/YCE/attachments', async (route) => {
    if (route.request().method() === 'POST') {
      createCount += 1;
      const payload = route.request().postDataJSON();
      attachments = [attachmentFixture({ id: 703, filename: payload.original_filename, content_type: payload.content_type, byte_size: payload.byte_size, status: 'pending' })];
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: attachments[0] }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: attachments }) });
  });
  await page.route('**/api/v1/projects/YCE/members', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: members }) }));
  await page.route('**/api/v1/projects/YCE', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: project }) }));

  await login(page, '/web/app/projects/YCE?tab=files');
  await chooseFile(page, page.getByRole('button', { name: '选择文件上传' }), {
    name: 'failed-project-upload.txt', mimeType: 'text/plain', buffer: Buffer.from('failed upload'),
  });

  const fileList = page.getByRole('list', { name: '项目文件列表' });
  await expect(page.getByRole('alert')).toContainText('对象存储上传失败：503');
  await expect(fileList).toContainText('failed-project-upload.txt');
  await expect(fileList).toContainText('上传失败');
  await expect(page.getByRole('button', { name: '选择文件上传' })).toBeEnabled();
  await chooseFile(page, fileList.getByRole('button', { name: '继续上传' }), {
    name: 'failed-project-upload.txt', mimeType: 'text/plain', buffer: Buffer.from('failed upload'),
  });
  await expect(fileList).toContainText('已上传');
  expect(createCount).toBe(1);
  expect(uploadCount).toBe(2);
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
  await page.getByRole('link', { name: '迭代一更新' }).click(); await expect(page.getByRole('heading', { level: 3, name: '当前节奏' })).toBeVisible(); await expect(page.getByRole('progressbar', { name: '周期时间进度' })).toBeVisible(); await expect(page.getByRole('heading', { level: 3, name: '工作项状态看板' })).toBeVisible(); await expect(page.getByText('YCE-TASK-2 · 周期任务')).toBeVisible(); await expect(page.getByRole('table', { name: '周期成员负载' })).toContainText('元策开发管理员');
  await page.getByRole('link', { name: 'YCE-TASK-2 · 周期任务' }).click(); await expect(page).toHaveURL(/\/web\/app\/work-items\/YCE-TASK-2$/); await page.goBack(); await expect(page.getByRole('heading', { level: 2, name: '迭代一更新' })).toBeVisible();
  await page.getByRole('link', { name: '返回周期列表' }).click(); const updatedRow = page.getByRole('row', { name: /迭代一更新/ }); await updatedRow.getByRole('button', { name: '关闭' }).click(); await page.getByRole('dialog', { name: '关闭项目周期' }).getByRole('button', { name: '确认关闭' }).click(); await expect(page.getByRole('row', { name: /迭代一更新/ })).toContainText('已关闭'); await expect(updatedRow.getByRole('button', { name: '编辑' })).toHaveCount(0); await expect(updatedRow.getByRole('button', { name: '关闭' })).toHaveCount(0);
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
  await expect(page.getByLabel('顶部状态摘要').getByText('OPS · 交付运维台')).toBeVisible();
  expect(patchCount).toBe(1);
});

test('shared global shell remains usable at canonical responsive widths', async ({ page }, testInfo) => {
  await login(page, '/web/app');

  for (const width of [390, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator('.global-nav')).toBeVisible();
    await expect(page.getByRole('navigation', { name: '应用导航' })).toBeVisible();
    await expect(page.getByRole('search')).toBeVisible();
    await expect(page.getByRole('button', { name: '切换当前项目' })).toBeVisible();
    await expect(page.getByRole('button', { name: /打开 .* 的账户菜单/ })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`global-shell-${width}.png`), fullPage: true });
  }

  await page.setViewportSize({ width: 390, height: 900 });
  await page.getByRole('button', { name: /打开 .* 的账户菜单/ }).click();
  await page.getByRole('button', { name: '深色模式' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: testInfo.outputPath('global-shell-390-dark.png'), fullPage: true });
});
