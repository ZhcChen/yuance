import { expect, test } from './support/fixtures.mjs';

// 下拉菜单可见性巡检：逐页展开每个共享 Select，确认菜单不会被祖先容器（overflow: hidden）裁剪、
// 也不会被其他元素遮挡——菜单上下边缘与各选项中心点处的最上层元素必须属于菜单本身。

async function login(page) {
  await page.goto('/web/app');
  await expect(page).toHaveURL(/\/web\/login/);
  await page.locator('input[name="username"]').fill('yuance_admin');
  await page.locator('input[name="password"]').fill('Yuance@2026Dev!');
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/web/login')),
    page.getByRole('button', { name: '登录' }).click(),
  ]);
}

/**
 * 检查当前页面（或指定作用域）内所有可用 Select 的菜单可见性，返回问题列表。
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} scope
 * @param {string} context
 */
async function auditSelects(page, scope, context) {
  const problems = [];
  const triggers = scope.locator('.yc-select-trigger:visible:enabled');
  const count = await triggers.count();
  for (let index = 0; index < count; index += 1) {
    const trigger = triggers.nth(index);
    await trigger.scrollIntoViewIfNeeded();
    const label = (await trigger.evaluate((element) => {
      const field = element.closest('.yc-field, label, .work-item-filter-field, div');
      const name = element.getAttribute('aria-label') || element.textContent || '';
      return `${field?.querySelector('label')?.textContent?.trim() || ''} ${name.trim()}`.trim();
    })).slice(0, 40);
    await trigger.click();
    const menu = page.locator(`#${await trigger.getAttribute('aria-controls')}`);
    const root = trigger.locator('xpath=..');
    const searchable = await root.locator('.yc-select-menu.is-searchable').count();
    const menuBox = searchable ? root.locator('.yc-select-menu') : menu;
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    // 等待展开动画结束后再取几何信息。
    await page.waitForTimeout(250);
    const result = await menuBox.evaluate((menuElement) => {
      const rect = menuElement.getBoundingClientRect();
      const inside = (x, y) => {
        const hit = document.elementFromPoint(x, y);
        return Boolean(hit && menuElement.contains(hit));
      };
      const viewportOk = rect.top >= 0 && rect.left >= 0 && rect.bottom <= window.innerHeight + 1 && rect.right <= window.innerWidth + 1;
      const edgesOk = rect.height > 0 && inside(rect.left + rect.width / 2, rect.top + 4) && inside(rect.left + rect.width / 2, rect.bottom - 4);
      const options = [...menuElement.querySelectorAll('[role="option"]')];
      const listbox = menuElement.matches('[role="listbox"]') ? menuElement : menuElement.querySelector('[role="listbox"]');
      const listRect = listbox?.getBoundingClientRect() || rect;
      const hiddenOptions = options
        .filter((option) => {
          const box = option.getBoundingClientRect();
          // 只检查处于菜单滚动视口内的选项（菜单自身可滚动时，视口外选项属正常）。
          return box.top >= listRect.top && box.bottom <= listRect.bottom + 1;
        })
        .filter((option) => {
          const box = option.getBoundingClientRect();
          const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
          return !(hit && option.contains(hit));
        })
        .map((option) => option.textContent?.trim());
      return { viewportOk, edgesOk, optionCount: options.length, hiddenOptions };
    });
    if (!result.viewportOk || !result.edgesOk || result.hiddenOptions.length) {
      problems.push(`${context} · ${label}：${!result.edgesOk ? '菜单被裁剪或遮挡；' : ''}${!result.viewportOk ? '菜单超出视口；' : ''}${result.hiddenOptions.length ? `不可见选项 ${result.hiddenOptions.join('、')}` : ''}`);
    }
    await page.keyboard.press('Escape');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  }
  return { problems, count };
}

