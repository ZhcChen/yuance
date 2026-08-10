// @ts-check

/**
 * @typedef {object} NavigateOptions
 * @property {boolean} [replace]
 */

/**
 * @typedef {object} RouterCapabilities
 * @property {() => string} currentPath
 * @property {(path: string, options?: NavigateOptions) => void} navigate
 */

/**
 * @param {Partial<RouterCapabilities>} capabilities
 * @returns {RouterCapabilities}
 */
export function defineRouterCapabilities(capabilities) {
  if (!capabilities || typeof capabilities !== 'object' || Array.isArray(capabilities)) {
    throw new TypeError('platform capabilities must be an object');
  }
  if (typeof capabilities.currentPath !== 'function') {
    throw new TypeError('platform capability requires currentPath()');
  }
  if (typeof capabilities.navigate !== 'function') {
    throw new TypeError('platform capability requires navigate()');
  }
  return /** @type {RouterCapabilities} */ (capabilities);
}
