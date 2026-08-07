import test from 'node:test';
import assert from 'node:assert/strict';

import {
  defineDownloadCapabilities,
  defineFileCapabilities,
  defineHostDelegatedAttachmentCapabilities,
  defineHostDelegatedFileCapabilities,
  definePlatformCapabilities,
  defineRouterCapabilities,
  defineStatusCapabilities,
  defineTransferCapabilities,
} from '@yuance/frontend-platform-contract';

/** @typedef {import('@yuance/frontend-platform-contract').FileCapability} FileCapability */
/** @typedef {import('@yuance/frontend-platform-contract').PlatformCapabilities} RootPlatformCapabilities */
/** @typedef {import('@yuance/frontend-platform-contract').SignedTransferCapability} SignedTransferCapability */

test('platform capability definitions preserve injected adapters', () => {
  const files = defineFileCapabilities({
    chooseFile: async () => null,
    uploadSignedRequest: async () => {},
  });
  const downloads = defineDownloadCapabilities({
    downloadSignedRequest: async () => {},
  });
  const transfers = defineTransferCapabilities({
    authorizeSignedRequest: (request) => /** @type {SignedTransferCapability} */ (request),
  });
  const router = defineRouterCapabilities({
    currentPath: () => '/work-items',
    navigate: () => {},
  });
  const status = defineStatusCapabilities({ report: () => {} });

  const platform = definePlatformCapabilities({ files, downloads, transfers, router, status });

  assert.equal(platform.files, files);
  assert.equal(platform.downloads, downloads);
  assert.equal(platform.transfers, transfers);
  assert.equal(platform.router, router);
  assert.equal(platform.status, status);
});

test('host-delegated file capabilities preserve opaque desktop operations', () => {
  const capabilities = defineHostDelegatedFileCapabilities({
    chooseFile: async () => null,
    uploadCanary: async () => ({ status: 'completed' }),
    downloadCanary: async () => ({ status: 'cancelled' }),
  });
  assert.deepEqual(Object.keys(capabilities).sort(), ['chooseFile', 'downloadCanary', 'uploadCanary']);
  assert.throws(() => defineHostDelegatedFileCapabilities({ chooseFile: async () => null }), /uploadCanary/);
});

test('host-delegated attachment capabilities require the complete business matrix', () => {
  const capabilities = defineHostDelegatedAttachmentCapabilities({
    uploadWorkItemAttachment: async () => ({ created: {}, uploaded: {} }),
    uploadWorkItemCommentAttachment: async () => ({ created: {}, uploaded: {} }),
    downloadWorkItemAttachment: async () => ({ status: 'completed' }),
    downloadWorkItemCommentAttachment: async () => ({ status: 'cancelled' }),
    uploadProjectAttachment: async () => ({ created: {}, uploaded: {} }),
    downloadProjectAttachment: async () => ({ status: 'completed' }),
    revealDownload: async () => ({ status: 'revealed' }),
  });
  assert.deepEqual(Object.keys(capabilities).sort(), [
    'downloadProjectAttachment',
    'downloadWorkItemAttachment',
    'downloadWorkItemCommentAttachment',
    'revealDownload',
    'uploadProjectAttachment',
    'uploadWorkItemAttachment',
    'uploadWorkItemCommentAttachment',
  ]);
  assert.throws(() => defineHostDelegatedAttachmentCapabilities({}), /uploadWorkItemAttachment/);
});

test('platform capability definitions reject missing operations', () => {
  assert.throws(
    () => defineFileCapabilities({ chooseFile: async () => null }),
    /uploadSignedRequest/,
  );
  assert.throws(
    () => defineDownloadCapabilities({}),
    /downloadSignedRequest/,
  );
  assert.throws(
    () => defineTransferCapabilities({}),
    /authorizeSignedRequest/,
  );
  assert.throws(
    () => defineRouterCapabilities({ currentPath: () => '/work-items' }),
    /navigate/,
  );
  assert.throws(
    () => defineStatusCapabilities({}),
    /report/,
  );
  assert.throws(
    () => definePlatformCapabilities(/** @type {never} */ ({
      files: {},
      downloads: {},
      transfers: {},
      router: {},
      status: {},
    })),
    /chooseFile/,
  );
  assert.throws(
    () => definePlatformCapabilities(/** @type {never} */ (null)),
    /must be an object/,
  );
});

test('package root exposes the platform capability type', () => {
  const operation = async () => {};
  const currentPath = () => '/work-items';
  const navigate = () => {};
  const report = () => {};
  const chooseFile = async () => null;
  /** @type {RootPlatformCapabilities} */
  const platform = {
    files: { chooseFile, uploadSignedRequest: operation },
    downloads: { downloadSignedRequest: operation },
    transfers: {
      authorizeSignedRequest: (request) => /** @type {SignedTransferCapability} */ (request),
    },
    router: { currentPath, navigate },
    status: { report },
  };

  assert.equal(platform.router.currentPath(), '/work-items');
});

test('opaque capabilities cannot be constructed as plain objects', () => {
  /** @param {FileCapability} _capability */
  const acceptFileCapability = (_capability) => {};
  /** @param {SignedTransferCapability} _capability */
  const acceptTransferCapability = (_capability) => {};

  // @ts-expect-error host-issued file capabilities are intentionally opaque
  acceptFileCapability({});
  // @ts-expect-error host-authorized transfer capabilities are intentionally opaque
  acceptTransferCapability({});
});
