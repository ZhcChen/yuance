#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const stages = ['clarify', 'plan', 'tasks', 'analyze', 'implement', 'converge'];

function fail(message) {
  throw new Error(message);
}

function parse(argv) {
  const [command, ...args] = argv;
  if (!['init', 'check'].includes(command)) {
    fail('用法：spec-kit.cjs init|check --feature specs/<名称> [--stage clarify|plan|tasks|analyze|implement|converge]');
  }

  const options = { command };
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!['--feature', '--stage'].includes(key) || !value || options[key.slice(2)]) {
      fail(`无效或重复参数：${key}`);
    }
    options[key.slice(2)] = value;
  }

  if (!/^specs\/[a-z0-9][a-z0-9-]*$/.test(options.feature || '')) {
    fail('必须显式指定仓库内 specs/<名称>，名称仅使用小写字母、数字和连字符');
  }
  if (command === 'init' && options.stage) fail('init 不接受 --stage');
  if (command === 'check' && !stages.includes(options.stage)) fail('check 必须指定有效的 --stage');
  return options;
}

function lstatIfExists(file) {
  try {
    return fs.lstatSync(file);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function assertPathType(root, relative, type, required = true) {
  const file = path.join(root, relative);
  const stat = lstatIfExists(file);
  if (!stat) {
    if (required) fail(`缺少项目 Spec Kit 资产：${relative}`);
    return;
  }
  if (stat.isSymbolicLink()) fail(`Spec Kit 资产不得为符号链接：${relative}`);
  if (type === 'directory' ? !stat.isDirectory() : !stat.isFile()) {
    fail(`Spec Kit 资产类型错误：${relative}`);
  }
}

function validateSpecKitAssets(root) {
  for (const directory of [
    '.specify',
    '.specify/memory',
    '.specify/scripts',
    '.specify/scripts/bash',
    '.specify/templates',
  ]) {
    assertPathType(root, directory, 'directory');
  }
  assertPathType(root, '.specify/templates/overrides', 'directory', false);
  assertPathType(root, '.specify/memory/constitution.md', 'file');
  for (const script of [
    'common.sh',
    'check-prerequisites.sh',
    'create-new-feature.sh',
    'resolve-template.sh',
    'setup-plan.sh',
    'setup-tasks.sh',
  ]) {
    assertPathType(root, `.specify/scripts/bash/${script}`, 'file');
  }
  for (const template of ['spec-template.md', 'plan-template.md', 'tasks-template.md']) {
    assertPathType(root, `.specify/templates/${template}`, 'file');
    assertPathType(root, `.specify/templates/overrides/${template}`, 'file', false);
  }
}

function featurePath(root, feature) {
  validateSpecKitAssets(root);

  const directory = path.join(root, feature);
  for (const candidate of [path.join(root, 'specs'), directory]) {
    const stat = lstatIfExists(candidate);
    if (!stat) continue;
    if (stat.isSymbolicLink()) fail(`需求目录不得为符号链接：${candidate}`);
    if (!stat.isDirectory()) fail(`需求路径不是目录：${candidate}`);
  }
  for (const name of ['spec.md', 'plan.md', 'tasks.md']) {
    const stat = lstatIfExists(path.join(directory, name));
    if (stat && !stat.isFile()) fail(`产物必须为普通文件：${name}`);
  }
  return directory;
}

function readArtifact(root, directory, name, allowDraft) {
  const file = path.join(directory, name);
  assertPathType(root, 'specs', 'directory');
  assertPathType(root, path.relative(root, directory), 'directory');
  assertPathType(root, path.relative(root, file), 'file');
  const descriptor = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  let content;
  try {
    if (!fs.fstatSync(descriptor).isFile()) fail(`产物必须为普通文件：${name}`);
    content = fs.readFileSync(descriptor, 'utf8');
  } finally {
    fs.closeSync(descriptor);
  }
  if (!content.trim()) fail(`产物为空：${name}`);
  if (!/^#\s+\S/m.test(content)) fail(`产物缺少 Markdown 标题：${name}`);

  const prose = content
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^(```|~~~)[\s\S]*?^\1[^\n]*$/gm, '')
    .replace(/^\s*>.*$/gm, '');
  if (!prose.replace(/^#{1,6}\s+.*$/gm, '').trim()) fail(`产物只有标题或注释：${name}`);

  const unresolved = prose.split('\n').filter(line => {
    const historical = /^\s*(?:[-*]\s+)?(?:已解决|resolved)\s*[:：]/i.test(line);
    const markers = line.match(/NEEDS CLARIFICATION/gi) || [];
    return !historical || markers.length > 1;
  }).join('\n');
  const placeholders = /\[待填写[^\]]*\]|\[FEATURE NAME\]|\[DATE\]|\$ARGUMENTS/i.test(prose);
  if (!allowDraft && (placeholders || /NEEDS CLARIFICATION/i.test(unresolved))) {
    fail(`产物含未填写模板或未解决澄清：${name}`);
  }
  return content;
}

function runUpstream(root, script, args, feature) {
  validateSpecKitAssets(root);
  const result = spawnSync('bash', [path.join(root, '.specify/scripts/bash', script), ...args], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      SPECIFY_INIT_DIR: root,
      SPECIFY_FEATURE_DIRECTORY: feature,
      SPECIFY_FEATURE_NO_PERSIST: '1',
    },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) fail(result.stderr.trim() || `${script} 失败`);
  return JSON.parse(result.stdout);
}

function init(root, directory, feature) {
  const spec = path.join(directory, 'spec.md');
  if (fs.existsSync(spec)) {
    const reads = ['spec.md', 'plan.md', 'tasks.md']
      .map(name => path.join(directory, name))
      .filter(file => fs.existsSync(file));
    console.log(JSON.stringify({
      FEATURE_DIR: directory,
      FEATURE_SPEC: spec,
      EXISTING: true,
      REQUIRED_READS: reads,
      ACTION: '先读取已有产物并增量续写，不复制模板',
    }));
    return;
  }

  if (['plan.md', 'tasks.md'].some(name => fs.existsSync(path.join(directory, name)))) {
    fail('已有计划或任务但缺少规格，请先核实历史需求，不重新初始化');
  }

  const resolved = runUpstream(root, 'resolve-template.sh', ['spec-template', '--json'], feature);
  if (!resolved.TEMPLATE_CONTENT?.trim()) fail('规格模板为空');
  fs.mkdirSync(directory, { recursive: true });
  assertPathType(root, 'specs', 'directory');
  assertPathType(root, feature, 'directory');
  fs.writeFileSync(spec, resolved.TEMPLATE_CONTENT, { flag: 'wx' });
  console.log(JSON.stringify({ FEATURE_DIR: directory, FEATURE_SPEC: spec, EXISTING: false, REQUIRED_READS: [spec] }));
}

function check(root, directory, feature, stage) {
  const names = ['clarify', 'plan'].includes(stage)
    ? ['spec.md']
    : stage === 'tasks' ? ['spec.md', 'plan.md'] : ['spec.md', 'plan.md', 'tasks.md'];
  const contents = Object.fromEntries(names.map(name => [name, readArtifact(root, directory, name, stage === 'clarify')]));

  if (!/FR-\d+/.test(contents['spec.md'])) fail('spec.md 缺少稳定的 FR-编号');
  if (contents['plan.md'] && !/^#{1,6}\s+.*(?:验证|验收|Validation|Testing)/im.test(contents['plan.md'])) {
    fail('plan.md 缺少验证章节');
  }
  if (contents['tasks.md']) {
    const tasks = [...contents['tasks.md'].matchAll(/^- \[[ xX]\] (T\d+)\b(.*)$/gm)];
    if (!tasks.length) fail('tasks.md 缺少带 T编号 的任务');
    const ids = tasks.map(task => task[1]);
    if (new Set(ids).size !== ids.length) fail('tasks.md 存在重复任务编号');
    if (!tasks.some(task => /验证|验收|测试|\b(?:test|build|lint|typecheck)\b/i.test(task[2]))) {
      fail('tasks.md 缺少明确的验证任务');
    }
  }

  const early = ['clarify', 'plan'].includes(stage);
  const args = early ? ['--json', '--paths-only'] : ['--json', '--require-spec'];
  if (names.includes('tasks.md')) args.push('--require-tasks', '--include-tasks');
  const resolved = runUpstream(root, 'check-prerequisites.sh', args, feature);
  if (resolved.FEATURE_DIR !== directory) fail('上游脚本解析到错误的需求目录');
  delete resolved.BRANCH;

  const existing = ['spec.md', 'plan.md', 'tasks.md']
    .filter(name => fs.existsSync(path.join(directory, name)));
  const mode = ['plan', 'tasks'].includes(stage)
    ? (existing.includes(`${stage}.md`) ? 'update' : 'create')
    : 'check';
  console.log(JSON.stringify({
    ...resolved,
    STAGE: stage,
    MODE: mode,
    REQUIRED_READS: existing.map(name => path.join(directory, name)),
    NOTICE: '只通过结构检查；仍须读取产物、执行语义审查和真实验证',
  }));
}

try {
  const options = parse(process.argv.slice(2));
  const root = fs.realpathSync(process.cwd());
  const directory = featurePath(root, options.feature);
  if (options.command === 'init') init(root, directory, options.feature);
  else check(root, directory, options.feature, options.stage);
} catch (error) {
  console.error(`Spec Kit 检查失败：${error.message}`);
  process.exitCode = 1;
}
