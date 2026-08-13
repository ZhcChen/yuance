import test from 'node:test';
import assert from 'node:assert/strict';

import {
  APP_UPDATE_CHECK_INTERVAL_MS,
  createAppUpdateController,
  isReleaseUpdate,
  releaseVersionFromPayload,
} from '@yuance/frontend-app-core';

test('app update treats only non-empty different versions as an update', () => {
  assert.equal(isReleaseUpdate('0.1.0', '0.1.0'), false);
  assert.equal(isReleaseUpdate('', '0.1.1'), false);
  assert.equal(isReleaseUpdate('0.1.0', ''), false);
  assert.equal(isReleaseUpdate('0.1.0', '0.1.1'), true);
});

test('app update manifest payload keeps a trimmed string version', () => {
  assert.equal(releaseVersionFromPayload(null), '');
  assert.equal(releaseVersionFromPayload({}), '');
  assert.equal(releaseVersionFromPayload({ version: 1 }), '');
  assert.equal(releaseVersionFromPayload({ version: ' 0.1.1 ' }), '0.1.1');
});

test('app update controller prompts once when manifest has a new version', async () => {
  const prompts = [];
  const controller = createAppUpdateController({
    currentVersion: '0.1.0',
    fetchManifest: async () => ({ version: '0.1.1' }),
    onPrompt: (version) => prompts.push(version),
  });

  assert.equal(await controller.check(), true);
  assert.deepEqual(prompts, ['0.1.1']);
  assert.equal(await controller.check(), false);
  assert.deepEqual(prompts, ['0.1.1']);
});

test('app update controller skips missing or identical manifest versions', async () => {
  const prompts = [];
  const controller = createAppUpdateController({
    currentVersion: '0.1.0',
    fetchManifest: async () => ({ version: '0.1.0' }),
    onPrompt: (version) => prompts.push(version),
  });

  assert.equal(await controller.check(), false);
  assert.deepEqual(prompts, []);
});

test('app update controller keeps manifest checks single-flight', async () => {
  let fetches = 0;
  let releaseFetch = /** @type {(value: unknown) => void} */ (() => {});
  const gate = new Promise((resolve) => {
    releaseFetch = resolve;
  });
  const prompts = [];
  const controller = createAppUpdateController({
    currentVersion: '0.1.0',
    fetchManifest: () => {
      fetches += 1;
      return gate.then(() => ({ version: '0.1.1' }));
    },
    onPrompt: (version) => prompts.push(version),
  });

  const first = controller.check();
  const second = controller.check();
  await Promise.resolve();
  assert.equal(fetches, 1);
  releaseFetch(undefined);
  assert.deepEqual(await Promise.all([first, second]), [true, false]);
  assert.deepEqual(prompts, ['0.1.1']);
});

test('app update controller reacts to realtime version and honors deferral', async () => {
  const prompts = [];
  const controller = createAppUpdateController({
    currentVersion: '0.1.0',
    fetchManifest: async () => ({ version: '0.1.2' }),
    onPrompt: (version) => prompts.push(version),
  });

  assert.equal(controller.handleRealtimeVersion('0.1.2'), true);
  controller.defer('0.1.2');
  assert.equal(await controller.check(), false);
  assert.deepEqual(prompts, ['0.1.2']);
});

test('app update controller disposes and stops prompting', async () => {
  const prompts = [];
  const controller = createAppUpdateController({
    currentVersion: '0.1.0',
    fetchManifest: async () => ({ version: '0.1.3' }),
    onPrompt: (version) => prompts.push(version),
  });
  controller.dispose();

  assert.equal(await controller.check(), false);
  assert.equal(controller.handleRealtimeVersion('0.1.3'), false);
  assert.deepEqual(prompts, []);
  assert.equal(APP_UPDATE_CHECK_INTERVAL_MS, 300000);
});
