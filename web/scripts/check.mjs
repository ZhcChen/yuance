// web 全量检查：源码约束、类型检查、lint、单元测试并行执行（检查项与原串行脚本一致）。
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runTasks } from '../../scripts/lib/run-tasks.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bin = (name) => path.join(root, 'node_modules', '.bin', name);
const cacheDir = path.join(root, 'node_modules', '.cache');

await runTasks([
  { name: 'web 源码约束', command: process.execPath, args: ['./scripts/assert-js-only.mjs'], cwd: root },
  { name: 'web 类型检查', command: bin('tsc'), args: ['-p', 'jsconfig.json', '--incremental', '--tsBuildInfoFile', path.join(cacheDir, 'tsconfig.tsbuildinfo')], cwd: root },
  { name: 'web lint', command: bin('eslint'), args: ['--cache', '--cache-location', path.join(cacheDir, '.eslintcache'), 'src/**/*.{js,jsx}', 'test/**/*.mjs', 'scripts/**/*.mjs', 'vite.config.js', 'eslint.config.js'], cwd: root },
  { name: 'web 单元测试', command: process.execPath, args: ['--test', 'test/**/*.test.mjs'], cwd: root },
], { title: 'web 检查' });
