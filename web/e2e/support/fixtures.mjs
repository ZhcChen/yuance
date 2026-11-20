// e2e 共享 fixture：每个用例启动一套独立的 yuance-api 服务（按 worker 区分端口、模板数据库副本），
// 并把 baseURL 指向它。用例之间不共享当前项目、对象存储配置、项目列表、工作项等任何数据，
// 结果与执行顺序、所在 worker 无关，因而可以完全并行。服务冷启动约 50ms，复制模板库为毫秒级。
//
// 用法：在 spec 中 `import { expect, test } from './support/fixtures.mjs';`
import { spawn } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

import { test as base, expect } from '@playwright/test';

import { apiBinary, artifactsRoot, host, repoRoot, serverEnv, templateDbName, templateDir } from './environment.mjs';

/** 由系统分配一个当前空闲的端口，避免与其他 worker 或其他 e2e 运行冲突。 */
function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, host, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForHealthy(url, child, output, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`[e2e] 服务提前退出（${child.exitCode}）：\n${output.join('')}`);
    try {
      const response = await fetch(`${url}/api/healthz`);
      if (response.ok) return;
    } catch {
      // 服务尚未就绪，继续等待。
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`[e2e] 等待服务就绪超时：${url}\n${output.join('')}`);
}

export const test = base.extend({
  e2eServer: async ({}, use, testInfo) => {
    const port = await freePort();
    const dataDir = path.join(artifactsRoot, `worker-${testInfo.parallelIndex}`);
    rmSync(dataDir, { recursive: true, force: true });
    mkdirSync(dataDir, { recursive: true });
    copyFileSync(path.join(templateDir, templateDbName), path.join(dataDir, templateDbName));

    const output = [];
    const child = spawn(apiBinary, ['serve'], { cwd: repoRoot, env: serverEnv(dataDir, port), stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (chunk) => output.push(String(chunk)));
    child.stderr.on('data', (chunk) => output.push(String(chunk)));
    const url = `http://${host}:${port}`;
    try {
      await waitForHealthy(url, child, output);
      // 端口若被其他进程抢先占用，本服务会绑定失败并退出，健康检查却可能命中对方服务；
      // 稍等后确认本进程仍在运行，确保用例连接的是自己的服务。
      await new Promise((resolve) => setTimeout(resolve, 50));
      if (child.exitCode !== null) throw new Error(`[e2e] 服务启动后退出（${child.exitCode}），端口 ${port} 可能被占用：\n${output.join('')}`);
      await use({ url, dataDir });
      // 服务在用例期间崩溃时界面可能只显示错误提示，这里显式断言服务仍存活。
      if (child.exitCode !== null) throw new Error(`[e2e] 服务在用例执行期间退出（${child.exitCode}）：\n${output.join('')}`);
    } finally {
      if (child.exitCode === null) {
        const exited = new Promise((resolve) => child.once('exit', resolve));
        child.kill('SIGTERM');
        const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
        await exited;
        clearTimeout(timer);
      }
    }
  },

  baseURL: async ({ e2eServer }, use) => {
    await use(e2eServer.url);
  },

  // 用例主体结束后，页面上可能仍有后台请求经过 route.fetch() 改写；页面关闭会让这些请求的响应失效，
  // 报出 “Response has been disposed”。按 Playwright 推荐做法在收尾时卸载路由并忽略其错误，
  // 仅影响用例结束之后的处理器，不掩盖用例执行期间的失败。
  page: async ({ page }, use) => {
    await use(page);
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  },
});

export { expect };
