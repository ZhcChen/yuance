#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { validationOrigins, developmentEnvironment } = require('./local-environment.cjs');

const root = path.resolve(__dirname, '../..');
const state = path.join(root, '.local/development');
const dockerData = path.join(state, 'docker-data');
const env = developmentEnvironment(process.env, state);
const ports = validationOrigins(env);
const origin = `http://127.0.0.1:${ports[0]}`;
const image = process.env.YUANCE_DEV_IMAGE || 'yuance-api:local';
const validation = path.join(root, 'scripts/local-validation.sh');
const dockerCli = path.join(__dirname, 'local-docker.cjs');
const composeFile = path.join(root, 'deploy/local/compose.yaml');
const composeEnv = path.join(state, 'docker.env');
const project = `yuance-local-${createHash('sha256').update(fs.realpathSync(root)).digest('hex').slice(0, 12)}`;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, env, encoding: 'utf8', stdio: 'inherit', ...options });
  if (result.error || result.status !== 0) {
    throw new Error(`${path.basename(command)} 执行失败${result.error ? `：${result.error.message}` : `（${result.status ?? result.signal}）`}`);
  }
  return result.stdout?.trim();
}

function docker(args, options) { return run(process.execPath, [dockerCli, ...args], options); }
function compose(args, options) {
  return docker(['compose', '--project-name', project, '--env-file', composeEnv, '-f', composeFile, ...args], options);
}

function prepareDocker() {
  run('bash', [validation, 'prepare']);
  if (fs.existsSync(dockerData) && fs.lstatSync(dockerData).isSymbolicLink()) throw new Error('容器数据目录不得为符号链接。');
  fs.mkdirSync(dockerData, { recursive: true, mode: 0o700 });
  fs.chmodSync(dockerData, 0o700);
  if (fs.existsSync(composeEnv) && fs.lstatSync(composeEnv).isSymbolicLink()) throw new Error('Docker 环境文件不得为符号链接。');
  const runtime = fs.readFileSync(path.join(state, 'runtime.env'), 'utf8').trim();
  // Compose 使用字面引号保护目录中的空格和 $；密钥仅来源于本地生成文件。
  const quote = (value) => {
    if (/[\r\n']/.test(value)) throw new Error('本地 Docker 配置包含不支持的字符。');
    return `'${value}'`;
  };
  fs.writeFileSync(composeEnv, `${runtime}\nYUANCE_LOCAL_DATA_DIR=${quote(dockerData)}\nYUANCE_LOCAL_API_PORT=${ports[0]}\nYUANCE_LOCAL_IMAGE=${quote(image)}\n`, { mode: 0o600 });
  fs.chmodSync(composeEnv, 0o600);
}

async function assertPortFree() {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () => reject(new Error(`API 端口 ${ports[0]} 已占用；请先停止原生 API 或开发容器。`)));
    server.listen(ports[0], '127.0.0.1', () => server.close(resolve));
  });
}

async function waitReady() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${origin}/api/readyz`, { signal: AbortSignal.timeout(1000) });
      const body = await response.json();
      if (response.ok && body.data?.service === 'yuance-api' && body.data?.status === 'ready' && body.data?.environment === 'development') {
        console.log(`开发容器已就绪：${origin}/web`);
        return;
      }
    } catch { /* 容器可能仍在启动。 */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('开发容器未就绪；使用 make dev-docker-logs 排查，数据已保留。');
}

function dockerDoctor() {
  docker(['version', '--format', 'Docker server={{.Server.Version}} platform={{.Server.Os}}/{{.Server.Arch}}']);
  docker(['buildx', 'inspect']);
  docker(['compose', 'version']);
}

function doctor() {
  let failed = false;
  const versionAtLeast = (version, minimum) => {
    const current = version.split('.').map(Number);
    const required = minimum.split('.').map(Number);
    for (let index = 0; index < 3; index += 1) {
      if ((current[index] || 0) !== (required[index] || 0)) return (current[index] || 0) > (required[index] || 0);
    }
    return true;
  };
  if (!versionAtLeast(process.versions.node, '22.12.0')) {
    console.error('Node.js 至少需要 22.12.0。'); failed = true;
  }
  for (const [command, args] of [['node', ['--version']], ['npm', ['--version']], ['cargo', ['--version']], ['rustc', ['--version']], ['openssl', ['version']], ['sqlite3', ['--version']], ['curl', ['--version']], ['lsof', ['-v']]]) {
    const result = spawnSync(command, args, { env, encoding: 'utf8', timeout: 15000 });
    if (result.error || result.status !== 0) { console.error(`缺少或不可用：${command}`); failed = true; }
    else {
      console.log(`${command}：${result.stdout.trim().split('\n')[0] || '可用'}`);
      if (command === 'rustc') {
        const required = fs.readFileSync(path.join(root, 'api/Cargo.toml'), 'utf8').match(/rust-version\s*=\s*"([0-9.]+)"/)?.[1];
        const actual = result.stdout.match(/rustc ([0-9.]+)/)?.[1];
        if (!required || !actual || !versionAtLeast(actual, required)) {
          console.error(`Rust 版本不满足 api/Cargo.toml（${required || '无法读取'}）。`); failed = true;
        }
      }
    }
  }
  for (const directory of ['frontend', 'web', 'desktop']) {
    if (!fs.existsSync(path.join(root, directory, 'node_modules'))) { console.error(`${directory} 依赖未安装，请执行 make dev-setup。`); failed = true; }
  }
  console.log(`API ${origin}；Web http://127.0.0.1:${ports[1]}/web；Desktop renderer http://127.0.0.1:${ports[2]}`);
  console.log('Docker 为可选开发方式；使用 make dev-docker-doctor 独立检查。');
  if (failed) throw new Error('开发依赖检查未通过。');
}

