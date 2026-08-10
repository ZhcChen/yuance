// @ts-check

import {
  defineDownloadCapabilities,
  defineFileCapabilities,
  defineTransferCapabilities,
} from './files.js';
import { defineRouterCapabilities } from './router.js';

/** @typedef {import('./files.js').FileCapabilities} FileCapabilities */
/** @typedef {import('./files.js').DownloadCapabilities} DownloadCapabilities */
/** @typedef {import('./files.js').TransferCapabilities} TransferCapabilities */
/** @typedef {import('./router.js').RouterCapabilities} RouterCapabilities */

/**
 * @typedef {'info' | 'success' | 'error'} StatusKind
 */

/**
 * @typedef {object} StatusMessage
 * @property {StatusKind} kind
 * @property {string} message
 */

/**
 * @typedef {object} StatusCapabilities
 * @property {(status: StatusMessage) => void} report
 */

/**
 * @typedef {object} PlatformCapabilities
 * @property {FileCapabilities} files
 * @property {DownloadCapabilities} downloads
 * @property {TransferCapabilities} transfers
 * @property {RouterCapabilities} router
 * @property {StatusCapabilities} status
 */

/**
 * @param {Partial<StatusCapabilities>} capabilities
 * @returns {StatusCapabilities}
 */
export function defineStatusCapabilities(capabilities) {
  if (!capabilities || typeof capabilities !== 'object' || Array.isArray(capabilities)) {
    throw new TypeError('platform capabilities must be an object');
  }
  if (typeof capabilities.report !== 'function') {
    throw new TypeError('platform capability requires report()');
  }
  return /** @type {StatusCapabilities} */ (capabilities);
}

/**
 * @param {PlatformCapabilities} capabilities
 * @returns {PlatformCapabilities}
 */
export function definePlatformCapabilities(capabilities) {
  if (!capabilities || typeof capabilities !== 'object' || Array.isArray(capabilities)) {
    throw new TypeError('platform capabilities must be an object');
  }
  if (!capabilities.files || !capabilities.downloads || !capabilities.transfers || !capabilities.router || !capabilities.status) {
    throw new TypeError('platform capabilities require files, downloads, transfers, router, and status');
  }
  defineFileCapabilities(capabilities.files);
  defineDownloadCapabilities(capabilities.downloads);
  defineTransferCapabilities(capabilities.transfers);
  defineRouterCapabilities(capabilities.router);
  defineStatusCapabilities(capabilities.status);
  return capabilities;
}
