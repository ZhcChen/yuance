// @ts-check

/** @typedef {import('./files.js').DownloadCapabilities} DownloadCapabilities */
/** @typedef {import('./files.js').FileCapabilities} FileCapabilities */
/** @typedef {import('./files.js').FileCapability} FileCapability */
/** @typedef {import('./files.js').SelectedFile} SelectedFile */
/** @typedef {import('./files.js').SignedTransferCapability} SignedTransferCapability */
/** @typedef {import('./files.js').TransferCapabilities} TransferCapabilities */
/** @typedef {import('./platform.js').PlatformCapabilities} PlatformCapabilities */
/** @typedef {import('./platform.js').StatusCapabilities} StatusCapabilities */
/** @typedef {import('./router.js').RouterCapabilities} RouterCapabilities */

export const PLATFORM_CONTRACT_PACKAGE_NAME = '@yuance/frontend-platform-contract';
export {
  defineDownloadCapabilities,
  defineFileCapabilities,
  defineTransferCapabilities,
} from './files.js';
export { definePlatformCapabilities, defineStatusCapabilities } from './platform.js';
export { defineRouterCapabilities } from './router.js';
