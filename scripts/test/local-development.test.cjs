'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const vm = require('node:vm');
const { localCommand } = require('../ops/local-docker.cjs');
const { validationOrigins, developmentEnvironment } = require('../ops/local-environment.cjs');

function dockerFixture(host = 'unix:///tmp/docker.sock', description = 'Driver: docker\nEndpoint: local\n') {
  return (args, env) => {
    assert.equal(env.DOCKER_HOST, undefined);
    assert.equal(env.DOCKER_CONTEXT, undefined);
    assert.equal(env.BUILDX_BUILDER, undefined);
    if (args[0] === 'context' && args[1] === 'show') return 'local\n';
    if (args[0] === 'context' && args[1] === 'inspect') return JSON.stringify([{ Endpoints: { docker: { Host: host } } }]);
    return description;
  };
}

test('本地操作隔离远程环境，不修改父环境或沿用全局 builder', () => {
  const env = { DOCKER_HOST: 'ssh://remote', DOCKER_CONTEXT: 'remote', BUILDX_BUILDER: 'remote', PATH: '/bin' };
  const command = localCommand(['buildx', 'build', '.'], env, dockerFixture());
  assert.deepEqual(command.args, ['--context', 'local', 'buildx', '--builder', 'local', 'build', '.']);
  assert.equal(env.DOCKER_HOST, 'ssh://remote');
  assert.equal(command.env.PATH, '/bin');
});

test('拒绝 SSH/TCP context 和远程、多节点或其他 driver builder', () => {
  for (const host of ['ssh://remote', 'tcp://127.0.0.1:2375', 'tcp://remote:2376']) {
    assert.throws(() => localCommand(['run', 'image'], {}, dockerFixture(host)), /非本机/);
  }
  for (const description of ['Driver: docker\nEndpoint: remote\n', 'Driver: docker\nEndpoint: local\nEndpoint: remote\n', 'Driver: docker-container\nEndpoint: local\n']) {
    assert.throws(() => localCommand(['buildx', 'build', '.'], {}, dockerFixture(undefined, description)), /builder/);
  }
});

test('禁止通过参数绕过本机选择，但可显式选择本机 context', () => {
  for (const arg of ['--context=remote', '-cremote', '--host', '-Hssh://remote', '--builder=remote', '--config=/tmp/alternate']) {
    assert.throws(() => localCommand([arg], {}, dockerFixture()), /禁止覆盖/);
  }
  assert.equal(localCommand(['info'], { YUANCE_LOCAL_DOCKER_CONTEXT: 'local' }, dockerFixture()).context, 'local');
  assert.throws(() => localCommand(['context', 'use', 'remote'], {}, dockerFixture()), /全局/);
  assert.throws(() => localCommand(['buildx', 'use', 'remote'], {}, dockerFixture()), /全局/);
  assert.throws(() => localCommand(['buildx', 'inspect', 'remote', '--bootstrap'], {}, dockerFixture()), /替代 builder/);
  assert.throws(() => localCommand(['build', '.'], {}, dockerFixture()), /builder 校验/);
  assert.throws(() => localCommand(['compose', 'up', '--build'], {}, dockerFixture()), /builder 校验/);
});

test('开发 origin 拒绝远程、通配、路径、认证、非法端口及端口重叠', () => {
  assert.deepEqual(validationOrigins({}), [33133, 33134, 33135]);
  for (const origin of ['https://127.0.0.1:33133', 'http://remote:33133', 'http://0.0.0.0:33133', 'http://127.0.0.1:0', 'http://127.0.0.1:65536', 'http://127.0.0.1:33133/path', 'http://user@127.0.0.1:33133']) {
    assert.throws(() => validationOrigins({ YUANCE_VALIDATION_API_ORIGIN: origin }));
  }
  assert.throws(() => validationOrigins({ YUANCE_VALIDATION_WEB_ORIGIN: 'http://127.0.0.1:33133' }), /重叠/);
});

test('开发环境移除 Compose 优先级更高的正式密钥及目录覆盖', () => {
  const inherited = { YUANCE_SESSION_SECRET: 'production', YUANCE_SECURITY_MASTER_KEY: 'production', YUANCE_FILE_MASTER_KEY: 'production', YUANCE_LOCAL_DATA_DIR: '/srv/data', YUANCE_LOCAL_IMAGE: 'production:latest', PATH: '/bin' };
  const env = developmentEnvironment(inherited, '/tmp/local');
  for (const key of Object.keys(inherited).filter((key) => key !== 'PATH')) assert.equal(env[key], undefined);
  assert.equal(env.YUANCE_VALIDATION_STATE_DIR, '/tmp/local');
  assert.equal(inherited.YUANCE_SESSION_SECRET, 'production');
});

