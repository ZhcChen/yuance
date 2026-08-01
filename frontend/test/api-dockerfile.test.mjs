import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('API Dockerfile provides shared frontend packages before web npm ci', async () => {
  const dockerfile = await readFile(new URL('../../api/Dockerfile', import.meta.url), 'utf8');
  const installIndex = dockerfile.indexOf('RUN npm ci');
  assert.notEqual(installIndex, -1, 'API Dockerfile should install web dependencies');

  for (const packageName of ['api-client', 'app-core', 'platform-contract', 'ui']) {
    const copyIndex = dockerfile.indexOf(
      `COPY frontend/packages/${packageName} /src/frontend/packages/${packageName}`,
    );
    assert.notEqual(copyIndex, -1, `API Dockerfile should copy ${packageName}`);
    assert.ok(copyIndex < installIndex, `${packageName} must be available before npm ci`);
  }
});
