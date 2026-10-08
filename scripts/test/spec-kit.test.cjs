'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { test } = require('node:test');

const repo = path.resolve(__dirname, '../..');
const entry = path.join(repo, 'scripts/ops/spec-kit.cjs');

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'yuance-spec-kit-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const directory of ['scripts', 'templates', 'memory']) {
    fs.cpSync(path.join(repo, '.specify', directory), path.join(root, '.specify', directory), { recursive: true });
  }
  return root;
}

function write(root, name, content) {
  const directory = path.join(root, 'specs/001-example');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, name), content);
}

function complete(root) {
  write(root, 'spec.md', '# 测试需求\n\n## 功能要求\n- FR-001：实现需求\n');
  write(root, 'plan.md', '# 实施方案\n\n## 验证与验收\n运行聚焦测试\n');
  write(root, 'tasks.md', '# 任务\n- [X] T001 FR-001 实现功能\n- [ ] T002 FR-001 验证功能\n');
}

function run(root, args) {
  return spawnSync(process.execPath, [entry, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, SPECIFY_INIT_DIR: '/invalid-project', SPECIFY_FEATURE_DIRECTORY: 'specs/stale' },
  });
}

function check(root, stage = 'implement') {
  return run(root, ['check', '--feature', 'specs/001-example', '--stage', stage]);
}

test('阶段检查始终定位显式需求目录且不改写指针或任务', t => {
  const root = fixture(t);
  complete(root);
  const pointer = path.join(root, '.specify/feature.json');
  fs.writeFileSync(pointer, '{"feature_directory":"specs/other"}\n');
  const pointerBefore = fs.readFileSync(pointer, 'utf8');
  const tasksBefore = fs.readFileSync(path.join(root, 'specs/001-example/tasks.md'), 'utf8');

  for (const stage of ['clarify', 'plan', 'tasks', 'analyze', 'implement', 'converge']) {
    const result = check(root, stage);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.FEATURE_DIR, path.join(root, 'specs/001-example'));
    assert.equal('BRANCH' in output, false, '工作流入口不应把当前分支暴露为需求目录');
    assert.ok(output.REQUIRED_READS.includes(path.join(root, 'specs/001-example/spec.md')));
  }
  assert.equal(fs.readFileSync(pointer, 'utf8'), pointerBefore);
  assert.equal(fs.readFileSync(path.join(root, 'specs/001-example/tasks.md'), 'utf8'), tasksBefore);
});

test('按阶段验证输入并拒绝空产物、模板残留、未决澄清和重复任务', t => {
  const root = fixture(t);
  write(root, 'spec.md', '# 需求\nFR-001 需求\n');
  assert.equal(check(root, 'plan').status, 0);
  assert.notEqual(check(root, 'tasks').status, 0);
  write(root, 'plan.md', '# 方案\n## 验证\n运行聚焦测试\n');
  assert.equal(check(root, 'tasks').status, 0);
  assert.notEqual(check(root, 'implement').status, 0);

  const cases = [
    ['plan.md', ' \n', '产物为空'],
    ['plan.md', '# 方案\n## 验证\n<!-- 未完成 -->\n', '只有标题或注释'],
    ['tasks.md', '# 任务\n- [ ] T001 [待填写任务]\n', '未填写模板'],
    ['spec.md', '# 需求\nFR-001 NEEDS CLARIFICATION\n', '未解决澄清'],
    ['spec.md', '# 需求\n无编号要求\n', 'FR-编号'],
    ['plan.md', '# 方案\n没有检查章节\n', '验证章节'],
    ['tasks.md', '# 任务\n- [ ] T001 实现\n- [X] T001 验证\n', '重复任务编号'],
    ['tasks.md', '# 任务\n- [ ] T001 实现\n', '验证任务'],
  ];
  for (const [name, content, error] of cases) {
    complete(root);
    write(root, name, content);
    const result = check(root);
    assert.notEqual(result.status, 0);
    assert.ok(result.stderr.includes(error), result.stderr);
  }

  complete(root);
  write(root, 'spec.md', '# 需求\nFR-001 [NEEDS CLARIFICATION: 业务决策]\n');
  assert.equal(check(root, 'clarify').status, 0);
  assert.notEqual(check(root, 'plan').status, 0);
  write(root, 'spec.md', '# 需求\nFR-001 已确定要求\n已解决：NEEDS CLARIFICATION 旧问题\n```text\n[待填写示例]\n```\n');
  assert.equal(check(root).status, 0);
});

