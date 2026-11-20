import { defineConfig } from '@playwright/test';

// 每个 worker 由 e2e/support/fixtures.mjs 启动独立服务与独立数据库（模板库副本），
// 用例之间不共享全局数据，因此开启 fullyParallel，同一 spec 文件内的用例也会分散到多个 worker。
// 全局准备（构建 Web 与后端二进制、生成模板库）见 e2e/support/global-setup.mjs。
// 运行 ID 在主进程设置一次，worker 继承，用于区分本次运行的数据目录。
process.env.YUANCE_E2E_RUN_ID ||= String(process.pid);

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/support/global-setup.mjs',
  globalTeardown: './e2e/support/global-teardown.mjs',
  fullyParallel: true,
  timeout: 60000,
  expect: { timeout: 5000 },
  retries: process.env.CI ? 1 : 0,
  outputDir: '../.artifacts/playwright-output',
  reporter: [['list'], ['html', { open: 'never', outputFolder: '../.artifacts/playwright-report' }]],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1400, height: 960 },
  },
});
