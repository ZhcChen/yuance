import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { findDisallowedSourceFiles } from '../scripts/assert-js-only.mjs';

test('findDisallowedSourceFiles reports TypeScript source files', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'yuance-js-only-'));
  try {
    await mkdir(path.join(root, 'packages', 'sample', 'src'), { recursive: true });
    await writeFile(path.join(root, 'packages', 'sample', 'src', 'index.js'), 'export const ok = true;\n');
    await writeFile(path.join(root, 'packages', 'sample', 'src', 'bad.ts'), 'export const bad = true;\n');
    await writeFile(path.join(root, 'packages', 'sample', 'src', 'bad.tsx'), 'export const bad = true;\n');
    await writeFile(path.join(root, 'packages', 'sample', 'src', 'bad.cjs'), 'module.exports = true;\n');

    const invalidFiles = await findDisallowedSourceFiles(['packages'], root);

    assert.deepEqual(invalidFiles, [
      path.join('packages', 'sample', 'src', 'bad.cjs'),
      path.join('packages', 'sample', 'src', 'bad.ts'),
      path.join('packages', 'sample', 'src', 'bad.tsx'),
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
