// e2e 运行环境的公共路径与进程工具，由 global-setup 与 worker fixture 共用。
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
// 视觉回归等独立运行的配置可通过 YUANCE_WEB_E2E_ROOT / YUANCE_WEB_E2E_PORT_BASE 与功能 e2e 隔离。
export const artifactsRoot = process.env.YUANCE_WEB_E2E_ROOT || path.join(repoRoot, '.artifacts', 'web-e2e');
export const templateDir = path.join(artifactsRoot, 'template');
export const templateDbName = 'yuance.sqlite3';
export const apiBinary = path.join(repoRoot, 'target', 'debug', 'yuance-api');
export const webDistDir = process.env.YUANCE_WEB_DIST_DIR || path.join(repoRoot, 'web', 'dist');
export const host = process.env.YUANCE_WEB_E2E_HOST || '127.0.0.1';
export const portBase = Number.parseInt(process.env.YUANCE_WEB_E2E_PORT_BASE || '33100', 10);

/** 服务端运行所需环境变量；数据目录与端口按实例区分。 */
export function serverEnv(dataDir, port) {
  return {
    ...process.env,
    YUANCE_HTTP_ADDR: `${host}:${port}`,
    YUANCE_DATABASE_URL: `sqlite://${path.join(dataDir, templateDbName)}`,
    YUANCE_DATA_DIR: dataDir,
    YUANCE_ENV: 'test',
    YUANCE_SECURITY_MASTER_KEY: process.env.YUANCE_SECURITY_MASTER_KEY || 'test-master-key-that-is-long-enough',
    YUANCE_LOG_LEVEL: 'off',
    YUANCE_WEB_DIST_DIR: webDistDir,
  };
}

/** 同步执行命令，失败时抛出带输出的错误。 */
export function runOrThrow(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options });
  if (result.status !== 0) {
    throw new Error(`[e2e] 命令失败：${command} ${args.join(' ')}\n${result.stdout || ''}${result.stderr || ''}${result.error ? String(result.error) : ''}`);
  }
  return result;
}
