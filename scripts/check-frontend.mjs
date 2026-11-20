// 根目录 `npm run check:frontend`：web 与 frontend 两套检查同时执行，各自内部再并行调度。
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(project) {
  return new Promise((resolve) => {
    const chunks = [];
    const child = spawn(process.execPath, ['./scripts/check.mjs'], { cwd: path.join(root, project), env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => chunks.push(chunk));
    child.on('close', (code) => resolve({ project, code: code ?? 1, output: Buffer.concat(chunks).toString('utf8') }));
  });
}

const results = await Promise.all(['web', 'frontend'].map(run));
for (const result of results) {
  process.stdout.write(`\n===== ${result.project} =====\n${result.output}`);
}
if (results.some((result) => result.code !== 0)) process.exitCode = 1;
