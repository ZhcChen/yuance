import assert from 'node:assert/strict';
import test from 'node:test';

import { downloadSystemReleaseAsset, uploadSystemReleaseAsset } from '@yuance/frontend-app-core';

const file = { capability: {}, filename: 'desktop.exe', contentType: 'application/octet-stream', byteSize: 12, checksumSha256: 'a'.repeat(64) };
const created = { id: 19, status: 'pending' };
const uploaded = { id: 19, status: 'uploaded' };

test('browser release asset upload follows register sign transfer confirm and refresh', async () => {
  const calls = [];
  const result = await uploadSystemReleaseAsset({ api: api(calls), platform: browserPlatform(calls), releaseId: 7, platformName: 'windows', architecture: 'x64', artifactKind: 'installer', file, lifecycle: lifecycle(calls) });
  assert.equal(result.completed, true);
  assert.deepEqual(calls.map(([name]) => name), ['stage:registering', 'create', 'created', 'stage:signing', 'sign-upload', 'authorize:upload', 'stage:uploading', 'upload', 'stage:confirming', 'confirm', 'uploaded', 'refresh']);
});

test('desktop release asset upload delegates bytes and signing to the host', async () => {
  const calls = [];
  const result = await uploadSystemReleaseAsset({ api: { createSystemReleaseAsset: async () => { throw new Error('renderer must not register'); } }, platform: { releaseAssets: { uploadSystemReleaseAsset: async (input, onStage) => { calls.push(['delegate', input]); onStage('registering', created); onStage('signing'); onStage('uploading'); onStage('confirming'); return { created, uploaded }; } } }, releaseId: 7, platformName: 'windows', architecture: 'x64', artifactKind: 'installer', file, lifecycle: lifecycle(calls) });
  assert.equal(result.completed, true);
  assert.deepEqual(calls[0], ['delegate', { releaseId: 7, platform: 'windows', architecture: 'x64', artifactKind: 'installer', fileCapability: file.capability }]);
});

test('release asset download uses browser signing or desktop delegation without mixing boundaries', async () => {
  const browserCalls = [];
  assert.deepEqual(await downloadSystemReleaseAsset({ api: api(browserCalls), platform: browserPlatform(browserCalls), releaseId: 7, assetId: 19, suggestedFilename: 'desktop.exe', isCurrent: () => true }), { status: 'completed' });
  assert.deepEqual(browserCalls.map(([name]) => name), ['sign-download', 'authorize:download', 'download']);
  const desktopCalls = [];
  const value = await downloadSystemReleaseAsset({ api: { getSystemReleaseAssetDownloadUrl: async () => { throw new Error('renderer must not sign'); } }, platform: { releaseAssets: { downloadSystemReleaseAsset: async (input) => { desktopCalls.push(input); return { status: 'completed' }; } } }, releaseId: 7, assetId: 19, suggestedFilename: 'desktop.exe', isCurrent: () => true });
  assert.deepEqual(value, { status: 'completed' });
  assert.deepEqual(desktopCalls, [{ releaseId: 7, assetId: 19, suggestedFilename: 'desktop.exe' }]);
});

function api(calls) {
  return { createSystemReleaseAsset: async () => { calls.push(['create']); return created; }, getSystemReleaseAssetUploadUrl: async () => { calls.push(['sign-upload']); return { request: {}, expires_in_seconds: 60 }; }, markSystemReleaseAssetUploaded: async () => { calls.push(['confirm']); return uploaded; }, getSystemReleaseAssetDownloadUrl: async () => { calls.push(['sign-download']); return { request: {}, expires_in_seconds: 60 }; } };
}
function browserPlatform(calls) {
  return { transfers: { authorizeSignedRequest: ({ purpose }) => { calls.push([`authorize:${purpose}`]); return {}; } }, files: { uploadSignedRequest: async () => calls.push(['upload']) }, downloads: { downloadSignedRequest: async () => calls.push(['download']) } };
}
function lifecycle(calls) {
  return { isCurrent: () => true, onStage: (stage) => calls.push([`stage:${stage}`]), onCreated: () => calls.push(['created']), onUploaded: () => calls.push(['uploaded']), refresh: async () => calls.push(['refresh']) };
}
