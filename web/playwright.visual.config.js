import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * 视觉回归专用配置。
 *
 * 像素基线必须可重复，因此它不能与功能 e2e 共用同一个服务与数据库：
 * 功能用例会切换当前项目、增删工作项与评论，共享一份数据会让基线随执行顺序漂移。
 *
 * 这里给视觉回归单独开一份服务与一份全新种子数据（独立端口、独立数据目录），
 * 由 `npm --prefix web run test:visual` 单独触发；
 * 主配置 `playwright.config.js` 仍然会加载视觉回归 spec，但只跑与顺序无关的结构层。
 */

const repositoryRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const host = process.env.YUANCE_WEB_E2E_HOST || '127.0.0.1';
const port = process.env.YUANCE_VISUAL_E2E_PORT || '33037';
const baseURL = `http://${host}:${port}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: 'visual-regression.spec.mjs',
  timeout: 60000,
  retries: 0,
  workers: 1,
  outputDir: '../.artifacts/playwright-visual-output',
  reporter: [['list'], ['html', { open: 'never', outputFolder: '../.artifacts/playwright-visual-report' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1400, height: 960 },
  },
  webServer: {
    command: 'sh ../scripts/start-web-e2e-server.sh',
    env: {
      YUANCE_WEB_E2E_HOST: host,
      YUANCE_WEB_E2E_PORT: port,
      YUANCE_WEB_E2E_ROOT: resolve(repositoryRoot, '.artifacts/web-e2e-visual'),
    },
    url: `${baseURL}/api/healthz`,
    timeout: 180000,
    reuseExistingServer: false,
  },
});