test('旧验收入口保留本地密钥，seed 覆盖继承环境且不自动用于 prepare', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yuance-local-test-'));
  try {
    const bin = path.join(root, 'bin');
    const state = path.join(root, 'state');
    const log = path.join(root, 'calls');
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'cargo'), '#!/bin/sh\ntest "$YUANCE_ENV" = development || exit 5\ntest "$YUANCE_FILE_MASTER_KEY" = "" || exit 6\ntest "$YUANCE_SESSION_SECRET" != inherited || exit 7\ntest "$YUANCE_SECURITY_MASTER_KEY" != inherited || exit 8\nprintf "%s\\n" "$*" >> "$LOCAL_TEST_LOG"\n', { mode: 0o700 });
    fs.writeFileSync(path.join(bin, 'lsof'), '#!/bin/sh\nexit 1\n', { mode: 0o700 });
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, LOCAL_TEST_LOG: log, YUANCE_VALIDATION_STATE_DIR: state, YUANCE_SESSION_SECRET: 'inherited', YUANCE_SECURITY_MASTER_KEY: 'inherited', YUANCE_FILE_MASTER_KEY: 'inherited' };
    const script = path.resolve(__dirname, '../local-validation.sh');
    const prepare = spawnSync('bash', [script, 'prepare'], { env, encoding: 'utf8' });
    assert.equal(prepare.status, 0, prepare.stderr);
    assert.equal(fs.existsSync(log), false);
    const keys = fs.readFileSync(path.join(state, 'runtime.env'), 'utf8');
    assert.equal(fs.statSync(path.join(state, 'runtime.env')).mode & 0o777, 0o600);
    const seed = spawnSync('bash', [script, 'seed'], { env, encoding: 'utf8' });
    assert.equal(seed.status, 0, seed.stderr);
    assert.match(fs.readFileSync(log, 'utf8'), /migrate up\n.*seed core\n.*seed local-admin/s);
    assert.equal(fs.readFileSync(path.join(state, 'runtime.env'), 'utf8'), keys);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

function developmentFixture(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yuance-dev-lifecycle-'));
  const calls = [];
  let failCore = options.failCore;
  const state = path.join(root, '.local/development');
  const module = { exports: {} };
  function spawn(command, args) {
    if (command === 'bash') {
      fs.mkdirSync(state, { recursive: true });
      const runtime = path.join(state, 'runtime.env');
      if (!fs.existsSync(runtime)) fs.writeFileSync(runtime, 'YUANCE_SESSION_SECRET=local\nYUANCE_SECURITY_MASTER_KEY=local\n');
      return { status: 0, stdout: '' };
    }
    const docker = args.slice(1);
    if (docker[0] === 'compose') {
      const operation = docker.slice(docker.indexOf('-f') + 2);
      calls.push(operation);
      if (operation[0] === 'ps') return { status: 0, stdout: options.running ? 'container\n' : '' };
      if (operation.includes('migrate')) fs.writeFileSync(path.join(state, 'docker-data/yuance.sqlite3'), 'fixture');
      if (operation.includes('core') && failCore) { failCore = false; return { status: 1, stdout: '' }; }
      return { status: 0, stdout: '' };
    }
    if (docker[0] === 'image') return { status: 0, stdout: 'new-image' };
    if (docker[0] === 'inspect') return { status: 0, stdout: options.oldImage ? 'old-image' : 'new-image' };
    if (docker[0] === 'port') return { status: 0, stdout: options.oldPort ? '127.0.0.1:33136' : '127.0.0.1:33133' };
    throw new Error(`未预期的测试命令：${docker}`);
  }
  const sandbox = {
    __dirname: path.join(root, 'scripts/ops'), module,
    process: { env: {}, argv: ['node', 'local-dev.cjs', 'docker-up'], execPath: process.execPath },
    console: { log() {}, error() {} }, setTimeout, AbortSignal,
    fetch: async () => ({ ok: true, json: async () => ({ data: { service: 'yuance-api', status: 'ready', environment: 'development' } }) }),
    require: (name) => {
      if (name === 'node:child_process') return { spawnSync: spawn };
      if (name === 'node:net') return { createServer: () => ({ once() {}, listen(_port, _host, ready) { ready(); }, close(done) { done(); } }) };
      if (name === './local-environment.cjs') return require('../ops/local-environment.cjs');
      return require(name);
    },
  };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../ops/local-dev.cjs'), 'utf8'), sandbox);
  return { ...module.exports, calls, state, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

test('首次 seed 中断后重试完成管理员初始化，随后不重复重置密码', async () => {
  const fixture = developmentFixture({ failCore: true });
  try {
    await assert.rejects(fixture.main(), /执行失败/);
    assert.equal(fs.existsSync(path.join(fixture.state, 'docker-data/.bootstrap-pending')), true);
    await fixture.main();
    assert.equal(fixture.calls.filter((args) => args.includes('local-admin')).length, 1);
    assert.equal(fs.existsSync(path.join(fixture.state, 'docker-data/.bootstrap-pending')), false);
    await fixture.main();
    assert.equal(fixture.calls.filter((args) => args.includes('local-admin')).length, 1);
  } finally { fixture.cleanup(); }
});

test('重复 up 拒绝运行旧镜像或错误端口，避免将旧容器报告为新代码', async () => {
  for (const option of [{ oldImage: true }, { oldPort: true }]) {
    const fixture = developmentFixture({ running: true, ...option });
    try {
      await assert.rejects(fixture.main(), /镜像或端口已变化/);
      assert.equal(fixture.calls.some((args) => args.includes('migrate')), false);
    } finally { fixture.cleanup(); }
  }
});

test('不同 checkout 的 Compose 项目名彼此隔离', () => {
  const first = developmentFixture();
  const second = developmentFixture();
  try { assert.notEqual(first.project, second.project); }
  finally { first.cleanup(); second.cleanup(); }
});
