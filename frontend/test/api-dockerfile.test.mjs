import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('API Dockerfile provides shared frontend packages before web npm ci', async () => {
  const dockerfile = await readFile(new URL('../../api/Dockerfile', import.meta.url), 'utf8');
  const frontendWorkdirIndex = dockerfile.indexOf('WORKDIR /src/frontend');
  const frontendInstallIndex = dockerfile.indexOf('RUN npm ci', frontendWorkdirIndex);
  const webWorkdirIndex = dockerfile.indexOf('WORKDIR /src/web');
  const webInstallIndex = dockerfile.indexOf('RUN npm ci', webWorkdirIndex);

  assert.notEqual(frontendWorkdirIndex, -1, 'API Dockerfile should create a frontend workspace');
  assert.ok(frontendInstallIndex > frontendWorkdirIndex, 'shared frontend dependencies should be installed');
  assert.ok(webWorkdirIndex > frontendInstallIndex, 'web install should follow the shared workspace install');
  assert.ok(webInstallIndex > webWorkdirIndex, 'API Dockerfile should install web dependencies');

  for (const packageName of ['api-client', 'app-core', 'platform-contract', 'ui']) {
    const copyIndex = dockerfile.indexOf(
      `COPY frontend/packages/${packageName}/package.json packages/${packageName}/package.json`,
    );
    assert.notEqual(copyIndex, -1, `API Dockerfile should copy the ${packageName} manifest`);
    assert.ok(copyIndex < frontendInstallIndex, `${packageName} must join the workspace before npm ci`);
  }

  const sourceCopyIndex = dockerfile.indexOf('COPY frontend/packages ./packages');
  assert.ok(sourceCopyIndex > frontendInstallIndex, 'shared source should be copied after dependency install');
  assert.ok(sourceCopyIndex < webInstallIndex, 'shared source should be available before web install');
});

test('API Dockerfile provides every Rust workspace member before cargo build', async () => {
  const [dockerfile, workspaceManifest] = await Promise.all([
    readFile(new URL('../../api/Dockerfile', import.meta.url), 'utf8'),
    readFile(new URL('../../Cargo.toml', import.meta.url), 'utf8'),
  ]);
  const buildIndex = dockerfile.indexOf('RUN cargo build --release -p yuance-api');
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
});
