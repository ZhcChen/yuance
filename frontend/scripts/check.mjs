// frontend 全量检查：源码约束、包边界、各包类型检查 / lint / 单元测试并行执行。
// 与逐个 `npm run check` 覆盖的检查项完全一致，仅改为并行调度。
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runTasks } from '../../scripts/lib/run-tasks.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bin = (name) => path.join(root, 'node_modules', '.bin', name);
const node = process.execPath;
const cacheDir = path.join(root, 'node_modules', '.cache');

/** @type {import('../../scripts/lib/run-tasks.mjs').CheckTask[]} */
const tasks = [
  { name: 'frontend 源码约束', command: node, args: ['./scripts/assert-js-only.mjs', 'packages', 'scripts', 'test'], cwd: root },
  { name: 'frontend 包边界', command: node, args: ['./scripts/assert-package-boundaries.mjs'], cwd: root },
  { name: 'frontend lint', command: bin('eslint'), args: ['--cache', '--cache-location', path.join(cacheDir, '.eslintcache-root'), 'scripts/**/*.mjs', 'test/**/*.mjs', 'eslint.config.js'], cwd: root },
  { name: 'frontend 单元测试', command: node, args: ['--test', 'test/**/*.test.mjs'], cwd: root },
];

const packagesDir = path.join(root, 'packages');
/** 取脚本中双引号包裹的参数（lint / test 的文件模式），保持与 package.json 为唯一来源。 */
const quotedArgs = (script) => [...script.matchAll(/"([^"]+)"/gu)].map((match) => match[1]);
for (const name of readdirSync(packagesDir).sort()) {
  const cwd = path.join(packagesDir, name);
  const manifestPath = path.join(cwd, 'package.json');
  if (!existsSync(manifestPath)) continue;
  const scripts = JSON.parse(readFileSync(manifestPath, 'utf8')).scripts || {};
  for (const key of ['check:source', 'check:js', 'lint', 'test']) {
    if (!scripts[key]) throw new Error(`${name} 缺少 ${key} 脚本，无法生成检查任务`);
  }
  const [testCommand, ...testArgs] = scripts.test.split(/\s+/u);
  if (!['node', 'tsx'].includes(testCommand)) throw new Error(`${name} 的 test 脚本使用了未支持的运行器：${testCommand}`);
  tasks.push(
    { name: `${name} 源码约束`, command: node, args: scripts['check:source'].split(/\s+/u).slice(1), cwd },
    { name: `${name} 类型检查`, command: bin('tsc'), args: ['-p', 'jsconfig.json', '--incremental', '--tsBuildInfoFile', path.join(cacheDir, `tsconfig.${name}.tsbuildinfo`)], cwd },
    { name: `${name} lint`, command: bin('eslint'), args: ['--cache', '--cache-location', path.join(cacheDir, `.eslintcache-${name}`), ...quotedArgs(scripts.lint)], cwd },
    { name: `${name} 单元测试`, command: testCommand === 'tsx' ? bin('tsx') : node, args: testArgs, cwd },
  );
}

await runTasks(tasks, { title: 'frontend 检查' });
