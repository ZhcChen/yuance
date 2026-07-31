import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { analyzePackageBoundaries } from '../scripts/assert-package-boundaries.mjs';

const PACKAGE_MANIFESTS = {
  'platform-contract': {
    name: '@yuance/frontend-platform-contract',
  },
  'api-client': {
    name: '@yuance/frontend-api-client',
  },
  'app-core': {
    name: '@yuance/frontend-app-core',
    dependencies: {
      '@yuance/frontend-api-client': '0.1.0',
      '@yuance/frontend-platform-contract': '0.1.0',
    },
  },
  ui: {
    name: '@yuance/frontend-ui',
  },
};

async function createWorkspace() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'yuance-boundaries-'));
  for (const [packageName, manifest] of Object.entries(PACKAGE_MANIFESTS)) {
    await mkdir(path.join(root, 'packages', packageName, 'src'), { recursive: true });
    await writeFile(
      path.join(root, 'packages', packageName, 'package.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    await writeFile(path.join(root, 'packages', packageName, 'src', 'index.js'), 'export const marker = true;\n');
  }
  return root;
}

test('analyzePackageBoundaries allows app-core to import public package roots', async () => {
  const root = await createWorkspace();
  try {
    await writeFile(
      path.join(root, 'packages', 'app-core', 'src', 'index.js'),
      [
        "import { marker as apiMarker } from '@yuance/frontend-api-client';",
        "import { marker as platformMarker } from '@yuance/frontend-platform-contract';",
        'export const marker = apiMarker && platformMarker;',
        '',
      ].join('\n'),
    );

    assert.deepEqual(await analyzePackageBoundaries(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('analyzePackageBoundaries rejects package-name deep imports and forbidden package imports', async () => {
  const root = await createWorkspace();
  try {
    await writeFile(
      path.join(root, 'packages', 'ui', 'src', 'index.jsx'),
      [
        "import { marker } from '@yuance/frontend-api-client/src/index.js';",
        'export const value = marker;',
        '',
      ].join('\n'),
    );

    const failures = await analyzePackageBoundaries(root);

    assert.ok(failures.some((failure) => failure.includes('禁止 deep import')));
    assert.ok(failures.some((failure) => failure.includes('@yuance/frontend-ui 不允许导入 @yuance/frontend-api-client')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('analyzePackageBoundaries rejects relative cross-package imports', async () => {
  const root = await createWorkspace();
  try {
    await writeFile(
      path.join(root, 'packages', 'ui', 'src', 'index.jsx'),
      [
        "import { marker } from '../../api-client/src/index.js';",
        'export const value = marker;',
        '',
      ].join('\n'),
    );

    const failures = await analyzePackageBoundaries(root);

    assert.ok(failures.some((failure) => failure.includes('禁止相对路径跨包导入')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('analyzePackageBoundaries rejects host imports', async (t) => {
  const cases = [
    { source: "import electron from 'electron';", expected: 'electron' },
    { source: "import ipcRenderer from 'ipcRenderer';", expected: 'ipcRenderer' },
    { source: "import fs from 'fs';", expected: 'fs' },
    { source: "import fs from 'node:fs';", expected: 'node:fs' },
  ];

  for (const scenario of cases) {
    await t.test(scenario.expected, async () => {
      const root = await createWorkspace();
      try {
        await writeFile(
          path.join(root, 'packages', 'api-client', 'src', 'index.js'),
          [
            scenario.source,
            'export const value = true;',
            '',
          ].join('\n'),
        );

        const failures = await analyzePackageBoundaries(root);

        assert.ok(failures.some((failure) => failure.includes(scenario.expected)));
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  }
});

test('analyzePackageBoundaries rejects host globals', async (t) => {
  const cases = [
    { source: 'export const value = window.location.href;', expected: 'window' },
    { source: 'export const value = document.title;', expected: 'document' },
    { source: 'export const value = new EventSource("/events");', expected: 'EventSource' },
    { source: 'export const value = fetch("/api");', expected: 'fetch()' },
    { source: 'export const value = localStorage.getItem("key");', expected: 'localStorage' },
    { source: 'export const value = sessionStorage.getItem("key");', expected: 'sessionStorage' },
    { source: 'export const value = process.env.NODE_ENV;', expected: 'process' },
    { source: 'export const value = Buffer.from("ok");', expected: 'Buffer' },
    { source: 'export const value = global.process;', expected: 'global' },
    { source: 'export const value = require("fs");', expected: 'require()' },
    { source: 'export const value = navigator.userAgent;', expected: 'navigator' },
    { source: 'export const value = window.yuanceDesktop;', expected: 'window.yuanceDesktop' },
  ];

  for (const scenario of cases) {
    await t.test(scenario.expected, async () => {
      const root = await createWorkspace();
      try {
        await writeFile(
          path.join(root, 'packages', 'api-client', 'src', 'index.js'),
          `${scenario.source}\n`,
        );

        const failures = await analyzePackageBoundaries(root);

        assert.ok(failures.some((failure) => failure.includes(scenario.expected)));
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  }
});

test('analyzePackageBoundaries rejects package manifest drift', async () => {
  const root = await createWorkspace();
  try {
    await writeFile(
      path.join(root, 'packages', 'ui', 'package.json'),
      `${JSON.stringify({
        name: '@yuance/frontend-ui',
        dependencies: {
          '@yuance/frontend-api-client': '0.1.0',
        },
      }, null, 2)}\n`,
    );

    const failures = await analyzePackageBoundaries(root);

    assert.ok(failures.some((failure) => failure.includes('未允许的内部依赖 @yuance/frontend-api-client')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
