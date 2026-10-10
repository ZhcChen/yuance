'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const rootDir = path.resolve(__dirname, '../..');
const deployScript = path.join(rootDir, 'scripts/deploy-production.sh');
const backupScript = path.join(rootDir, 'deploy/easy-deploy/production/backend/scripts/00-backup-sqlite.sh');
const cleanBackupEnvScript = path.join(rootDir, 'deploy/easy-deploy/production/backend/scripts/with-clean-backup-env.sh');
const stopTimeoutScript = path.join(rootDir, 'deploy/easy-deploy/production/backend/scripts/resolve-stop-timeout.sh');
const productionDatabaseScript = path.join(rootDir, 'deploy/easy-deploy/production/backend/scripts/validate-production-database.sh');
const sqlite3Path = spawnSync('sh', ['-c', 'command -v sqlite3'], { encoding: 'utf8' }).stdout.trim();
const shellPath = process.env.YUANCE_TEST_SHELL || 'sh';

const releaseVariables = [
  'YUANCE_DEPLOY_MODE', 'YUANCE_DEPLOY_BUILD_MODE', 'YUANCE_DEPLOY_HOST',
  'YUANCE_DEPLOY_ROOT', 'YUANCE_DEPLOY_BACKEND_DIR', 'YUANCE_DEPLOY_GATEWAY_DIR',
  'YUANCE_LOCAL_WSL_ROOT', 'YUANCE_BUILD_ROOT', 'YUANCE_API_IMAGE', 'YUANCE_API_IMAGE_TAR',
  'YUANCE_RELEASE_VERSION', 'YUANCE_KEEP_RELEASE_BACKUPS', 'YUANCE_PRUNE_DANGLING_IMAGES',
  'YUANCE_SSE_DRAIN_TIMEOUT', 'YUANCE_STOP_GRACE_PERIOD', 'YUANCE_DATABASE_URL', 'YUANCE_SQLITE_PATH', 'YUANCE_DATA_DIR', 'YUANCE_MAX_RELEASE_WINDOW',
  'YUANCE_SKIP_LOCAL_BUILD', 'YUANCE_ALLOW_DIRTY_LOCAL_CONFIG',
];

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(rootDir, `.${prefix}`));
}

function releaseEnv(binDir, logPath, overrides = {}) {
  const env = { ...process.env, PATH: `${binDir}${path.delimiter}${process.env.PATH}`, DEPLOY_SAFETY_LOG: logPath };
  for (const variable of releaseVariables) delete env[variable];
  return { ...env, ...overrides };
}

function backupFixture() {
  const root = tempDir('yuance-backup-safety-');
  const dataDir = path.join(root, 'data');
  const secretsDir = path.join(dataDir, 'secrets');
  const backupDir = path.join(root, 'backups');
  const dbPath = path.join(dataDir, 'yuance.sqlite3');
  const envPath = path.join(root, '.env');
  fs.mkdirSync(secretsDir, { recursive: true });
  fs.mkdirSync(backupDir, { recursive: true });
  fs.writeFileSync(envPath, 'YUANCE_FILE_MASTER_KEY=\n');
  const env = {
    ...process.env,
    YUANCE_SQLITE_PATH: dbPath,
    YUANCE_BACKUP_DIR: backupDir,
    YUANCE_BACKUP_DATA_DIR: dataDir,
    YUANCE_BACKUP_ENV_FILE: envPath,
  };
  delete env.YUANCE_FILE_MASTER_KEY;
  return { root, dataDir, secretsDir, backupDir, dbPath, envPath, env, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

function runBackup(fixture, overrides = {}) {
  return spawnSync(shellPath, [backupScript], {
    cwd: rootDir,
    env: { ...fixture.env, ...overrides },
    encoding: 'utf8',
  });
}

function sqlite(args, options = {}) {
  return spawnSync(sqlite3Path, args, { encoding: 'utf8', ...options });
}

function waitForSqliteMarker(child, marker) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`sqlite3 未输出 ${marker}: ${output}`)), 5000);
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
      if (output.includes(marker)) {
        clearTimeout(timer);
        resolve(output);
      }
    });
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`sqlite3 在 marker 前退出，状态 ${code}: ${output}`));
    });
  });
}

function stopSqlite(child) {
  return new Promise((resolve) => {
    child.once('exit', resolve);
    child.stdin.end('.quit\n');
  });
}

function mode(filePath) {
  return fs.statSync(filePath).mode & 0o777;
}