/**
 * 打开一个弹出层（菜单、面板），检查其边缘与条目均为该位置最上层元素，随后关闭。
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} trigger
 * @param {import('@playwright/test').Locator} popup
 * @param {string} context
 * @param {() => Promise<void>} close
 */
async function auditPopup(page, trigger, popup, context, close) {
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  await expect(popup).toBeVisible();
  await page.waitForTimeout(250);
  const result = await popup.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const inside = (x, y) => {
      const hit = document.elementFromPoint(x, y);
      return Boolean(hit && element.contains(hit));
    };
    const viewportOk = rect.top >= 0 && rect.left >= 0 && rect.bottom <= window.innerHeight + 1 && rect.right <= window.innerWidth + 1;
    const edgesOk = rect.height > 0 && inside(rect.left + rect.width / 2, rect.top + 4) && inside(rect.left + rect.width / 2, rect.bottom - 4)
      && inside(rect.left + 4, rect.top + rect.height / 2) && inside(rect.right - 4, rect.top + rect.height / 2);
    return { viewportOk, edgesOk };
  });
  await close();
  return !result.viewportOk || !result.edgesOk ? [`${context}：${!result.edgesOk ? '弹出层被裁剪或遮挡；' : ''}${!result.viewportOk ? '弹出层超出视口；' : ''}`] : [];
}

const pages = [
  ['工作台', '/web/app'],
  ['个人资料', '/web/app/me'],
  ['消息中心', '/web/app/messages'],
  ['项目列表', '/web/app/projects'],
  ['项目详情', '/web/app/projects/YCE'],
  ['个人分析', '/web/app/projects/YCE/my-analysis'],
  ['资料库', '/web/app/projects/YCE/resources'],
  ['需求列表', '/web/app/requirements'],
  ['任务列表', '/web/app/tasks'],
  ['Bug 列表', '/web/app/bugs'],
  ['工作项详情', '/web/app/work-items/YCE-TASK-2'],
  ['时间管理', '/web/app/time-management'],
  ['系统用户', '/web/app/system/users'],
  ['系统角色', '/web/app/system/roles'],
  ['权限目录', '/web/app/system/permissions'],
  ['对象存储', '/web/app/system/storage'],
  ['系统 OpenAPI', '/web/app/system/openapi'],
  ['审计日志', '/web/app/system/audit'],
];

for (const viewport of [{ name: '桌面', width: 1400, height: 960 }, { name: '笔记本', width: 1280, height: 720 }]) {
  for (const [name, path] of pages) {
    test(`${viewport.name} · ${name} 的下拉菜单完整可见`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await login(page);
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const { problems } = await auditSelects(page, page.locator('main'), name);
      expect(problems, problems.join('\n')).toEqual([]);
    });
  }

  test(`${viewport.name} · 弹窗内的下拉菜单完整可见`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await login(page);
    const problems = [];
    const dialogs = [
      ['/web/app/requirements', '新建需求', '新建需求'],
      ['/web/app/tasks', '新建任务', '新建任务'],
      ['/web/app/work-items/YCE-TASK-2', '编辑内容', '编辑工作项'],
      ['/web/app/work-items/YCE-TASK-2', '指派 / 流转', '指派 / 流转'],
    ];
    for (const [path, button, title] of dialogs) {
      await page.goto(path);
      await page.getByRole('button', { name: button, exact: true }).first().click();
      const dialog = page.getByRole('dialog', { name: title });
      await expect(dialog).toBeVisible();
      problems.push(...(await auditSelects(page, dialog, title)).problems);
      await page.keyboard.press('Escape');
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });
}

