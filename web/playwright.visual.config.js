import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * 视觉回归专用配置。
 *
 * 像素基线必须可重复，因此它不能与功能 e2e 共用同一个服务与数据库：
 * 功能用例会切换当前项目、增删工作项与评论，共享一份数据会让基线随执行顺序漂移。
 *
 * 这里给视觉回归单独开一份服务与一份全新种子数据（独立端口段、独立数据目录，由 worker fixture 启动），
 * 由 `npm --prefix web run test:visual` 单独触发；
 * 主配置 `playwright.config.js` 仍然会加载视觉回归 spec，但只跑与顺序无关的结构层。
 */

const repositoryRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
// 视觉回归使用独立端口段与数据目录；worker fixture 每次从模板库启动全新服务，保证像素基线数据固定。
process.env.YUANCE_WEB_E2E_PORT_BASE ||= process.env.YUANCE_VISUAL_E2E_PORT_BASE || '33200';
process.env.YUANCE_WEB_E2E_ROOT ||= resolve(repositoryRoot, '.artifacts/web-e2e-visual');

export default defineConfig({
  testDir: './e2e',
  testMatch: 'visual-regression.spec.mjs',
  globalSetup: './e2e/support/global-setup.mjs',
  timeout: 60000,
  retries: 0,
  workers: 1,
  outputDir: '../.artifacts/playwright-visual-output',
  reporter: [['list'], ['html', { open: 'never', outputFolder: '../.artifacts/playwright-visual-report' }]],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1400, height: 960 },
  },
});
