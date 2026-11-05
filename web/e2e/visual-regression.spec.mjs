import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

/*
 * 主 Web 视觉回归护栏。
 *
 * 两层：
 * 1. 结构层：逐页逐视口断言「无横向溢出、主区存在且唯一 h1、合同登记的几何锚点在 DOM 中」。
 *    这一层抗脆弱，能挡住壳层与页面结构改动造成的布局塌陷。
 * 2. 像素层：对代表性页面截图并入库基线（*-snapshots/），用于发现肉眼可见的整体偏移。
 *    动态内容按合同 dynamicMasks 与固定遮罩规则屏蔽。
 *
 * 视口集合 = parity 合同登记的 4 档验收视口 + 设计稿声明的最小支持宽度 375。
 * parity 合同的 viewports 被 schema 固定为 4 项，改动会丢失 390 真机覆盖，
 * 因此 375 作为 e2e 的额外窄屏保障，而不是替换合同里的 mobile 档。
 */

const contract = JSON.parse(
  await readFile(new URL('../../frontend/parity/main-web-visual-contract.json', import.meta.url), 'utf8'),
);

/** parity 合同登记的 4 档验收视口。 */
const contractViewports = contract.viewports;

/** 设计稿声明的最小支持宽度（ui-v3 的响应式起点）。 */
const narrowViewport = { name: 'narrow', width: 375, height: 812 };

const allViewports = [...contractViewports, narrowViewport];

/**
 * 共享应用里可直达的页面，与视觉合同条目一一对应。
 * 只覆盖证据模式为 runtime 的页面；boundary 与 no-baseline 页面由服务端单独渲染，不在此处断言。
 *
 * `prepare` 用于把页面推进到「有数据」状态后再断言锚点：
 * 有些锚点只在该状态下出现（例如数据库统计的大表与工具条要刷新宿主快照后才渲染）。
 */
const appPages = [
  { id: 'page.shell.dashboard', path: '/web/app' },
  { id: 'page.personal.profile', path: '/web/app/me' },
  { id: 'page.message-search.messages', path: '/web/app/messages' },
  { id: 'page.message-search.search', path: '/web/app/search?q=YCE' },
  { id: 'page.project.list', path: '/web/app/projects' },
  { id: 'page.project.detail', path: '/web/app/projects/YCE' },
  { id: 'page.project.personal-analysis', path: '/web/app/projects/YCE/my-analysis' },
  { id: 'page.work-item-list.requirements', path: '/web/app/requirements' },
  { id: 'page.work-item-list.tasks', path: '/web/app/tasks' },
  { id: 'page.work-item-list.bugs', path: '/web/app/bugs' },
  { id: 'page.work-item-detail.detail', path: '/web/app/work-items/YCE-TASK-2' },
  { id: 'page.system.dashboard', path: '/web/app/system' },
  { id: 'page.system.users', path: '/web/app/system/users' },
  { id: 'page.system.roles', path: '/web/app/system/roles' },
  { id: 'page.system.permissions', path: '/web/app/system/permissions' },
  { id: 'page.system.storage', path: '/web/app/system/storage' },
  { id: 'page.system.openapi', path: '/web/app/system/openapi' },
  { id: 'page.system.releases', path: '/web/app/system/releases' },
  {
    id: 'page.system.database-stats',
    path: '/web/app/system/database-stats',
    async prepare(page) {
      await page.getByRole('button', { name: '刷新' }).click();
      await page.locator('.database-stats-toolbar').waitFor({ state: 'visible', timeout: 20000 });
    },
  },
  { id: 'page.system.audit', path: '/web/app/system/audit' },
];

/** 像素基线覆盖的代表性页面。 */
const goldenPages = [
  { id: 'page.shell.dashboard', path: '/web/app' },
  { id: 'page.project.list', path: '/web/app/projects' },
  { id: 'page.work-item-list.requirements', path: '/web/app/requirements' },
  { id: 'page.system.users', path: '/web/app/system/users' },
];

