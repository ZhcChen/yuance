import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const baselineCommit = '6c0e56daa5460a9725ee00b8937124d390e9bd0b';
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const artifactRoot = resolve(repositoryRoot, '.artifacts/visual-parity');
const runtimeRoot = resolve(artifactRoot, 'runtime');
const worktree = resolve(runtimeRoot, 'main-worktree');
const cargoTarget = resolve(runtimeRoot, 'main-target');
const database = resolve(runtimeRoot, 'main.sqlite3');
const output = resolve(artifactRoot, 'main');
const browserSession = `yuance-main-visual-${baselineCommit.slice(0, 12)}`;
const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'wide', width: 1440, height: 900 },
];
const pages = [
  ['dashboard', '/web'], ['profile', '/web/me'], ['messages', '/web/messages'],
  ['search', '/web/search?q=YCE'], ['projects', '/web/projects'], ['project-detail', '/web/projects/YCE'],
  ['personal-analysis', '/web/projects/YCE/my-analysis'], ['requirements', '/web/requirements'],
  ['tasks', '/web/tasks'], ['bugs', '/web/bugs'], ['work-item-detail', '/web/work-items/YCE-TASK-2'],
  ['system', '/web/system'], ['system-users', '/web/system/users'], ['system-roles', '/web/system/roles'],
  ['system-permissions', '/web/system/permissions'], ['system-storage', '/web/system/storage'],
  ['system-openapi', '/web/system/openapi'], ['system-releases', '/web/system/releases'],
  ['system-database-stats', '/web/system/database-stats'], ['system-audit', '/web/system/audit'],
  ['system-api-docs', '/web/system/api-docs'],
];

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: repositoryRoot, encoding: 'utf8', stdio: 'pipe', ...options });
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(' ')} 执行失败\n${result.stderr || result.stdout}`);
  }
  return result;
}

function browser(args, options = {}) {
  return run('agent-browser', ['--session', browserSession, '--headed', ...args], options);
}

async function availablePort() {
  for (let port = 34000; port <= 34999; port += 1) {
    const free = await new Promise((resolvePort) => {
      const server = createServer();
      server.once('error', () => resolvePort(false));
      server.listen(port, '127.0.0.1', () => server.close(() => resolvePort(true)));
    });
    if (free) return port;
  }
  throw new Error('34000-34999 没有可用的视觉采集端口');
}

function plan(port) {
  return {
    baselineCommit, worktree, cargoTarget, database, output, browserSession, port,
    viewports: viewports.map(({ width, height }) => `${width}x${height}`),
    browserMode: 'isolated-headed', destructiveCleanup: false,
  };
}

async function waitForHealth(baseUrl, serverProcess) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (serverProcess.exitCode !== null) throw new Error(`main 基线服务提前退出：${serverProcess.exitCode}`);
    const response = await fetch(`${baseUrl}/api/healthz`).catch(() => null);
    if (response?.ok) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`main 基线服务未在 ${baseUrl} 就绪`);
}

async function capture(port) {
  for (const command of ['cargo', 'git', 'agent-browser']) run('sh', ['-c', `command -v ${command}`]);
  if (existsSync(worktree)) throw new Error(`隔离 worktree 已存在，请先检查并移除：${worktree}`);
  mkdirSync(runtimeRoot, { recursive: true });
  mkdirSync(output, { recursive: true });
  if (existsSync(database)) unlinkSync(database);

  run('git', ['worktree', 'add', '--detach', worktree, baselineCommit]);
  const runtimeEnv = {
    ...process.env,
    CARGO_TARGET_DIR: cargoTarget,
    YUANCE_DATABASE_URL: `sqlite://${database}`,
    YUANCE_DATA_DIR: runtimeRoot,
    YUANCE_ENV: 'test',
    YUANCE_SECURITY_MASTER_KEY: 'visual-baseline-test-key-that-is-long-enough',
    YUANCE_LOG_LEVEL: 'off',
  };
  let serverProcess;
  try {
    run('cargo', ['run', '-p', 'yuance-api', '--', 'migrate', 'up'], { cwd: worktree, env: runtimeEnv });
    run('cargo', ['run', '-p', 'yuance-api', '--', 'seed', 'local-admin'], { cwd: worktree, env: runtimeEnv });
    run('cargo', ['run', '-p', 'yuance-api', '--', 'seed', 'demo'], { cwd: worktree, env: runtimeEnv });

    const baseUrl = `http://127.0.0.1:${port}`;
    const log = createWriteStream(resolve(runtimeRoot, 'main-server.log'), { flags: 'w' });
    serverProcess = spawn('cargo', ['run', '-p', 'yuance-api', '--', 'serve'], {
      cwd: worktree, env: { ...runtimeEnv, YUANCE_HTTP_ADDR: `127.0.0.1:${port}` }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    serverProcess.stdout.pipe(log);
    serverProcess.stderr.pipe(log);
    await waitForHealth(baseUrl, serverProcess);

    browser(['close'], { allowFailure: true });
    browser(['open', `${baseUrl}/web/login`]);
    browser(['fill', 'input[name=username]', 'yuance_admin']);
    browser(['fill', 'input[name=password]', 'Yuance@2026Dev!']);
    browser(['click', 'button[type=submit]']);
    browser(['wait', '1000']);

    for (const viewport of viewports) {
      browser(['set', 'viewport', String(viewport.width), String(viewport.height)]);
      for (const [name, route] of pages) {
        const navigation = browser(['open', `${baseUrl}${route}`], { allowFailure: true });
        if (navigation.status !== 0) {
          const currentUrl = browser(['get', 'url'], { allowFailure: true }).stdout.trim();
          const title = browser(['get', 'title'], { allowFailure: true }).stdout.trim();
          if (!currentUrl.includes(route.split('?')[0]) || !title) {
            throw new Error(`${name} 导航失败且页面未到达目标：${navigation.stderr}`);
          }
        }
        browser(['screenshot', '--full', resolve(output, `${name}-${viewport.name}.png`)]);
      }
    }
  } finally {
    browser(['close'], { allowFailure: true });
    if (serverProcess && serverProcess.exitCode === null) {
      serverProcess.kill('SIGTERM');
      await new Promise((resolveExit) => serverProcess.once('exit', resolveExit));
    }
    run('git', ['worktree', 'remove', '--force', worktree], { allowFailure: true });
    run('git', ['worktree', 'prune'], { allowFailure: true });
  }
}

const args = process.argv.slice(2);
if (args.some((arg) => !['--print-plan', '--capture'].includes(arg)) || args.length !== 1) {
  fail('未知参数；仅支持 --print-plan 或 --capture');
} else {
  try {
    const port = await availablePort();
    if (args[0] === '--print-plan') process.stdout.write(`${JSON.stringify(plan(port), null, 2)}\n`);
    else await capture(port);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}
