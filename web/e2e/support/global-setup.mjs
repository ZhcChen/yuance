// e2e 全局准备：只执行一次。
// 1. 构建 Web 产物与 yuance-api / yuance-agent 二进制（设置 YUANCE_E2E_SKIP_BUILD=1 可跳过，复用已有产物）。
// 2. 生成模板数据库（迁移 + 演示数据 + 通知与当前项目种子），各 worker 复制后启动独立服务，互不共享数据。
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

import { apiBinary, artifactsRoot, repoRoot, runOrThrow, serverEnv, templateDbName, templateDir } from './environment.mjs';

export default async function globalSetup() {
  if (process.env.YUANCE_E2E_SKIP_BUILD !== '1') {
    runOrThrow('npm', ['--prefix', 'web', 'run', 'build'], { cwd: repoRoot, stdio: 'inherit' });
    runOrThrow('cargo', ['build', '-p', 'yuance-api', '-p', 'yuance-agent'], { cwd: repoRoot, stdio: 'inherit' });
  }
  if (!existsSync(apiBinary)) {
    throw new Error(`[e2e] 缺少 ${apiBinary}，请先执行 cargo build -p yuance-api -p yuance-agent 或去掉 YUANCE_E2E_SKIP_BUILD`);
  }

  mkdirSync(artifactsRoot, { recursive: true });
  rmSync(templateDir, { recursive: true, force: true });
  mkdirSync(templateDir, { recursive: true });
  const env = serverEnv(templateDir, 0);
  runOrThrow(apiBinary, ['migrate', 'up'], { cwd: repoRoot, env });
  runOrThrow(apiBinary, ['seed', 'demo'], { cwd: repoRoot, env });
  for (const seed of ['seed-notifications.sql', 'seed-current-project.sql']) {
    runOrThrow('sqlite3', [path.join(templateDir, templateDbName), `.read ${path.join(repoRoot, 'scripts', 'e2e', seed)}`], { cwd: repoRoot });
  }
  // 合并 WAL，确保 worker 只复制主库文件即可得到完整数据。
  runOrThrow('sqlite3', [path.join(templateDir, templateDbName), 'PRAGMA wal_checkpoint(TRUNCATE);'], { cwd: repoRoot });
}