test('初始化使用项目覆盖模板，重复调用读取现有内容而不覆盖', t => {
  const root = fixture(t);
  const args = ['init', '--feature', 'specs/001-example'];
  const initial = run(root, args);
  assert.equal(initial.status, 0, initial.stderr);
  assert.equal(JSON.parse(initial.stdout).EXISTING, false);
  const spec = path.join(root, 'specs/001-example/spec.md');
  assert.ok(fs.readFileSync(spec, 'utf8').includes('风险与验证要求'));
  assert.notEqual(check(root, 'plan').status, 0, '初始化草稿不能作为就绪规格');

  complete(root);
  const names = ['spec.md', 'plan.md', 'tasks.md'];
  const before = names.map(name => fs.readFileSync(path.join(root, 'specs/001-example', name), 'utf8'));
  const again = run(root, args);
  assert.equal(again.status, 0, again.stderr);
  assert.equal(JSON.parse(again.stdout).EXISTING, true);
  assert.deepEqual(JSON.parse(again.stdout).REQUIRED_READS, names.map(name => path.join(root, 'specs/001-example', name)));
  assert.deepEqual(names.map(name => fs.readFileSync(path.join(root, 'specs/001-example', name), 'utf8')), before);
  assert.equal(fs.existsSync(path.join(root, '.specify/feature.json')), false);
});

test('不能用缺失规格覆盖已存在的旧计划或任务', t => {
  const root = fixture(t);
  write(root, 'tasks.md', '# 原有任务\n- [X] T001 验证\n');
  const result = run(root, ['init', '--feature', 'specs/001-example']);
  assert.notEqual(result.status, 0);
  assert.ok(result.stderr.includes('已有计划或任务'));
  assert.equal(fs.existsSync(path.join(root, 'specs/001-example/spec.md')), false);
});

test('并发初始化采用排他创建，不覆盖另一个进程的规格', async t => {
  const root = fixture(t);
  const invoke = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry, 'init', '--feature', 'specs/001-example'], { cwd: root });
    let stderr = '';
    child.stderr.on('data', data => { stderr += data; });
    child.on('error', reject);
    child.on('close', status => resolve({ status, stderr }));
  });
  const results = await Promise.all([invoke(), invoke()]);
  assert.ok(results.some(result => result.status === 0));
  for (const result of results) {
    if (result.status !== 0) assert.match(result.stderr, /EEXIST/);
  }
  const expected = fs.readFileSync(path.join(root, '.specify/templates/overrides/spec-template.md'), 'utf8');
  assert.equal(fs.readFileSync(path.join(root, 'specs/001-example/spec.md'), 'utf8'), expected);
  assert.equal(fs.existsSync(path.join(root, '.specify/feature.json')), false);
});

test('拒绝隐式需求、越界路径、未知阶段及目录或产物符号链接', t => {
  const root = fixture(t);
  for (const feature of ['/tmp/feature', '../feature', 'specs/../feature', 'specs/a/b', 'specs/Bad_name']) {
    assert.notEqual(run(root, ['init', '--feature', feature]).status, 0);
  }
  assert.notEqual(run(root, ['init']).status, 0);
  assert.notEqual(check(root, 'unknown').status, 0);

  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'yuance-spec-outside-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.symlinkSync(outside, path.join(root, 'specs'), 'dir');
  assert.notEqual(run(root, ['init', '--feature', 'specs/001-example']).status, 0);
  assert.deepEqual(fs.readdirSync(outside), []);

  fs.unlinkSync(path.join(root, 'specs'));
  fs.mkdirSync(path.join(root, 'specs'));
  fs.symlinkSync(outside, path.join(root, 'specs/001-example'), 'dir');
  assert.notEqual(run(root, ['init', '--feature', 'specs/001-example']).status, 0);
  fs.unlinkSync(path.join(root, 'specs/001-example'));
  fs.mkdirSync(path.join(root, 'specs/001-example'), { recursive: true });
  fs.symlinkSync(path.join(root, 'missing-spec'), path.join(root, 'specs/001-example/spec.md'));
  assert.notEqual(check(root, 'clarify').status, 0);
});

