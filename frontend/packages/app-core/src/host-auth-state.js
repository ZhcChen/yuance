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

export const PUBLIC_HOST_AUTH_LOCKED_REASONS = Object.freeze(['profile_mismatch']);

/** @param {unknown} value */
export function normalizeHostAuthState(value) {
  const candidate = value && typeof value === 'object'
    ? /** @type {{ status?: unknown }} */ (value).status
    : undefined;
  const status = /** @type {string} */ (candidate);
  if (!PUBLIC_HOST_AUTH_STATES.includes(status)) return Object.freeze({ status: 'fatal' });
  const reason = value && typeof value === 'object'
    ? /** @type {{ reason?: unknown }} */ (value).reason
    : undefined;
  return Object.freeze(
    status === 'locked' && PUBLIC_HOST_AUTH_LOCKED_REASONS.includes(/** @type {string} */ (reason))
      ? { status, reason: /** @type {string} */ (reason) }
      : { status },
  );
}
