// e2e 运行环境的公共路径与进程工具，由 global-setup 与 worker fixture 共用。
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
// 每次运行使用独立数据目录（运行 ID 由配置文件在主进程设置，worker 继承），
// 避免两次 e2e 同时运行时互相删除模板库或数据目录。可用 YUANCE_WEB_E2E_ROOT 覆盖根目录。
export const runId = process.env.YUANCE_E2E_RUN_ID || String(process.pid);
export const artifactsRoot = path.join(process.env.YUANCE_WEB_E2E_ROOT || path.join(repoRoot, '.artifacts', 'web-e2e'), `run-${runId}`);
export const templateDir = path.join(artifactsRoot, 'template');
export const templateDbName = 'yuance.sqlite3';
export const apiBinary = path.join(repoRoot, 'target', 'debug', 'yuance-api');
export const webDistDir = process.env.YUANCE_WEB_DIST_DIR || path.join(repoRoot, 'web', 'dist');
export const host = process.env.YUANCE_WEB_E2E_HOST || '127.0.0.1';

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
