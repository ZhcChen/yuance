// @ts-check

export const APP_UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;
export const APP_UPDATE_MANIFEST_URL = '/version.json';

/**
 * @param {string} currentVersion
 * @param {string} nextVersion
 * @returns {boolean}
 */
export function isReleaseUpdate(currentVersion, nextVersion) {
  const current = String(currentVersion || '').trim();
  const next = String(nextVersion || '').trim();
  return Boolean(current && next && current !== next);
}

/** @param {unknown} payload @returns {string} */
export function releaseVersionFromPayload(payload) {
  if (!payload || typeof payload !== 'object' || !('version' in payload)) return '';
  const version = /** @type {{ version?: unknown }} */ (payload).version;
  return typeof version === 'string' ? version.trim() : '';
}

/**
 * @param {{
 *   currentVersion: string,
 *   fetchManifest: () => Promise<unknown>,
 *   onPrompt: (version: string) => void,
 * }} dependencies
 */
export function createAppUpdateController({ currentVersion, fetchManifest, onPrompt }) {
  if (typeof currentVersion !== 'string' || typeof fetchManifest !== 'function' || typeof onPrompt !== 'function') {
    throw new TypeError('app update controller dependencies are required');
  }

  const current = currentVersion.trim();
  let deferredVersion = '';
  let promptedVersion = '';
  let busy = false;
  let disposed = false;

  /** @param {string} value @returns {boolean} */
  function promptIfNeeded(value) {
    const nextVersion = String(value || '').trim();
    if (!isReleaseUpdate(current, nextVersion) || deferredVersion === nextVersion || promptedVersion === nextVersion) {
      return false;
    }
    promptedVersion = nextVersion;
    onPrompt(nextVersion);
    return true;
  }

  /** @returns {Promise<boolean>} */
  function check() {
    if (disposed || busy || !current) return Promise.resolve(false);
    busy = true;
    return Promise.resolve()
      .then(fetchManifest)
      .then((payload) => {
        if (disposed) return false;
        return promptIfNeeded(releaseVersionFromPayload(payload));
      })
      .catch(() => false)
      .finally(() => {
        busy = false;
      });
  }

  /** @param {string} value @returns {boolean} */
  function handleRealtimeVersion(value) {
    if (disposed || !current) return false;
    return promptIfNeeded(String(value || '').trim());
  }

  /** @param {string} version */
  function defer(version) {
    const nextVersion = String(version || '').trim();
    if (nextVersion) deferredVersion = nextVersion;
  }

  function dispose() {
    disposed = true;
  }

  return Object.freeze({ check, handleRealtimeVersion, defer, dispose });
}
