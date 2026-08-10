import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('main 视觉基线采集计划固定提交并隔离全部运行资源', () => {
  const result = spawnSync(process.execPath, ['./scripts/capture-main-visual-baseline.mjs', '--print-plan'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.baselineCommit, '6c0e56daa5460a9725ee00b8937124d390e9bd0b');
  assert.match(plan.worktree, /\.artifacts\/visual-parity\/runtime\/main-worktree$/);
  assert.match(plan.cargoTarget, /\.artifacts\/visual-parity\/runtime\/main-target$/);
  assert.match(plan.database, /\.artifacts\/visual-parity\/runtime\/main\.sqlite3$/);
  assert.match(plan.output, /\.artifacts\/visual-parity\/main$/);
  assert.match(plan.browserSession, /^yuance-main-visual-[0-9a-f]{12}$/);
  assert.ok(plan.port >= 34000 && plan.port <= 34999);
  assert.deepEqual(plan.viewports, ['390x844', '768x1024', '1280x800', '1440x900']);
  assert.equal(plan.browserMode, 'isolated-headed');
  assert.equal(plan.destructiveCleanup, false);
});

test('main 视觉基线采集脚本拒绝未知参数', () => {
  const result = spawnSync(process.execPath, ['./scripts/capture-main-visual-baseline.mjs', '--unknown'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /未知参数/);
});