/** 合同里登记的动态遮罩选择器。 */
const dynamicMaskSelectors = contract.pages.flatMap((page) =>
  page.dynamicMasks.map((mask) => mask.selector),
);

/** 额外屏蔽的易变内容：时间戳、头像、相对时间。 */
const volatileMaskSelectors = [
  'time',
  '[class*="time"]',
  '[class*="date"]',
  '[class*="clock"]',
  '[class*="avatar"]',
  '[class*="updated"]',
  '[class*="created"]',
];

/** 易变文本：绝对时间戳与相对时间，按文本内容屏蔽。 */
const volatileTextPatterns = [
  /\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?/u,
  /\d+\s*(?:秒|分钟|小时|天)前/u,
];

/**
 * 像素基线只在独立服务与独立数据上运行：
 * 与功能 e2e 共用一份数据时，当前项目与工作项会被其它用例改动，基线会随执行顺序漂移。
 * 主配置下只跑与顺序无关的结构层。
 */
const baselineEnabled = process.env.YUANCE_VISUAL_BASELINE === '1';

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

async function openPage(page, path) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.main')).toBeVisible({ timeout: 20000 });
}

async function horizontalOverflow(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const widest = [...document.querySelectorAll('body *')]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { selector: element.className || element.tagName, right: rect.right };
      })
      .filter(({ right }) => right > window.innerWidth + 1)
      .sort((left, right) => right.right - left.right)[0];
    return {
      scrollWidth: root.scrollWidth,
      innerWidth: window.innerWidth,
      widest: widest ?? null,
    };
  });
}

test.describe('主 Web 视觉结构护栏', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  for (const viewport of allViewports) {
    test(`${viewport.name} ${viewport.width}px 下所有页面无横向溢出且主区完整`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const failures = [];

      for (const target of appPages) {
        await openPage(page, target.path);
        if (target.prepare) await target.prepare(page);
        const overflow = await horizontalOverflow(page);
        if (overflow.scrollWidth > overflow.innerWidth + 1) {
          failures.push(
            `${target.id} 横向溢出：scrollWidth=${overflow.scrollWidth} > innerWidth=${overflow.innerWidth}，最宽元素 ${overflow.widest?.selector ?? '未知'}`,
          );
        }
        const headingCount = await page.locator('h1').count();
        if (headingCount !== 1) {
          failures.push(`${target.id} h1 数量为 ${headingCount}，应为 1`);
        }
        const contractPage = contract.pages.find((entry) => entry.id === target.id);
        for (const anchor of [...(contractPage?.stableAnchors ?? []), ...(contractPage?.geometryAnchors ?? [])]) {
          if (await page.locator(anchor).count() === 0) {
            failures.push(`${target.id} 锚点 ${anchor} 未出现在 DOM 中`);
          }
        }
      }

      expect(failures, failures.join('\n')).toEqual([]);
    });
  }
});

test.describe('主 Web 像素基线', () => {
  test.skip(!baselineEnabled, '像素基线需要独立服务与独立数据，请运行 npm --prefix web run test:visual');

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  for (const viewport of contractViewports) {
    test(`${viewport.name} ${viewport.width}px 下的代表性页面截图`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      for (const target of goldenPages) {
        await openPage(page, target.path);
        await page.waitForTimeout(300);
        const contractPage = contract.pages.find((entry) => entry.id === target.id);
        const maskSelectors = [...new Set([...(contractPage?.dynamicMasks ?? []).map((mask) => mask.selector), ...volatileMaskSelectors])];
        const mask = [
          ...maskSelectors.map((selector) => page.locator(selector)),
          ...volatileTextPatterns.map((pattern) => page.getByText(pattern)),
        ];

        await expect(page).toHaveScreenshot(`${target.id}-${viewport.name}.png`, {
          animations: 'disabled',
          caret: 'hide',
          maxDiffPixelRatio: 0.02,
          mask,
        });
      }
    });
  }
});
