// @ts-check

import { ApiError, apiErrorFromPayload } from '@yuance/frontend-api-client';

const NO_STORE_HEADERS = { accept: 'application/json' };
const RETURN_TO_HASH_KEY = 'yuance-web-return-to-hash';

/**
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   location?: Pick<Location, 'pathname' | 'search' | 'hash' | 'assign'>,
 *   history?: Pick<History, 'replaceState'>,
 *   storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
 * }} [dependencies]
 */
export function createBrowserApiTransport(dependencies = {}) {
  let csrfToken = '';
  /** @type {Promise<string> | null} */
  let csrfRefreshPromise = null;

  const fetchImpl = dependencies.fetchImpl || ((input, init) => globalThis.fetch(input, init));
  const location = () => dependencies.location || globalThis.window.location;
  const history = () => dependencies.history || globalThis.window.history;
  const storage = () => dependencies.storage || globalThis.window.sessionStorage;

  /** @param {Headers} headers @param {unknown} payload */
  function syncCsrfToken(headers, payload) {
    const headerToken = headers.get('x-yuance-csrf-token');
    if (typeof headerToken === 'string' && headerToken.trim()) {
      csrfToken = headerToken.trim();
      return csrfToken;
    }
    const payloadToken = payload && typeof payload === 'object'
      ? /** @type {{ data?: { csrf_token?: string } }} */ (payload).data?.csrf_token
      : '';
    if (typeof payloadToken === 'string' && payloadToken.trim()) {
      csrfToken = payloadToken.trim();
      return csrfToken;
    }
    return '';
  }

  function redirectToLogin() {
    const currentLocation = location();
    if (currentLocation.pathname === '/web/login') return;
    const returnTo = `${currentLocation.pathname}${currentLocation.search}`;
    if (currentLocation.hash) {
      storage().setItem(RETURN_TO_HASH_KEY, JSON.stringify({ returnTo, hash: currentLocation.hash }));
    }
    currentLocation.assign(`/web/login?${new URLSearchParams({ return_to: returnTo }).toString()}`);
  }

  /** @param {Response} response */
  function isLoginPageResponse(response) {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.toLowerCase().includes('text/html')) return true;
    try {
      return new URL(response.url).pathname === '/web/login';
    } catch (_error) {
      return false;
    }
  }

  /** @param {Response} response */
  function rejectLoginPageResponse(response) {
    if (!isLoginPageResponse(response)) return;
    redirectToLogin();
    throw new ApiError({ code: 'unauthorized', message: '登录已失效。', status: 401 });
  }

  function restorePendingReturnToHash() {
    const currentLocation = location();
    if (currentLocation.hash) return;
    const currentStorage = storage();
    const rawValue = currentStorage.getItem(RETURN_TO_HASH_KEY);
    if (!rawValue) return;
    try {
      const payload = JSON.parse(rawValue);
      const currentPath = `${currentLocation.pathname}${currentLocation.search}`;
      if (
        payload
        && typeof payload.returnTo === 'string'
        && typeof payload.hash === 'string'
        && payload.hash.startsWith('#')
        && payload.returnTo === currentPath
      ) {
        currentStorage.removeItem(RETURN_TO_HASH_KEY);
        history().replaceState(null, '', `${currentPath}${payload.hash}`);
        return;
      }
    } catch (_error) {
      // Corrupted browser-only state is discarded below.
    }
    currentStorage.removeItem(RETURN_TO_HASH_KEY);
  }

  async function refreshCsrfToken() {
    if (csrfRefreshPromise) return csrfRefreshPromise;
    csrfRefreshPromise = (async () => {
      const response = await fetchImpl('/api/v1/auth/csrf', {
        credentials: 'same-origin',
        headers: NO_STORE_HEADERS,
      });
      rejectLoginPageResponse(response);
      const payload = await response.json().catch(() => ({}));
      syncCsrfToken(response.headers, payload);
      if (response.status === 401) {
        redirectToLogin();
        throw new ApiError({ code: 'unauthorized', message: '登录已失效。', status: 401 });
      }
      if (!response.ok) throw apiErrorFromPayload(payload);
      return csrfToken;
    })();
    try {
      return await csrfRefreshPromise;
    } finally {
      csrfRefreshPromise = null;
    }
  }

  /** @param {string} url @param {RequestInit & { skipCsrfRetry?: boolean }} [options] */
  async function request(url, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const headers = new Headers(options.headers || {});
    headers.set('accept', headers.get('accept') || 'application/json');
    if (method !== 'GET' && method !== 'HEAD' && csrfToken) {
      headers.set('x-yuance-csrf-token', csrfToken);
    }
    const response = await fetchImpl(url, {
      ...options,
      credentials: options.credentials || 'same-origin',
      headers,
    });
    rejectLoginPageResponse(response);
    const payload = await response.json().catch(() => ({}));
    syncCsrfToken(response.headers, payload);
    if (response.status === 401) {
      redirectToLogin();
      throw new ApiError({ code: 'unauthorized', message: '登录已失效。', status: 401 });
    }
    if (!response.ok) {
      const error = apiErrorFromPayload(payload);
      error.status = response.status;
      if (
        method !== 'GET'
        && method !== 'HEAD'
        && options.skipCsrfRetry !== true
        && error.message.includes('CSRF token')
      ) {
        await refreshCsrfToken();
        return request(url, { ...options, skipCsrfRetry: true });
      }
      throw error;
    }
    return payload.data;
  }

  return {
    request,
    prepareWrite: refreshCsrfToken,
    redirectToLogin,
    refreshCsrfToken,
    restorePendingReturnToHash,
  };
}
