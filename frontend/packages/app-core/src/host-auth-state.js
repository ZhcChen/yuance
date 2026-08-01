// @ts-check

export const PUBLIC_HOST_AUTH_STATES = Object.freeze([
  'starting',
  'unauthenticated',
  'authorizing',
  'authenticated',
  'locked',
  'reauthorization_required',
  'fatal',
]);

/** @param {unknown} value */
export function normalizeHostAuthState(value) {
  const candidate = value && typeof value === 'object'
    ? /** @type {{ status?: unknown }} */ (value).status
    : undefined;
  return PUBLIC_HOST_AUTH_STATES.includes(/** @type {string} */ (candidate))
    ? Object.freeze({ status: /** @type {string} */ (candidate) })
    : Object.freeze({ status: 'fatal' });
}