for (const viewport of [{ name: '桌面', width: 1400, height: 960 }, { name: '笔记本', width: 1280, height: 720 }]) {
  test(`${viewport.name} · 顶栏菜单完整可见`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await login(page);
    await page.goto('/web/app/requirements');
    const problems = [];
    for (const [name, details] of [
      ['切换当前项目', page.locator('details.global-nav-project')],
      ['消息通知', page.locator('details.global-nav-notifications')],
      ['账户菜单', page.locator('details.global-nav-account')],
    ]) {
      problems.push(...await auditPopup(page, details.locator('summary'), details.locator('.global-nav-menu'), `顶栏 · ${name}`, async () => {
        await details.locator('summary').click();
        await expect(details).not.toHaveAttribute('open', '');
      }));
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });

  test(`${viewport.name} · 富文本工具栏弹出层完整可见`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await login(page);
    const problems = [];
    const scopes = [
      ['新建需求弹窗', '/web/app/requirements', async () => {
        await page.getByRole('button', { name: '新建需求' }).click();
        const dialog = page.getByRole('dialog', { name: '新建需求' });
        return [dialog, dialog.getByRole('heading', { name: '新建需求' })];
      }],
      ['工作项讨论区', '/web/app/work-items/YCE-TASK-2', async () => [page.locator('.work-item-comment-form').first(), page.getByRole('heading', { level: 1 })]],
    ];
    for (const [context, path, open] of scopes) {
      await page.goto(path);
      // 工具栏下拉在外部 pointerdown 时收起，点击标题这类无操作区域关闭。
      const [scope, neutral] = await open();
      const toolbar = scope.getByRole('toolbar', { name: '富文本工具栏' }).first();
      for (const name of ['段落格式', '字号', '文字颜色']) {
        const trigger = toolbar.getByRole('button', { name, exact: true });
        problems.push(...await auditPopup(page, trigger, page.locator('.yc-rich-toolbar-popover:visible'), `${context} · ${name}`, async () => {
          await neutral.click();
          await expect(page.locator('.yc-rich-toolbar-popover:visible')).toHaveCount(0);
        }));
      }
      const more = toolbar.getByRole('button', { name: '更多格式' });
      problems.push(...await auditPopup(page, more, page.getByRole('menu', { name: '更多格式' }), `${context} · 更多格式`, async () => {
        await neutral.hover();
        await neutral.click();
        await expect(page.getByRole('menu', { name: '更多格式' })).toHaveCount(0);
      }));
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });
}

test('收起的下拉菜单不渲染：不可聚焦，也不撑高弹窗正文', async ({ page }) => {
  await login(page);
  await page.goto('/web/app/tasks');
  await expect(page.locator('.work-item-filter-bar .yc-select-trigger').first()).toBeVisible();
  // 收起状态的菜单及其列表不得占据布局或进入 Tab 顺序。
  const closedMenus = await page.locator('.yc-select-menu').evaluateAll((menus) => menus.map((menu) => ({
    display: getComputedStyle(menu).display,
    focusableList: menu.querySelector('[role="listbox"]')?.tabIndex,
  })));
  expect(closedMenus.length).toBeGreaterThan(0);
  expect(closedMenus.filter((menu) => menu.display !== 'none')).toEqual([]);
  for (let index = 0; index < 40; index += 1) {
    await page.keyboard.press('Tab');
    const inClosedMenu = await page.evaluate(() => Boolean(document.activeElement?.closest('.yc-select-menu:not(:popover-open)')));
    expect(inClosedMenu).toBe(false);
  }

  // 弹窗正文不因收起的菜单出现额外滚动。
  await page.goto('/web/app/system/roles');
  await page.getByRole('button', { name: '新建角色' }).click();
  const body = page.getByRole('dialog', { name: '创建角色' }).locator('.yc-modal-body');
  await expect.poll(() => body.evaluate((element) => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1);

  // 展开后仍可正常选择。
  await page.keyboard.press('Escape');
  await page.goto('/web/app/tasks');
  const trigger = page.locator('.work-item-filter-bar .yc-field').filter({ hasText: /^状态/u }).locator('.yc-select-trigger');
  await trigger.click();
  await page.getByRole('option', { name: '进行中' }).click();
  await expect(trigger).toContainText('进行中');
});
