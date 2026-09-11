import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('API Dockerfile provides shared frontend packages before web npm ci', async () => {
  const dockerfile = await readFile(new URL('../../api/Dockerfile', import.meta.url), 'utf8');
  const frontendWorkdirIndex = dockerfile.indexOf('WORKDIR /src/frontend');
  const frontendInstallIndex = dockerfile.indexOf('npm ci', frontendWorkdirIndex);
  const webWorkdirIndex = dockerfile.indexOf('WORKDIR /src/web');
  const webInstallIndex = dockerfile.indexOf('npm ci', webWorkdirIndex);

  assert.notEqual(frontendWorkdirIndex, -1, 'API Dockerfile should create a frontend workspace');
  assert.ok(frontendInstallIndex > frontendWorkdirIndex, 'shared frontend dependencies should be installed');
  assert.ok(webWorkdirIndex > frontendInstallIndex, 'web install should follow the shared workspace install');
  assert.ok(webInstallIndex > webWorkdirIndex, 'API Dockerfile should install web dependencies');

  for (const packageName of ['api-client', 'app-core', 'app-shell', 'platform-contract', 'ui']) {
    const copyIndex = dockerfile.indexOf(
      `COPY frontend/packages/${packageName}/package.json packages/${packageName}/package.json`,
    );
    assert.notEqual(copyIndex, -1, `API Dockerfile should copy the ${packageName} manifest`);
    assert.ok(copyIndex < frontendInstallIndex, `${packageName} must join the workspace before npm ci`);
  }

  const sourceCopyIndex = dockerfile.indexOf('COPY frontend/packages ./packages');
  assert.ok(sourceCopyIndex > frontendInstallIndex, 'shared source should be copied after dependency install');
  assert.ok(sourceCopyIndex < webInstallIndex, 'shared source should be available before web install');
  assert.match(dockerfile, /RUN --mount=type=cache,id=yuance-npm[^\n]+\n\s+npm ci/);
  assert.match(dockerfile, /YUANCE_SKIP_FRONTEND_CHECK=0/);
  assert.match(dockerfile, /npm run check && npm run build/);
  assert.match(dockerfile, /YUANCE_SKIP_FRONTEND_CHECK.*npm run build/s);
});

test('API Dockerfile provides every Rust workspace member before cargo build', async () => {
  const [dockerfile, workspaceManifest] = await Promise.all([
    readFile(new URL('../../api/Dockerfile', import.meta.url), 'utf8'),
    readFile(new URL('../../Cargo.toml', import.meta.url), 'utf8'),
  ]);
  const buildIndex = dockerfile.indexOf('cargo build --locked --release -p yuance-api');
  const membersMatch = workspaceManifest.match(/members\s*=\s*\[([^\]]+)\]/s);

  assert.notEqual(buildIndex, -1, 'API Dockerfile should build yuance-api');
  assert.ok(membersMatch, 'root Cargo.toml should declare workspace members');

  const members = [...membersMatch[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  assert.ok(members.length > 0, 'workspace should contain at least one member');

  for (const member of members) {
    const manifestCopyIndex = dockerfile.indexOf(`COPY ${member}/Cargo.toml ${member}/Cargo.toml`);
    const sourceCopyIndex = dockerfile.indexOf(`COPY ${member}/src ${member}/src`);
    assert.ok(manifestCopyIndex >= 0 && manifestCopyIndex < buildIndex, `${member} manifest must exist before cargo build`);
    assert.ok(sourceCopyIndex >= 0 && sourceCopyIndex < buildIndex, `${member} source must exist before cargo build`);
  }

  assert.match(dockerfile, /id=yuance-cargo-registry,target=\/usr\/local\/cargo\/registry/);
  assert.match(dockerfile, /id=yuance-cargo-git,target=\/usr\/local\/cargo\/git/);
  assert.match(dockerfile, /ARG BUILDARCH[\s\S]*ARG TARGETARCH/);
  assert.match(dockerfile, /id=yuance-cargo-target-\$\{BUILDARCH\}-\$\{TARGETARCH\},target=\/src\/target/);
  assert.match(dockerfile, /cp \/src\/target\/release\/yuance-api \/tmp\/yuance-api/);
  assert.match(dockerfile, /COPY --from=builder \/tmp\/yuance-api \/app\/yuance-api/);
});

test('正式镜像脚本复用外部前端检查结果', async () => {
  const script = await readFile(new URL('../../scripts/build-api-image-amd64.sh', import.meta.url), 'utf8');

  assert.match(script, /npm run check:frontend/);
  assert.match(script, /YUANCE_SKIP_FRONTEND_CHECK=1/);
});

test('发布版本参数不会使 runtime apt 层失效', async () => {
  const dockerfile = await readFile(new URL('../../api/Dockerfile', import.meta.url), 'utf8');
  const runtimeIndex = dockerfile.indexOf('FROM ${DEBIAN_IMAGE}');
  const aptIndex = dockerfile.indexOf('RUN apt-get -o Acquire::ForceIPv4=true update', runtimeIndex);
  const releaseArgIndex = dockerfile.indexOf('ARG YUANCE_BUILD_RELEASE_VERSION', runtimeIndex);

  assert.ok(aptIndex > runtimeIndex, 'runtime apt layer should remain in the runtime stage');
  assert.ok(releaseArgIndex > aptIndex, 'release version should be declared after runtime apt installation');
});