test('拒绝 .specify 根目录、被调用脚本和模板的符号链接', t => {
  const root = fixture(t);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'yuance-spec-assets-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  const specify = path.join(root, '.specify');
  const saved = path.join(root, '.specify-saved');

  fs.renameSync(specify, saved);
  fs.symlinkSync(outside, specify, 'dir');
  assert.notEqual(run(root, ['init', '--feature', 'specs/001-example']).status, 0);
  fs.unlinkSync(specify);
  fs.renameSync(saved, specify);

  const external = path.join(outside, 'external.sh');
  fs.writeFileSync(external, '#!/usr/bin/env bash\nexit 0\n');
  for (const name of ['common.sh', 'setup-plan.sh']) {
    const script = path.join(specify, 'scripts/bash', name);
    const originalScript = `${script}.saved`;
    fs.renameSync(script, originalScript);
    fs.symlinkSync(external, script);
    assert.notEqual(run(root, ['init', '--feature', 'specs/001-example']).status, 0);
    fs.unlinkSync(script);
    fs.renameSync(originalScript, script);
  }

  const template = path.join(specify, 'templates/spec-template.md');
  const originalTemplate = `${template}.saved`;
  fs.renameSync(template, originalTemplate);
  fs.symlinkSync(path.join(outside, 'external-template.md'), template);
  assert.notEqual(run(root, ['init', '--feature', 'specs/001-example']).status, 0);
});

test('上游 Skill 脚本显式绑定当前 FEATURE，忽略旧指针且不回写指针', t => {
  const root = fixture(t);
  complete(root);
  const pointer = path.join(root, '.specify/feature.json');
  const pointerContent = '{"feature_directory":"specs/009-stale"}\n';
  fs.writeFileSync(pointer, pointerContent);
  const env = {
    ...process.env,
    SPECIFY_INIT_DIR: root,
    SPECIFY_FEATURE_DIRECTORY: 'specs/001-example',
    SPECIFY_FEATURE_NO_PERSIST: '1',
  };

  for (const [script, args] of [
    ['setup-plan.sh', ['--json']],
    ['setup-tasks.sh', ['--json']],
    ['check-prerequisites.sh', ['--json', '--require-spec', '--require-tasks', '--include-tasks']],
    ['check-prerequisites.sh', ['--json', '--paths-only']],
  ]) {
    const result = spawnSync('bash', [path.join(root, '.specify/scripts/bash', script), ...args], {
      cwd: root,
      encoding: 'utf8',
      env,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).FEATURE_DIR, path.join(root, 'specs/001-example'));
  }
  assert.equal(fs.readFileSync(pointer, 'utf8'), pointerContent);

  const bare = spawnSync('bash', [path.join(root, '.specify/scripts/bash/setup-plan.sh'), '--json'], {
    cwd: root,
    encoding: 'utf8',
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('SPECIFY_'))),
  });
  assert.equal(bare.status, 0, bare.stderr);
  assert.equal(JSON.parse(bare.stdout).FEATURE_DIR, path.join(root, 'specs/009-stale'));
  assert.ok(fs.existsSync(path.join(root, 'specs/009-stale/plan.md')));
  fs.unlinkSync(pointer);

  const noPointer = spawnSync('bash', [path.join(root, '.specify/scripts/bash/setup-plan.sh'), '--json'], {
    cwd: root,
    encoding: 'utf8',
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('SPECIFY_'))),
  });
  assert.notEqual(noPointer.status, 0);
  assert.ok(noPointer.stderr.includes('Feature directory not found'));
});

test('上游 manifest 的受管理资产哈希匹配且 Bash 脚本语法和执行位有效', () => {
  for (const integration of ['codex', 'speckit']) {
    const manifest = JSON.parse(fs.readFileSync(path.join(repo, '.specify/integrations', `${integration}.manifest.json`), 'utf8'));
    assert.equal(manifest.version, '1.1.2');
    for (const [name, expected] of Object.entries(manifest.files)) {
      const file = path.join(repo, name);
      const actual = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
      assert.equal(actual, expected, `资产漂移：${name}`);
      if (name.endsWith('.sh')) {
        assert.ok(fs.statSync(file).mode & 0o111, `缺少执行位：${name}`);
        const result = spawnSync('bash', ['-n', file], { encoding: 'utf8' });
        assert.equal(result.status, 0, result.stderr);
      }
    }
  }
});

test('plan 和 tasks 覆盖模板可由上游解析', t => {
  const root = fixture(t);
  for (const name of ['plan', 'tasks']) {
    const result = spawnSync('bash', [path.join(root, '.specify/scripts/bash/resolve-template.sh'), `${name}-template`, '--json'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, SPECIFY_INIT_DIR: root },
    });
    assert.equal(result.status, 0, result.stderr);
    const content = JSON.parse(result.stdout).TEMPLATE_CONTENT;
    assert.ok(content.includes(name === 'plan' ? '验证与验收' : '必须包含匹配风险的验证任务'));
  }
});
