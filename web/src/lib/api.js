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

/** @typedef {{ id: number, username: string, display_name: string, is_super_admin: boolean }} AuthUser */
/** @typedef {{ project_key: string, pending_count: number }} TopbarProjectBadge */
/** @typedef {{ key: string, name: string, pending_count: number }} TopbarCurrentProject */
/** @typedef {{ requirements_count: number, tasks_count: number, bugs_count: number, notifications_count: number, project_badges: TopbarProjectBadge[], current_project: TopbarCurrentProject | null }} TopbarStatus */
/** @typedef {{ kind: 'work_item', project_key: string, work_item_key: string, comment_id: number | null }} NotificationTarget */
/** @typedef {{ id: number, kind: string, title: string, body: string, actor: string, created_at: string, read: boolean, target: NotificationTarget | null }} NotificationItem */
/** @typedef {{ items: NotificationItem[], unread_count: number }} NotificationFeed */
/** @typedef {{ notification_id: number, read: boolean, target: NotificationTarget | null }} NotificationTargetPayload */

const NO_STORE_HEADERS = {
  accept: 'application/json',
};

const RETURN_TO_HASH_KEY = 'yuance-web-return-to-hash';

let csrfToken = '';
let csrfRefreshPromise = null;

/**
 * @param {Headers} headers
 * @param {unknown} payload
 */
function syncCsrfTokenFromResponse(headers, payload) {
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

/**
 * @param {unknown} payload
 */
function apiErrorFromPayload(payload) {
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

export function redirectToLogin() {
  if (window.location.pathname === '/web/login') {
    return;
  }
  const returnTo = `${window.location.pathname}${window.location.search}`;
  if (window.location.hash) {
    window.sessionStorage.setItem(
      RETURN_TO_HASH_KEY,
      JSON.stringify({ returnTo, hash: window.location.hash }),
    );
  }
  const query = new URLSearchParams({ return_to: returnTo });
  window.location.assign(`/web/login?${query.toString()}`);
}

export function restorePendingReturnToHash() {
  if (window.location.hash) {
    return;
  }
  const rawValue = window.sessionStorage.getItem(RETURN_TO_HASH_KEY);
  if (!rawValue) {
    return;
  }

  try {
    const payload = JSON.parse(rawValue);
    const currentPath = `${window.location.pathname}${window.location.search}`;
    if (
      payload
      && typeof payload.returnTo === 'string'
      && typeof payload.hash === 'string'
      && payload.hash.startsWith('#')
      && payload.returnTo === currentPath
    ) {
      window.sessionStorage.removeItem(RETURN_TO_HASH_KEY);
      window.history.replaceState(null, '', `${currentPath}${payload.hash}`);
      return;
    }
  } catch (_error) {
    // Ignore corrupted browser-only state and fall through to cleanup.
  }

  window.sessionStorage.removeItem(RETURN_TO_HASH_KEY);
}

export async function refreshCsrfToken() {
  if (csrfRefreshPromise) {
    return csrfRefreshPromise;
  }

  csrfRefreshPromise = (async () => {
    const response = await fetch('/api/v1/auth/csrf', {
      credentials: 'same-origin',
      headers: NO_STORE_HEADERS,
    });
    const payload = await response.json().catch(() => ({}));
    syncCsrfTokenFromResponse(response.headers, payload);
    if (response.status === 401) {
      redirectToLogin();
      throw new ApiError({ code: 'unauthorized', message: '登录已失效。', status: 401 });
    }
    if (!response.ok) {
      throw apiErrorFromPayload(payload);
    }
    return csrfToken;
  })();

  try {
    return await csrfRefreshPromise;
  } finally {
    csrfRefreshPromise = null;
  }
}

/**
 * @param {string} url
 * @param {RequestInit & { skipCsrfRetry?: boolean }} [options]
 */
export async function fetchJson(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});
  headers.set('accept', headers.get('accept') || 'application/json');
  if (method !== 'GET' && method !== 'HEAD' && csrfToken) {
    headers.set('x-yuance-csrf-token', csrfToken);
  }

  const response = await fetch(url, {
    ...options,
    credentials: options.credentials || 'same-origin',
    headers,
  });
  const payload = await response.json().catch(() => ({}));
  syncCsrfTokenFromResponse(response.headers, payload);

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
      && (error.message.includes('CSRF token') || error.code === 'forbidden')
    ) {
      await refreshCsrfToken();
      return fetchJson(url, { ...options, skipCsrfRetry: true });
    }
    throw error;
  }

  return payload.data;
}

/** @returns {Promise<AuthUser>} */
export function getCurrentUser() {
  return fetchJson('/api/v1/auth/me');
}

/** @returns {Promise<TopbarStatus>} */
export function getTopbarStatus() {
  return fetchJson('/api/v1/topbar/status');
}

/** @param {number} [limit] @returns {Promise<NotificationFeed>} */
export function getNotifications(limit = 8) {
  return fetchJson(`/api/v1/notifications?limit=${limit}`);
}

/** @param {number} notificationId @returns {Promise<NotificationTargetPayload>} */
export function getNotificationTarget(notificationId) {
  return fetchJson(`/api/v1/notifications/${notificationId}/target`);
}

/** @param {number} notificationId @returns {Promise<NotificationTargetPayload>} */
export async function markNotificationRead(notificationId) {
  await refreshCsrfToken();
  return fetchJson(`/api/v1/notifications/${notificationId}/read`, {
    method: 'POST',
  });
}

/** @returns {Promise<{ affected: number }>} */
export async function markAllNotificationsRead() {
  await refreshCsrfToken();
  return fetchJson('/api/v1/notifications/read-all', {
    method: 'POST',
  });
}

/** @returns {Promise<{ revoked: boolean }>} */
export async function logout() {
  await refreshCsrfToken();
  return fetchJson('/api/v1/auth/logout', {
    method: 'POST',
  });
}

/**
 * @param {{ onRefresh: () => void, onReleaseVersion?: (version: string) => void }} callbacks
 */
export function openTopbarEvents(callbacks) {
  const source = new EventSource('/api/v1/topbar/events', { withCredentials: true });
  source.addEventListener('release-version', (event) => {
    if (typeof callbacks.onReleaseVersion === 'function') {
      callbacks.onReleaseVersion(event.data);
    }
  });
  source.addEventListener('topbar', () => {
    callbacks.onRefresh();
  });
  source.onerror = () => {
    // Browser EventSource will handle retries. The UI will refresh on the next signal.
  };
  return () => source.close();
}
