import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const makefile = readFileSync(path.join(repoRoot, 'Makefile'), 'utf8');
const failures = [];

for (const target of ['crg.build', 'crg.update', 'crg.status', 'crg.review', 'crg.guard']) {
  if (!new RegExp(`^${target.replaceAll('.', '\\.')}:`, 'm').test(makefile)) {
    failures.push(`Makefile 缺少目标 ${target}`);
  }
}

try {
  execFileSync('git', ['check-ignore', '-q', '.code-review-graph/graph.db'], {
    cwd: repoRoot,
    stdio: 'ignore',
  });
} catch {
  failures.push('.code-review-graph/graph.db 未被 Git 忽略');
}

for (const target of ['frontend-check', 'web-build', 'deploy-production']) {
  let dryRun;
  try {
    dryRun = execFileSync('make', [target, '-n'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    failures.push(`无法检查 ${target} 默认链: ${error.message}`);
    continue;
  }
  if (/\bcrg\b|code-review-graph/i.test(dryRun)) {
    failures.push(`${target} 默认链意外包含 CRG`);
  }
}

if (failures.length > 0) {
  console.error('[crg.guard] 失败：');
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log('[crg.guard] 通过：CRG 入口存在、图数据被忽略、默认链不含 CRG');
