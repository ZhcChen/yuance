import { defineConfig } from '@playwright/test';

const host = process.env.YUANCE_WEB_E2E_HOST || '127.0.0.1';
const port = process.env.YUANCE_WEB_E2E_PORT || '33036';
const baseURL = `http://${host}:${port}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  retries: process.env.CI ? 1 : 0,
  outputDir: '../.artifacts/playwright-output',
  reporter: [['list'], ['html', { open: 'never', outputFolder: '../.artifacts/playwright-report' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1400, height: 960 },
  },
  webServer: {
    command: 'sh ../scripts/start-web-e2e-server.sh',
    url: `${baseURL}/api/healthz`,
    timeout: 180000,
    reuseExistingServer: !process.env.CI,
  },
});