async function main() {
  const command = process.argv[2] || 'help';
  if (process.argv.length > 3) throw new Error('开发入口不接受额外位置参数；端口/context/image 通过文档中的环境变量配置。');
  switch (command) {
    case 'doctor': doctor(); break;
    case 'setup':
      for (const directory of ['frontend', 'web', 'desktop']) run('npm', ['--prefix', directory, 'ci']);
      break;
    case 'prepare': case 'seed': case 'api': case 'web': case 'desktop': case 'status':
      run('bash', [validation, command]);
      break;
    case 'check': run('npm', ['run', 'check:frontend']); break;
    case 'docker-doctor': dockerDoctor(); break;
    case 'docker-build': {
      const platform = docker(['version', '--format', '{{.Server.Os}}/{{.Server.Arch}}'], { stdio: ['ignore', 'pipe', 'inherit'] });
      run('sh', ['scripts/build-api-image-amd64.sh'], { env: { ...env, YUANCE_LOCAL_DOCKER: '1', YUANCE_API_IMAGE: image, YUANCE_API_PLATFORM: platform, YUANCE_API_IMAGE_TAR: '.local/images/yuance-api-native.tar' } });
      break;
    }
    case 'docker-up': {
      prepareDocker();
      const running = compose(['ps', '--status', 'running', '--quiet', 'api'], { stdio: ['ignore', 'pipe', 'inherit'] });
      if (running) {
        const expectedImage = docker(['image', 'inspect', image, '--format', '{{.Id}}'], { stdio: ['ignore', 'pipe', 'inherit'] });
        const currentImage = docker(['inspect', running, '--format', '{{.Image}}'], { stdio: ['ignore', 'pipe', 'inherit'] });
        const binding = docker(['port', running, '33033/tcp'], { stdio: ['ignore', 'pipe', 'inherit'] });
        if (expectedImage !== currentImage || binding !== `127.0.0.1:${ports[0]}`) {
          throw new Error('开发镜像或端口已变化；先执行 make dev-docker-down 再 up，数据不会删除。');
        }
        await waitReady();
        break;
      }
      await assertPortFree();
      docker(['image', 'inspect', image], { stdio: 'ignore' });
      const pending = path.join(dockerData, '.bootstrap-pending');
      if (!fs.existsSync(path.join(dockerData, 'yuance.sqlite3')) && !fs.existsSync(pending)) {
        fs.writeFileSync(pending, '', { flag: 'wx', mode: 0o600 });
      }
      compose(['run', '--rm', '--no-deps', 'api', './yuance-api', 'migrate', 'up']);
      compose(['run', '--rm', '--no-deps', 'api', './yuance-api', 'seed', 'core']);
      if (fs.existsSync(pending)) {
        compose(['run', '--rm', '--no-deps', 'api', './yuance-api', 'seed', 'local-admin']);
        fs.unlinkSync(pending);
      }
      compose(['up', '-d', '--wait', '--wait-timeout', '60', 'api']);
      await waitReady();
      break;
    }
    case 'docker-down': case 'docker-logs': case 'docker-status':
      if (!fs.existsSync(composeEnv)) throw new Error('开发容器尚未初始化；先执行 make dev-docker-up。');
      compose(command === 'docker-down' ? ['down'] : command === 'docker-logs' ? ['logs', '--tail', '100', 'api'] : ['ps']);
      break;
    case 'docker-smoke':
      run('sh', ['scripts/smoke-web-app-image.sh'], { env: { ...env, YUANCE_LOCAL_DOCKER: '1', YUANCE_API_IMAGE: image, YUANCE_WEB_SMOKE_CONTAINER_PREFIX: `${project}-smoke`, YUANCE_WEB_SMOKE_ROOT: '.artifacts/local-dev-image-smoke', YUANCE_WEB_SMOKE_SESSION_SECRET: 'local-image-smoke-session', YUANCE_WEB_SMOKE_MASTER_KEY: 'local-image-smoke-storage-key' } });
      break;
    case 'help':
      console.log('本地开发：doctor | setup | prepare | seed | api | web | desktop | status | check');
      console.log('本机 Docker：docker-doctor | docker-build | docker-up | docker-down | docker-logs | docker-status | docker-smoke');
      break;
    default: throw new Error(`未知开发命令：${command}`);
  }
}

if (require.main === module) {
  main().catch((error) => { console.error(`[local-dev] ${error.message}`); process.exitCode = 1; });
}

module.exports = { main, project };
