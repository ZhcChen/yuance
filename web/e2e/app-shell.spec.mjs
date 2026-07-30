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
