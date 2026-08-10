// @ts-check

/** @typedef {{ code?: string, message: string, status?: number }} ApiErrorOptions */

export class ApiError extends Error {
  /**
   * @param {ApiErrorOptions} options
   */
  constructor(options) {
    super(options.message);
    this.name = 'ApiError';
    this.code = options.code || 'request_failed';
    this.status = options.status || 500;
  }
}

/**
 * @param {unknown} payload
 */
export function apiErrorFromPayload(payload) {
  const code = payload && typeof payload === 'object'
    ? /** @type {{ error?: { code?: string, message?: string } }} */ (payload).error?.code
    : undefined;
  const message = payload && typeof payload === 'object'
    ? /** @type {{ error?: { code?: string, message?: string } }} */ (payload).error?.message
    : undefined;
  return new ApiError({
    code: typeof code === 'string' ? code : 'request_failed',
    message: typeof message === 'string' && message.trim() ? message : '请求失败。',
  });
}