test('旧 API 停止后生成最终快照，再迁移并启动新 API', () => {
  const source = fs.readFileSync(deployScript, 'utf8');
  const backupSource = fs.readFileSync(backupScript, 'utf8');
  const migrationSource = fs.readFileSync(path.join(rootDir, 'api/src/app/migrate.rs'), 'utf8');
  const localStart = source.indexOf('if [ "$DEPLOY_MODE" = "local-wsl" ]; then');
  const remoteStart = source.indexOf("REMOTE_SCRIPT");
  assert.notEqual(localStart, -1);
  assert.notEqual(remoteStart, -1);

  const localFlow = source.slice(localStart, remoteStart);
  const localStop = localFlow.indexOf('compose --env-file .env -f compose.yaml stop api');
  const localBackup = localFlow.indexOf('./scripts/00-backup-sqlite.sh');
  const localMigration = localFlow.indexOf('./yuance-api migrate up');
  const localMaintenanceRun = localFlow.indexOf('docker compose --env-file .env -f compose.yaml run --rm --no-deps --name "$maintenance"');
  const localStartApi = localFlow.indexOf('compose --env-file .env -f compose.yaml up -d --force-recreate');
  assert.ok(localStop >= 0 && localStop < localBackup && localBackup < localMigration && localMigration < localStartApi);
  assert.ok(localBackup < localMaintenanceRun && localMaintenanceRun < localMigration);

  const remoteScript = source.slice(remoteStart);
  const releaseStart = remoteScript.indexOf('stamp="$(date');
  assert.notEqual(releaseStart, -1);
  const remoteFlow = remoteScript.slice(releaseStart);
  const remoteStop = remoteFlow.indexOf('停止 API，封闭旧上传签名窗口');
  const remoteBackup = remoteFlow.indexOf('生成 API 停止后的 SQLite 回滚快照');
  const remoteMigration = remoteFlow.indexOf('run_compose_maintenance "yuance-api-maintenance-$stamp"');
  const remoteStartApi = remoteFlow.indexOf('重建并启动 api 容器');
  assert.ok(remoteStop >= 0 && remoteStop < remoteBackup && remoteBackup < remoteMigration && remoteMigration < remoteStartApi);
  assert.ok(remoteFlow.indexOf('RESTORE_API_ON_EXIT=0', remoteMigration) > remoteMigration);
  assert.match(source, /快照失败，迁移尚未执行，尝试启动旧 API/);
  assert.match(source, /迁移失败，API 保持停止/);
  assert.match(localFlow, /trap 'handle_local_signal 143' TERM/);
  assert.match(source.slice(remoteStart), /trap 'handle_remote_signal 143' TERM/);
  assert.match(localFlow, /RESTORE_API_ON_EXIT=1/);
  assert.match(source.slice(remoteStart), /RESTORE_API_ON_EXIT=1/);
  assert.match(localFlow, /MIGRATION_STARTED_MARKER="\$LOCAL_BACKEND_DIR\/data\/\.\$maintenance\.migration-started"/);
  assert.match(remoteFlow, /MIGRATION_STARTED_MARKER="\$BACKEND_DIR\/data\/\.yuance-api-maintenance-\$stamp\.migration-started"/);
  assert.match(localFlow, /-e "YUANCE_MIGRATION_STARTED_MARKER=\$MIGRATION_STARTED_CONTAINER_PATH" api sh -eu -c '[\s\S]*?\.\/yuance-api migrate up/);
  assert.match(remoteScript, /-e "YUANCE_MIGRATION_STARTED_MARKER=\$MIGRATION_STARTED_CONTAINER_PATH" api sh -eu -c '[\s\S]*?\.\/yuance-api migrate up/);
  assert.match(localFlow, /\[ ! -f "\$MIGRATION_STARTED_MARKER" \]/);
  assert.match(remoteScript, /\[ ! -f "\$MIGRATION_STARTED_MARKER" \]/);
  assert.ok(remoteScript.indexOf('MIGRATION_STARTED_MARKER=""') < remoteScript.indexOf('trap cleanup EXIT'));
  assert.match(migrationSource, /validate_migration_state\(&pool\)\.await\?;\s+write_migration_started_marker\(migration_started_marker\.as_deref\(\)\)\?;\s+db::run_migrations\(&pool\)\.await\?/);
  assert.match(migrationSource, /validate_migration_state\(&pool\)\.await\?;\s+write_migration_started_marker\(migration_started_marker\.as_deref\(\)\)\?;\s+db::MIGRATOR\.run_to\(version, &pool\)\.await\?/);
  assert.match(localFlow, /\.\/yuance-api migrate status\s+\.\/yuance-api migrate up/);
  assert.match(remoteScript, /\.\/yuance-api migrate status\s+\.\/yuance-api migrate up/);
  assert.match(backupSource, /elif \[ "\$\{YUANCE_BACKUP_REQUIRED:-0\}" = "1" \]; then\n  DB_BASE="\$APP_DIR\/data\/yuance\.sqlite3"/);
  assert.doesNotMatch(backupSource, /"\$APP_DIR\/data\/yuance\.sqlite3"\|\/data\/yuance\.sqlite3/);
  assert.match(localFlow, /resolve-stop-timeout\.sh \.env "\$STOP_GRACE_PERIOD_EXPLICIT"/);
  assert.match(source.slice(remoteStart), /resolve-stop-timeout\.sh \.env "\$STOP_GRACE_PERIOD_EXPLICIT"/);
  assert.match(localFlow, /validate-production-database\.sh \.env/);
  assert.match(source.slice(remoteStart), /validate-production-database\.sh \.env/);
  assert.match(localFlow, /unset YUANCE_DATABASE_URL YUANCE_SQLITE_PATH YUANCE_DATA_DIR/);
  assert.match(source.slice(remoteStart), /unset YUANCE_DATABASE_URL YUANCE_SQLITE_PATH YUANCE_DATA_DIR/);
  assert.match(localFlow, /export YUANCE_STOP_GRACE_PERIOD="\$STOP_GRACE_PERIOD"/);
  assert.match(source.slice(remoteStart), /export YUANCE_STOP_GRACE_PERIOD="\$STOP_GRACE_PERIOD"/);
  assert.match(localFlow, /timeout -k 30s "\$STOP_TIMEOUT" docker compose .* stop api/);
  assert.match(remoteFlow, /停止 API，封闭旧上传签名窗口" "\$STOP_TIMEOUT" docker compose .* stop api/);
  assert.match(localFlow, /with-clean-backup-env\.sh timeout -k 30s 300s \.\/scripts\/00-backup-sqlite\.sh/);
  assert.match(remoteFlow, /with-clean-backup-env\.sh \.\/scripts\/00-backup-sqlite\.sh/);
  assert.match(localFlow, /API_WAS_RUNNING="\$\(docker inspect --format '\{\{\.State\.Running\}\}' yuance-api\)"/);
  assert.match(remoteFlow, /API_WAS_RUNNING="\$\(docker inspect --format '\{\{\.State\.Running\}\}' yuance-api\)"/);
  assert.match(localFlow, /if \[ "\$API_WAS_RUNNING" = "true" \]; then[\s\S]*?compose --env-file \.env -f compose\.yaml start api/);
  assert.match(remoteFlow, /if \[ "\$API_WAS_RUNNING" = "true" \]; then[\s\S]*?compose --env-file \.env -f compose\.yaml start api/);
  assert.match(localFlow, /停止 API 失败，迁移尚未执行，尝试恢复停止前的运行状态/);
  assert.match(remoteFlow, /停止 API 失败，迁移尚未执行，尝试恢复停止前的运行状态/);
  assert.match(source, /YUANCE_STOP_GRACE_PERIOD_EXPLICIT='\$STOP_GRACE_PERIOD_EXPLICIT'/);
  assert.match(source, /REMOTE_STOP_GRACE_ENV="YUANCE_STOP_GRACE_PERIOD='\$STOP_GRACE_PERIOD'"/);
  assert.doesNotMatch(source, /YUANCE_STOP_TIMEOUT=/);
});

test('生产快照执行入口清除继承的数据库与备份路径变量', () => {
  const root = tempDir('yuance-clean-backup-env-');
  const commandPath = path.join(root, 'capture-env.sh');
  fs.writeFileSync(commandPath, [
    '#!/bin/sh',
    'printf "PATH=%s\\n" "$PATH"',
    'printf "YUANCE_BACKUP_REQUIRED=%s\\n" "${YUANCE_BACKUP_REQUIRED-}"',
    'printf "YUANCE_FILE_MASTER_KEY=%s\\n" "${YUANCE_FILE_MASTER_KEY-<unset>}"',
    '[ "${YUANCE_SQLITE_PATH+x}" != x ]',
    '[ "${YUANCE_DATABASE_URL+x}" != x ]',
    '[ "${YUANCE_DATA_DIR+x}" != x ]',
    '[ "${YUANCE_BACKUP_DIR+x}" != x ]',
    '[ "${YUANCE_BACKUP_DATA_DIR+x}" != x ]',
    '[ "${YUANCE_BACKUP_ENV_FILE+x}" != x ]',
  ].join('\n') + '\n', { mode: 0o700 });

  try {
    const result = spawnSync(shellPath, [cleanBackupEnvScript, commandPath], {
      cwd: rootDir,
      env: {
        ...process.env,
        YUANCE_SQLITE_PATH: '/tmp/attacker.sqlite3',
        YUANCE_DATABASE_URL: 'sqlite:///tmp/attacker.sqlite3',
        YUANCE_DATA_DIR: '/tmp/attacker-data',
        YUANCE_FILE_MASTER_KEY: 'runtime-key-fixture',
        YUANCE_BACKUP_DIR: '/tmp/attacker-backups',
        YUANCE_BACKUP_DATA_DIR: '/tmp/attacker-data',
        YUANCE_BACKUP_ENV_FILE: '/tmp/attacker.env',
      },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /YUANCE_BACKUP_REQUIRED=1/);
    assert.match(result.stdout, /YUANCE_FILE_MASTER_KEY=runtime-key-fixture/);
    assert.match(result.stdout, /PATH=/);

    const cleanEnvironment = { ...process.env };
    delete cleanEnvironment.YUANCE_FILE_MASTER_KEY;
    const noOverride = spawnSync(shellPath, [cleanBackupEnvScript, commandPath], {
      cwd: rootDir,
      env: cleanEnvironment,
      encoding: 'utf8',
    });
    assert.equal(noOverride.status, 0, noOverride.stderr);
    assert.match(noOverride.stdout, /YUANCE_FILE_MASTER_KEY=<unset>/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('停机超时读取目标机 .env，显式发布参数可覆盖且非法配置失败', () => {
  const root = tempDir('yuance-stop-timeout-');
  const envPath = path.join(root, '.env');
  const resolve = (env, explicit = '0', requested = '45s') => spawnSync(shellPath, [stopTimeoutScript, envPath, explicit, requested], {
    cwd: rootDir,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });

  try {
    fs.writeFileSync(envPath, 'export YUANCE_STOP_GRACE_PERIOD = "90s" # compose grace\n');
    const configured = resolve({});
    assert.equal(configured.status, 0, configured.stderr);
    assert.equal(configured.stdout.trim(), '90s 150s');

    const explicit = resolve({}, '1', '2m');
    assert.equal(explicit.status, 0, explicit.stderr);
    assert.equal(explicit.stdout.trim(), '2m 180s');

    fs.writeFileSync(envPath, 'YUANCE_STOP_GRACE_PERIOD: 24h\n');
    const colonFormat = resolve({});
    assert.equal(colonFormat.status, 0, colonFormat.stderr);
    assert.equal(colonFormat.stdout.trim(), '24h 86460s');

    fs.writeFileSync(envPath, 'YUANCE_STOP_GRACE_PERIOD=\n');
    const fallback = resolve({});
    assert.equal(fallback.status, 0, fallback.stderr);
    assert.equal(fallback.stdout.trim(), '45s 105s');

    for (const contents of [
      'YUANCE_STOP_GRACE_PERIOD=45s\nYUANCE_STOP_GRACE_PERIOD=90s\n',
      'YUANCE_STOP_GRACE_PERIOD=${YUANCE_TEST_SECRET}\n',
      'YUANCE_STOP_GRACE_PERIOD=25h\n',
      'YUANCE_STOP_GRACE_PERIOD=45s;touch /tmp/not-run\n',
    ]) {
      fs.writeFileSync(envPath, contents);
      const rejected = resolve({ YUANCE_TEST_SECRET: 'private-value' });
      assert.notEqual(rejected.status, 0, contents);
      assert.equal(rejected.stdout.includes('private-value'), false);
      assert.equal(rejected.stderr.includes('private-value'), false);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('生产数据库和数据目录必须与 Compose 挂载一致', () => {
  const root = tempDir('yuance-production-database-');
  const envPath = path.join(root, '.env');
  const validationEnvironment = { ...process.env };
  delete validationEnvironment.YUANCE_DATA_DIR;
  const validate = (overrides = {}) => spawnSync(shellPath, [productionDatabaseScript, envPath], {
    encoding: 'utf8',
    env: { ...validationEnvironment, ...overrides },
  });

  try {
    for (const contents of [
      '',
      'export YUANCE_DATABASE_URL = "sqlite:///data/yuance.sqlite3" # canonical\n',
      'YUANCE_DATABASE_URL: sqlite:///data/yuance.sqlite3\n',
      'YUANCE_DATA_DIR=/data\n',
      'YUANCE_DATA_DIR: /data\n',
      'YUANCE_DATA_DIR=""\n',
    ]) {
      fs.writeFileSync(envPath, contents);
      const accepted = validate();
      assert.equal(accepted.status, 0, accepted.stderr);
    }

    for (const contents of [
      'YUANCE_DATABASE_URL=sqlite:///custom/yuance.sqlite3\n',
      'YUANCE_DATABASE_URL=${YUANCE_DATABASE_URL}\n',
      'YUANCE_DATABASE_URL=sqlite:///data/yuance.sqlite3\nYUANCE_DATABASE_URL=sqlite:///other.sqlite3\n',
      'YUANCE_DATA_DIR=/srv/yuance-data\n',
      'YUANCE_DATA_DIR: /srv/yuance-data\n',
      'YUANCE_DATA_DIR=/data\nYUANCE_DATA_DIR=/srv/yuance-data\n',
    ]) {
      fs.writeFileSync(envPath, contents);
      const rejected = validate();
      assert.notEqual(rejected.status, 0, contents);
      assert.equal(rejected.stdout.includes('YUANCE_DATABASE_URL='), false);
    }

    fs.writeFileSync(envPath, 'YUANCE_DATA_DIR=/data\n');
    const inheritedMismatch = validate({ YUANCE_DATA_DIR: '/srv/other-data' });
    assert.notEqual(inheritedMismatch.status, 0);
    assert.match(inheritedMismatch.stderr, /发布进程的 YUANCE_DATA_DIR/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('部署参数缺失或非法时，在 Git、Docker、npm、SSH、SCP 前失败', (t) => {
  const root = tempDir('yuance-release-safety-');
  const bin = path.join(root, 'bin');
  const logPath = path.join(root, 'calls.log');
  fs.mkdirSync(bin);
  for (const command of ['git', 'docker', 'npm', 'ssh', 'scp']) {
    const stub = path.join(bin, command);
    fs.writeFileSync(stub, '#!/bin/sh\nprintf "%s\\n" "${0##*/} $*" >> "$DEPLOY_SAFETY_LOG"\nexit 0\n', { mode: 0o700 });
  }

  const longRegistry = ['a'.repeat(63), 'b'.repeat(63), 'c'.repeat(63), 'd'.repeat(61)].join('.');
  const cases = [
    [{}, /必须显式设置 YUANCE_DEPLOY_MODE/],
    [{ YUANCE_DEPLOY_MODE: 'remote' }, /必须显式设置 YUANCE_DEPLOY_BUILD_MODE/],
    [{ YUANCE_DEPLOY_MODE: 'remote', YUANCE_DEPLOY_BUILD_MODE: 'remote' }, /必须显式设置 YUANCE_DEPLOY_HOST/],
    [{ YUANCE_DEPLOY_MODE: 'remote', YUANCE_DEPLOY_BUILD_MODE: 'remote', YUANCE_DEPLOY_HOST: 'qfy-test2', YUANCE_KEEP_RELEASE_BACKUPS: 'many' }, /YUANCE_KEEP_RELEASE_BACKUPS/],
    [{ YUANCE_DEPLOY_MODE: 'remote', YUANCE_DEPLOY_BUILD_MODE: 'remote', YUANCE_DEPLOY_HOST: 'qfy-test2', YUANCE_KEEP_RELEASE_BACKUPS: '999999999999999999999' }, /YUANCE_KEEP_RELEASE_BACKUPS/],
    [{ YUANCE_DEPLOY_MODE: 'remote', YUANCE_DEPLOY_BUILD_MODE: 'remote', YUANCE_DEPLOY_HOST: 'qfy-test2', YUANCE_PRUNE_DANGLING_IMAGES: 'yes' }, /只支持 0 或 1/],
    [{ YUANCE_DEPLOY_MODE: 'remote', YUANCE_DEPLOY_BUILD_MODE: 'remote', YUANCE_DEPLOY_HOST: 'qfy-test2', YUANCE_SSE_DRAIN_TIMEOUT: '1h;touch' }, /YUANCE_SSE_DRAIN_TIMEOUT/],
    [{ YUANCE_DEPLOY_MODE: 'remote', YUANCE_DEPLOY_BUILD_MODE: 'remote', YUANCE_DEPLOY_HOST: 'qfy-test2', YUANCE_BUILD_ROOT: '/srv/yuance/backend/build' }, /YUANCE_BUILD_ROOT/],
    [{ YUANCE_DEPLOY_MODE: 'remote', YUANCE_DEPLOY_BUILD_MODE: 'remote', YUANCE_DEPLOY_HOST: 'qfy-test2', YUANCE_BUILD_ROOT: '/srv/yuance//backend/build' }, /重复斜杠/],
    [{ YUANCE_DEPLOY_MODE: 'remote', YUANCE_DEPLOY_BUILD_MODE: 'remote', YUANCE_DEPLOY_HOST: 'qfy-test2', YUANCE_API_IMAGE: 'foo:' }, /有效的 Docker 镜像/],
    [{ YUANCE_DEPLOY_MODE: 'remote', YUANCE_DEPLOY_BUILD_MODE: 'remote', YUANCE_DEPLOY_HOST: 'qfy-test2', YUANCE_API_IMAGE: 'foo//bar' }, /有效的 Docker 镜像/],
    [{ YUANCE_DEPLOY_MODE: 'remote', YUANCE_DEPLOY_BUILD_MODE: 'remote', YUANCE_DEPLOY_HOST: 'qfy-test2', YUANCE_API_IMAGE: 'team/api@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' }, /有效的 Docker 镜像/],
    [{ YUANCE_DEPLOY_MODE: 'remote', YUANCE_DEPLOY_BUILD_MODE: 'remote', YUANCE_DEPLOY_HOST: 'qfy-test2', YUANCE_API_IMAGE: 'yuance-api:ok\n; touch /tmp/should-not-exist' }, /有效的 Docker 镜像/],
    [{ YUANCE_DEPLOY_MODE: 'remote', YUANCE_DEPLOY_BUILD_MODE: 'remote', YUANCE_DEPLOY_HOST: 'qfy-test2', YUANCE_SKIP_LOCAL_BUILD: '1' }, /不支持 YUANCE_SKIP_LOCAL_BUILD/],
    [{ YUANCE_DEPLOY_MODE: 'remote', YUANCE_DEPLOY_BUILD_MODE: 'remote', YUANCE_DEPLOY_HOST: 'qfy-test2;touch' }, /YUANCE_DEPLOY_HOST/],
    [{ YUANCE_DEPLOY_MODE: 'remote', YUANCE_DEPLOY_BUILD_MODE: 'remote', YUANCE_DEPLOY_HOST: 'qfy-test2', YUANCE_API_IMAGE: 'registry.example:5000/team/api:release_1', YUANCE_RELEASE_VERSION: 'invalid;value' }, /YUANCE_RELEASE_VERSION/],
    [{ YUANCE_DEPLOY_MODE: 'remote', YUANCE_DEPLOY_BUILD_MODE: 'remote', YUANCE_DEPLOY_HOST: 'qfy-test2', YUANCE_API_IMAGE: 'Registry.Example:5000/team/api:TAG', YUANCE_RELEASE_VERSION: 'invalid;value' }, /YUANCE_RELEASE_VERSION/],
    [{ YUANCE_DEPLOY_MODE: 'remote', YUANCE_DEPLOY_BUILD_MODE: 'remote', YUANCE_DEPLOY_HOST: 'qfy-test2', YUANCE_API_IMAGE: '[2001:db8::1]:5000/team/api:latest', YUANCE_RELEASE_VERSION: 'invalid;value' }, /YUANCE_RELEASE_VERSION/],
    [{ YUANCE_DEPLOY_MODE: 'remote', YUANCE_DEPLOY_BUILD_MODE: 'remote', YUANCE_DEPLOY_HOST: 'qfy-test2', YUANCE_API_IMAGE: `${longRegistry}/team/api:latest` }, /有效的 Docker 镜像/],
  ];

  try {
    for (const [overrides, expected] of cases) {
      const result = spawnSync(shellPath, [deployScript], { cwd: rootDir, env: releaseEnv(bin, logPath, overrides), encoding: 'utf8' });
      assert.notEqual(result.status, 0, JSON.stringify(overrides));
      assert.match(result.stderr, expected, JSON.stringify(overrides));
      assert.equal(fs.existsSync(logPath), false, `发生了发布副作用：${JSON.stringify(overrides)}`);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('镜像 tar 路径包含指向仓库外的符号链接时，在任何发布命令前失败', () => {
  const root = tempDir('yuance-image-tar-symlink-');
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'yuance-image-tar-outside-'));
  const bin = path.join(root, 'bin');
  const logPath = path.join(root, 'calls.log');
  const externalTar = path.join(outside, 'image.tar');
  const fileLink = path.join(root, 'file-link.tar');
  const externalDir = path.join(outside, 'linked-directory');
  const directoryLink = path.join(root, 'directory-link');
  fs.mkdirSync(bin);
  fs.mkdirSync(externalDir);
  fs.writeFileSync(externalTar, 'fixture');
  fs.writeFileSync(path.join(externalDir, 'image.tar'), 'fixture');
  fs.symlinkSync(externalTar, fileLink);
  fs.symlinkSync(externalDir, directoryLink, 'dir');
  for (const command of ['git', 'docker', 'npm', 'ssh', 'scp']) {
    fs.writeFileSync(path.join(bin, command), `#!/bin/sh\nprintf "${command} %s\\n" "$*" >> "$DEPLOY_SAFETY_LOG"\nexit 0\n`, { mode: 0o700 });
  }

  try {
    for (const imageTar of [path.relative(rootDir, fileLink), `${path.relative(rootDir, directoryLink)}/image.tar`]) {
      const result = spawnSync(shellPath, [deployScript], {
        cwd: rootDir,
        env: releaseEnv(bin, logPath, {
          YUANCE_DEPLOY_MODE: 'remote',
          YUANCE_DEPLOY_BUILD_MODE: 'remote',
          YUANCE_DEPLOY_HOST: 'fixture-host',
          YUANCE_API_IMAGE_TAR: imageTar,
        }),
        encoding: 'utf8',
      });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /路径不得包含符号链接/);
      assert.equal(fs.existsSync(logPath), false, `符号链接校验后仍执行发布命令：${imageTar}`);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('远程构建先预检 tar 和 Buildx builder，再创建源码归档或传输', () => {
  const root = tempDir('yuance-buildx-preflight-');
  const bin = path.join(root, 'bin');
  const remoteRoot = path.join(root, 'remote-root');
  const remoteBackend = path.join(remoteRoot, 'backend');
  const logPath = path.join(root, 'calls.log');
  fs.mkdirSync(bin);
  fs.mkdirSync(remoteBackend, { recursive: true });
  fs.writeFileSync(path.join(remoteBackend, '.env'), 'YUANCE_TEST_CONFIG=fixture\n');
  fs.writeFileSync(path.join(bin, 'git'), [
    '#!/bin/sh',
    'printf "git %s\\n" "$*" >> "$DEPLOY_SAFETY_LOG"',
    'case "$*" in',
    '  *"branch --show-current"*) printf "main\\n" ;;',
    '  *"rev-parse HEAD"*) printf "fixture-commit\\n" ;;',
    '  *"rev-parse origin/main"*) printf "fixture-commit\\n" ;;',
    'esac',
  ].join('\n') + '\n', { mode: 0o700 });
  fs.writeFileSync(path.join(bin, 'ssh'), '#!/bin/sh\nprintf "ssh %s\\n" "$*" >> "$DEPLOY_SAFETY_LOG"\nPATH="$DEPLOY_SAFETY_REMOTE_PATH" /bin/sh -c "$2"\n', { mode: 0o700 });
  for (const command of ['docker', 'timeout', 'sha256sum', 'sqlite3', 'awk', 'node', 'npm', 'scp']) {
    const behavior = command === 'docker'
      ? 'printf "docker %s\\n" "$*" >> "$DEPLOY_SAFETY_LOG"\ncase "$*" in *"buildx inspect --bootstrap"*) exit 23 ;; esac\nexit 0\n'
      : `printf "${command} %s\\n" "$*" >> "$DEPLOY_SAFETY_LOG"\nexit 0\n`;
    fs.writeFileSync(path.join(bin, command), `#!/bin/sh\n${behavior}`, { mode: 0o700 });
  }

  try {
    const runDeploy = () => spawnSync(shellPath, [deployScript], {
      cwd: rootDir,
      env: releaseEnv(bin, logPath, {
        YUANCE_DEPLOY_MODE: 'remote',
        YUANCE_DEPLOY_BUILD_MODE: 'remote',
        YUANCE_DEPLOY_HOST: 'qfy-test2',
        YUANCE_DEPLOY_ROOT: remoteRoot,
        DEPLOY_SAFETY_REMOTE_PATH: bin,
      }),
      encoding: 'utf8',
    });

    const missingTar = runDeploy();
    assert.notEqual(missingTar.status, 0);
    assert.match(missingTar.stderr, /服务器缺少构建命令：tar/);
    let calls = fs.readFileSync(logPath, 'utf8');
    assert.doesNotMatch(calls, /^docker buildx inspect --bootstrap$/m);
    assert.doesNotMatch(calls, /^scp /m);
    assert.doesNotMatch(calls, /^npm /m);
    assert.doesNotMatch(calls, /git .*archive --format=tar\.gz/);

    fs.writeFileSync(path.join(bin, 'tar'), '#!/bin/sh\nexit 0\n', { mode: 0o700 });
    fs.writeFileSync(logPath, '');
    const uninitializedBuildx = runDeploy();
    assert.notEqual(uninitializedBuildx.status, 0);
    assert.match(uninitializedBuildx.stderr, /服务器 Buildx builder 无法初始化/);
    calls = fs.readFileSync(logPath, 'utf8');
    assert.match(calls, /^docker buildx inspect --bootstrap$/m);
    assert.match(calls, /canonicalize_missing/);
    assert.doesNotMatch(calls, /^scp /m);
    assert.doesNotMatch(calls, /^npm /m);
    assert.doesNotMatch(calls, /git .*archive --format=tar\.gz/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('远端物理路径预检拒绝指向后端数据目录的构建目录符号链接', () => {
  const root = tempDir('yuance-buildx-canonical-');
  const backendDir = path.join(root, 'backend');
  const dataDir = path.join(backendDir, 'data');
  const buildAlias = path.join(root, 'build-alias');
  const bin = path.join(root, 'bin');
  const logPath = path.join(root, 'calls.log');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(backendDir, '.env'), 'YUANCE_TEST_CONFIG=fixture\n');
  fs.symlinkSync(dataDir, buildAlias, 'dir');

  fs.writeFileSync(path.join(bin, 'git'), [
    '#!/bin/sh',
    'printf "git %s\\n" "$*" >> "$DEPLOY_SAFETY_LOG"',
    'case "$*" in',
    '  *"branch --show-current"*) printf "main\\n" ;;',
    '  *"rev-parse HEAD"*) printf "fixture-commit\\n" ;;',
    '  *"rev-parse origin/main"*) printf "fixture-commit\\n" ;;',
    'esac',
  ].join('\n') + '\n', { mode: 0o700 });
  fs.writeFileSync(path.join(bin, 'ssh'), '#!/bin/sh\nprintf "ssh %s\\n" "$*" >> "$DEPLOY_SAFETY_LOG"\nexec sh -c "$2"\n', { mode: 0o700 });
  for (const command of ['docker', 'timeout', 'sha256sum', 'sqlite3', 'node', 'npm', 'scp']) {
    const behavior = command === 'docker'
      ? 'printf "docker %s\\n" "$*" >> "$DEPLOY_SAFETY_LOG"\nexit 0\n'
      : `printf "${command} %s\\n" "$*" >> "$DEPLOY_SAFETY_LOG"\nexit 0\n`;
    fs.writeFileSync(path.join(bin, command), `#!/bin/sh\n${behavior}`, { mode: 0o700 });
  }

  try {
    const result = spawnSync(shellPath, [deployScript], {
      cwd: rootDir,
      env: releaseEnv(bin, logPath, {
        YUANCE_DEPLOY_MODE: 'remote',
        YUANCE_DEPLOY_BUILD_MODE: 'remote',
        YUANCE_DEPLOY_HOST: 'fixture-host',
        YUANCE_DEPLOY_ROOT: root,
        YUANCE_DEPLOY_BACKEND_DIR: backendDir,
        YUANCE_DEPLOY_GATEWAY_DIR: path.join(root, 'gateway'),
        YUANCE_BUILD_ROOT: buildAlias,
      }),
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /构建目录真实路径落入后端运行目录/);
    const calls = fs.readFileSync(logPath, 'utf8');
    assert.doesNotMatch(calls, /git .*archive --format=tar\.gz/);
    assert.doesNotMatch(calls, /^scp /m);
    assert.doesNotMatch(calls, /^npm /m);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('SQLite 在线快照包含 WAL 已提交数据，并按密钥来源保存受限恢复材料', { skip: !sqlite3Path && '当前环境未安装 sqlite3' }, async (t) => {
  const fixture = backupFixture();
  const fileKey = Buffer.from('fixture-file-master-key-for-tests\n');
  fs.writeFileSync(path.join(fixture.secretsDir, 'file_master_key'), fileKey, { mode: 0o600 });
  const originalBackupRootMode = mode(fixture.backupDir);
  const initialized = sqlite(['-batch', fixture.dbPath, 'PRAGMA journal_mode=WAL; CREATE TABLE entries(value TEXT);']);
  assert.equal(initialized.status, 0, initialized.stderr);

  const writer = spawn(sqlite3Path, [fixture.dbPath], { stdio: ['pipe', 'pipe', 'pipe'] });
  try {
    const ready = waitForSqliteMarker(writer, 'SNAPSHOT_READY');
    writer.stdin.write("PRAGMA journal_mode=WAL;\nPRAGMA wal_autocheckpoint=0;\nINSERT INTO entries VALUES('committed-in-wal');\nSELECT 'SNAPSHOT_READY';\n");
    await ready;
    assert.ok(fs.statSync(`${fixture.dbPath}-wal`).size > 0, 'fixture must retain committed pages in WAL');

    const result = runBackup(fixture);
    assert.equal(result.status, 0, result.stderr);
    const backupPath = result.stdout.match(/SQLite 一致性备份完成：(.+)/)?.[1]?.trim();
    assert.ok(backupPath, result.stdout);
    const snapshot = path.join(backupPath, 'yuance.sqlite3');
    assert.equal(sqlite([snapshot, 'PRAGMA integrity_check;']).stdout.trim(), 'ok');
    assert.equal(sqlite([snapshot, 'SELECT value FROM entries;']).stdout.trim(), 'committed-in-wal');
    assert.deepEqual(fs.readFileSync(path.join(backupPath, 'secrets/file_master_key')), fileKey);
    assert.equal(fs.readFileSync(path.join(backupPath, 'manifest.txt'), 'utf8').includes('file_master_key_source=data-file'), true);
    assert.deepEqual(fs.readdirSync(backupPath).sort(), ['manifest.txt', 'secrets', 'yuance.sqlite3']);
    assert.equal(mode(fixture.backupDir), originalBackupRootMode);
    assert.equal(mode(backupPath), 0o700);
    assert.equal(mode(snapshot), 0o600);
    assert.equal(mode(path.join(backupPath, 'manifest.txt')), 0o600);
    assert.equal(mode(path.join(backupPath, 'secrets')), 0o700);
    assert.equal(mode(path.join(backupPath, 'secrets/file_master_key')), 0o600);

    const restoredData = path.join(fixture.root, 'restored-data');
    fs.mkdirSync(path.join(restoredData, 'secrets'), { recursive: true });
    fs.copyFileSync(snapshot, path.join(restoredData, 'yuance.sqlite3'));
    fs.copyFileSync(path.join(backupPath, 'secrets/file_master_key'), path.join(restoredData, 'secrets/file_master_key'));
    fs.writeFileSync(path.join(restoredData, 'yuance.sqlite3-wal'), 'stale sidecar');
    fs.writeFileSync(path.join(restoredData, 'yuance.sqlite3-shm'), 'stale sidecar');
    fs.rmSync(path.join(restoredData, 'yuance.sqlite3-wal'));
    fs.rmSync(path.join(restoredData, 'yuance.sqlite3-shm'));
    assert.equal(sqlite([path.join(restoredData, 'yuance.sqlite3'), 'PRAGMA integrity_check;']).stdout.trim(), 'ok');
    assert.equal(sqlite([path.join(restoredData, 'yuance.sqlite3'), 'SELECT value FROM entries;']).stdout.trim(), 'committed-in-wal');
    assert.deepEqual(fs.readFileSync(path.join(restoredData, 'secrets/file_master_key')), fileKey);

    const externalKey = 'external-fixture-master-key-should-not-leak';
    const externalResult = runBackup(fixture, { YUANCE_FILE_MASTER_KEY: externalKey });
    assert.equal(externalResult.status, 0, externalResult.stderr);
    assert.equal(externalResult.stdout.includes(externalKey), false);
    const externalPath = externalResult.stdout.match(/SQLite 一致性备份完成：(.+)/)?.[1]?.trim();
    const manifest = fs.readFileSync(path.join(externalPath, 'manifest.txt'), 'utf8');
    assert.match(manifest, /file_master_key_source=environment/);
    assert.match(manifest, /required_external_configuration=YUANCE_FILE_MASTER_KEY/);
    assert.equal(manifest.includes(externalKey), false);
    assert.equal(fs.existsSync(path.join(externalPath, 'secrets/file_master_key')), false);

    const dotenvSecret = 'dotenv-fixture-master-key';
    fs.writeFileSync(fixture.envPath, `YUANCE_FILE_MASTER_KEY=${dotenvSecret}\n`);
    const emptyEnvironmentResult = runBackup(fixture, { YUANCE_FILE_MASTER_KEY: '' });
    assert.equal(emptyEnvironmentResult.status, 0, emptyEnvironmentResult.stderr);
    assert.equal(emptyEnvironmentResult.stdout.includes(dotenvSecret), false);
    const emptyEnvironmentPath = emptyEnvironmentResult.stdout.match(/SQLite 一致性备份完成：(.+)/)?.[1]?.trim();
    assert.match(fs.readFileSync(path.join(emptyEnvironmentPath, 'manifest.txt'), 'utf8'), /file_master_key_source=data-file/);
    assert.deepEqual(fs.readFileSync(path.join(emptyEnvironmentPath, 'secrets/file_master_key')), fileKey);

    fs.writeFileSync(fixture.envPath, 'YUANCE_FILE_MASTER_KEY="dotenv-fixture-master-key"\n');
    const dotenvResult = runBackup(fixture);
    assert.equal(dotenvResult.status, 0, dotenvResult.stderr);
    const dotenvPath = dotenvResult.stdout.match(/SQLite 一致性备份完成：(.+)/)?.[1]?.trim();
    assert.match(fs.readFileSync(path.join(dotenvPath, 'manifest.txt'), 'utf8'), /file_master_key_source=environment/);
    assert.equal(fs.existsSync(path.join(dotenvPath, 'secrets/file_master_key')), false);

    fs.writeFileSync(fixture.envPath, 'YUANCE_FILE_MASTER_KEY: "dotenv-fixture-master-key=="\n');
    const colonDotenvResult = runBackup(fixture);
    assert.equal(colonDotenvResult.status, 0, colonDotenvResult.stderr);
    const colonDotenvPath = colonDotenvResult.stdout.match(/SQLite 一致性备份完成：(.+)/)?.[1]?.trim();
    const colonManifest = fs.readFileSync(path.join(colonDotenvPath, 'manifest.txt'), 'utf8');
    assert.match(colonManifest, /file_master_key_source=environment/);
    assert.equal(fs.existsSync(path.join(colonDotenvPath, 'secrets/file_master_key')), false);
  } finally {
    await stopSqlite(writer);
    fixture.cleanup();
  }
});

test('部署要求 SQLite 回滚快照时，缺少数据库不能按首次部署跳过', () => {
  const fixture = backupFixture();
  try {
    const optionalBackup = runBackup(fixture);
    assert.equal(optionalBackup.status, 0, optionalBackup.stderr);
    assert.match(optionalBackup.stdout, /首次部署跳过备份/);

    const requiredBackup = runBackup(fixture, { YUANCE_BACKUP_REQUIRED: '1' });
    assert.notEqual(requiredBackup.status, 0);
    assert.match(requiredBackup.stderr, /未发现要求备份的 SQLite 数据库/);
  } finally {
    fixture.cleanup();
  }
});

test('必需快照拒绝非 Compose 数据库或数据目录', () => {
  const fixture = backupFixture();
  try {
    fs.writeFileSync(fixture.dbPath, 'fixture-not-a-database');
    fs.writeFileSync(fixture.envPath, 'YUANCE_DATABASE_URL=sqlite:///custom/yuance.sqlite3\n');
    const mismatchedUrl = runBackup(fixture, { YUANCE_BACKUP_REQUIRED: '1' });
    assert.notEqual(mismatchedUrl.status, 0);
    assert.match(mismatchedUrl.stderr, /仅支持 sqlite:\/\/\/data\/yuance\.sqlite3/);

    fs.writeFileSync(fixture.envPath, 'YUANCE_DATABASE_URL=sqlite:///data/yuance.sqlite3\n');
    const otherDatabasePath = path.join(fixture.dataDir, 'other.sqlite3');
    fs.writeFileSync(otherDatabasePath, 'fixture-not-a-database');
    const mismatchedPath = runBackup(fixture, {
      YUANCE_BACKUP_REQUIRED: '1',
      YUANCE_SQLITE_PATH: otherDatabasePath,
    });
    assert.notEqual(mismatchedPath.status, 0);
    assert.match(mismatchedPath.stderr, /快照路径必须对应 Compose 的 \/data\/yuance\.sqlite3/);

    fs.writeFileSync(fixture.envPath, 'YUANCE_DATA_DIR: /srv/other-data\n');
    const mismatchedDataDirectory = runBackup(fixture, { YUANCE_BACKUP_REQUIRED: '1' });
    assert.notEqual(mismatchedDataDirectory.status, 0);
    assert.match(mismatchedDataDirectory.stderr, /YUANCE_DATA_DIR=\/data/);
  } finally {
    fixture.cleanup();
  }
});

test('不支持安全解析的 .env 插值会拒绝备份，且不泄露配置值', { skip: !sqlite3Path && '当前环境未安装 sqlite3' }, (t) => {
  const fixture = backupFixture();
  try {
    const initialized = sqlite(['-batch', fixture.dbPath, 'CREATE TABLE entries(value TEXT);']);
    assert.equal(initialized.status, 0, initialized.stderr);
    fs.writeFileSync(path.join(fixture.secretsDir, 'file_master_key'), 'fixture-file-master-key\n', { mode: 0o600 });
    const privateValue = 'private-expansion-value';
    fs.writeFileSync(fixture.envPath, 'YUANCE_FILE_MASTER_KEY=${YUANCE_TEST_SECRET}\n');

    const result = runBackup(fixture);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /无法安全解析/);
    assert.equal(result.stdout.includes(privateValue), false);
    assert.equal(result.stderr.includes(privateValue), false);
    assert.deepEqual(fs.readdirSync(fixture.backupDir), []);
  } finally {
    fixture.cleanup();
  }
});

test('非空但短于应用最小长度的文件主密钥配置会拒绝备份', { skip: !sqlite3Path && '当前环境未安装 sqlite3' }, () => {
  const fixture = backupFixture();
  try {
    const initialized = sqlite(['-batch', fixture.dbPath, 'CREATE TABLE entries(value TEXT);']);
    assert.equal(initialized.status, 0, initialized.stderr);
    fs.writeFileSync(path.join(fixture.secretsDir, 'file_master_key'), 'fixture-file-master-key\n', { mode: 0o600 });

    fs.writeFileSync(fixture.envPath, 'YUANCE_FILE_MASTER_KEY=short\n');
    const dotenvResult = runBackup(fixture);
    assert.notEqual(dotenvResult.status, 0);
    assert.match(dotenvResult.stderr, /长度无效/);
    assert.deepEqual(fs.readdirSync(fixture.backupDir), []);

    const environmentResult = runBackup(fixture, { YUANCE_FILE_MASTER_KEY: 'short' });
    assert.notEqual(environmentResult.status, 0);
    assert.match(environmentResult.stderr, /长度无效/);
    assert.deepEqual(fs.readdirSync(fixture.backupDir), []);
  } finally {
    fixture.cleanup();
  }
});

test('备份被 TERM 中断时以失败退出并清理未完成目录', { skip: !sqlite3Path && '当前环境未安装 sqlite3' }, async () => {
  const fixture = backupFixture();
  const bin = path.join(fixture.root, 'signal-bin');
  const sqliteStub = path.join(bin, 'sqlite3');
  fs.mkdirSync(bin);
  try {
    const initialized = sqlite(['-batch', fixture.dbPath, 'CREATE TABLE entries(value TEXT);']);
    assert.equal(initialized.status, 0, initialized.stderr);
    fs.writeFileSync(path.join(fixture.secretsDir, 'file_master_key'), 'fixture-file-master-key\n', { mode: 0o600 });
    fs.writeFileSync(sqliteStub, [
      '#!/bin/sh',
      'if [ "$2" = "PRAGMA integrity_check;" ]; then',
      '  kill -TERM "$YUANCE_TEST_PARENT_PID"',
      '  printf "ok\\n"',
      '  exit 0',
      'fi',
      'exec "$YUANCE_TEST_REAL_SQLITE" "$@"',
    ].join('\n') + '\n', { mode: 0o700 });

    const result = await new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      const child = spawn(shellPath, ['-c', 'export YUANCE_TEST_PARENT_PID=$$; exec "$1" "$2"', 'backup-test', shellPath, backupScript], {
        cwd: rootDir,
        env: {
          ...fixture.env,
          PATH: `${bin}${path.delimiter}${process.env.PATH}`,
          YUANCE_TEST_REAL_SQLITE: sqlite3Path,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`备份脚本未在 TERM 后退出：${stdout}\n${stderr}`));
      }, 5000);
      child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
      child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('close', (code, signal) => {
        clearTimeout(timer);
        resolve({ code, signal, stdout, stderr });
      });
    });

    assert.notEqual(result.code, 0);
    assert.doesNotMatch(result.stdout, /SQLite 一致性备份完成/);
    assert.deepEqual(fs.readdirSync(fixture.backupDir), []);
  } finally {
    fixture.cleanup();
  }
});

test('拒绝系统或临时目录中的备份根目录，且不触发目录创建副作用', { skip: !sqlite3Path && '当前环境未安装 sqlite3' }, (t) => {
  const fixture = backupFixture();
  const bin = path.join(fixture.root, 'dangerous-path-bin');
  fs.mkdirSync(bin);
  for (const command of ['mkdir', 'chmod', 'mktemp']) {
    fs.writeFileSync(path.join(bin, command), `#!/bin/sh\nprintf "${command} %s\\n" "$*" >> "$YUANCE_TEST_CALL_LOG"\nexit 90\n`, { mode: 0o700 });
  }
  try {
    const initialized = sqlite(['-batch', fixture.dbPath, 'CREATE TABLE entries(value TEXT);']);
    assert.equal(initialized.status, 0, initialized.stderr);
    const dangerousRoots = ['/', '/tmp', '/tmp/yuance-backups', '/var/tmp/yuance-backups'];
    for (const canonicalTempRoot of ['/private/tmp', '/private/var/tmp']) {
      if (fs.existsSync(canonicalTempRoot)) dangerousRoots.push(path.join(canonicalTempRoot, 'yuance-backups'));
    }
    for (const dangerousRoot of dangerousRoots) {
      const callLog = path.join(fixture.root, 'dangerous-path-calls.log');
      const result = spawnSync(shellPath, [backupScript], {
        cwd: rootDir,
        env: {
          ...fixture.env,
          PATH: `${bin}${path.delimiter}${process.env.PATH}`,
          YUANCE_BACKUP_DIR: dangerousRoot,
          YUANCE_TEST_CALL_LOG: callLog,
        },
        encoding: 'utf8',
      });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /拒绝使用系统根目录或临时目录/);
      assert.equal(fs.existsSync(callLog), false);
    }
  } finally {
    fixture.cleanup();
  }
});

test('拒绝通过父级符号链接指向数据或临时目录的备份路径', { skip: !sqlite3Path && '当前环境未安装 sqlite3' }, () => {
  const fixture = backupFixture();
  const bin = path.join(fixture.root, 'symlink-path-bin');
  const callLog = path.join(fixture.root, 'symlink-path-calls.log');
  fs.mkdirSync(bin);
  for (const command of ['mkdir', 'chmod', 'mktemp']) {
    fs.writeFileSync(path.join(bin, command), `#!/bin/sh\nprintf "${command} %s\\n" "$*" >> "$YUANCE_TEST_CALL_LOG"\nexit 90\n`, { mode: 0o700 });
  }
  const aliases = [
    ['data-alias', fixture.dataDir],
    ['tmp-alias', '/tmp'],
  ];
  try {
    const initialized = sqlite(['-batch', fixture.dbPath, 'CREATE TABLE entries(value TEXT);']);
    assert.equal(initialized.status, 0, initialized.stderr);
    fs.writeFileSync(path.join(fixture.secretsDir, 'file_master_key'), 'fixture-file-master-key\n', { mode: 0o600 });

    for (const [aliasName, target] of aliases) {
      const aliasPath = path.join(fixture.root, aliasName);
      fs.symlinkSync(target, aliasPath, 'dir');
      const result = runBackup(fixture, {
        PATH: `${bin}${path.delimiter}${process.env.PATH}`,
        YUANCE_BACKUP_DIR: path.join(aliasPath, 'backups'),
        YUANCE_TEST_CALL_LOG: callLog,
      });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /符号链接路径/);
      assert.equal(fs.existsSync(callLog), false);
      fs.rmSync(aliasPath);
    }
    assert.deepEqual(fs.readdirSync(fixture.backupDir), []);
  } finally {
    fixture.cleanup();
  }
});

test('拒绝大小写别名指向应用数据目录的备份路径', { skip: !sqlite3Path && '当前环境未安装 sqlite3' }, (t) => {
  const fixture = backupFixture();
  try {
    if (!fs.existsSync(path.join(fixture.root, 'DATA'))) {
      t.skip('当前文件系统对路径大小写敏感');
      return;
    }

    const initialized = sqlite(['-batch', fixture.dbPath, 'CREATE TABLE entries(value TEXT);']);
    assert.equal(initialized.status, 0, initialized.stderr);
    fs.writeFileSync(path.join(fixture.secretsDir, 'file_master_key'), 'fixture-file-master-key\n', { mode: 0o600 });

    const aliasBackupPath = path.join(fixture.root, 'DATA', 'backups');
    const result = runBackup(fixture, { YUANCE_BACKUP_DIR: aliasBackupPath });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /备份目录不得位于应用数据目录内/);
    assert.equal(fs.existsSync(path.join(fixture.dataDir, 'backups')), false);
  } finally {
    fixture.cleanup();
  }
});

test('自动文件主密钥缺失、快照失败或完整性失败时清理未完成备份', { skip: !sqlite3Path && '当前环境未安装 sqlite3' }, (t) => {
  const fixture = backupFixture();
  try {
    let initialized = sqlite(['-batch', fixture.dbPath, 'CREATE TABLE entries(value TEXT);']);
    assert.equal(initialized.status, 0, initialized.stderr);

    const missingKey = runBackup(fixture);
    assert.notEqual(missingKey.status, 0);
    assert.match(missingKey.stderr, /文件主密钥缺失/);
    assert.deepEqual(fs.readdirSync(fixture.backupDir), []);

    fs.writeFileSync(path.join(fixture.secretsDir, 'file_master_key'), 'fixture-file-master-key\n', { mode: 0o600 });
    const stubBin = path.join(fixture.root, 'bin');
    fs.mkdirSync(stubBin);
    const sqliteStub = path.join(stubBin, 'sqlite3');
    fs.writeFileSync(sqliteStub, '#!/bin/sh\nexit 9\n', { mode: 0o700 });
    const snapshotFailure = runBackup(fixture, { PATH: `${stubBin}${path.delimiter}${process.env.PATH}` });
    assert.notEqual(snapshotFailure.status, 0);
    assert.match(snapshotFailure.stderr, /在线快照创建失败/);
    assert.deepEqual(fs.readdirSync(fixture.backupDir), []);

    fs.writeFileSync(sqliteStub, '#!/bin/sh\nif [ "$2" = "PRAGMA integrity_check;" ]; then printf "broken\\n"; exit 0; fi\nexec "$YUANCE_TEST_REAL_SQLITE" "$@"\n', { mode: 0o700 });
    const integrityFailure = runBackup(fixture, {
      PATH: `${stubBin}${path.delimiter}${process.env.PATH}`,
      YUANCE_TEST_REAL_SQLITE: sqlite3Path,
    });
    assert.notEqual(integrityFailure.status, 0);
    assert.match(integrityFailure.stderr, /完整性校验失败/);
    assert.deepEqual(fs.readdirSync(fixture.backupDir), []);
  } finally {
    fixture.cleanup();
  }
});
