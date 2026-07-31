// @ts-check

import {
  ApiError,
  apiErrorFromPayload,
  createApiClient,
} from '@yuance/frontend-api-client';

export { ApiError };

/** @typedef {{ id: number, username: string, display_name: string, is_super_admin: boolean }} AuthUser */
/** @typedef {{ project_key: string, pending_count: number }} TopbarProjectBadge */
/** @typedef {{ key: string, name: string, pending_count: number }} TopbarCurrentProject */
/** @typedef {{ requirements_count: number, tasks_count: number, bugs_count: number, notifications_count: number, project_badges: TopbarProjectBadge[], current_project: TopbarCurrentProject | null }} TopbarStatus */
/** @typedef {{ kind: 'work_item', project_key: string, work_item_key: string, comment_id: number | null }} NotificationTarget */
/** @typedef {{ id: number, kind: string, title: string, body: string, actor: string, created_at: string, read: boolean, target: NotificationTarget | null }} NotificationItem */
/** @typedef {{ items: NotificationItem[], unread_count: number, pending_count: number, filter: string, page: number, per_page: number, total_items: number, total_pages: number }} NotificationFeed */
/** @typedef {{ notification_id: number, read: boolean, target: NotificationTarget | null }} NotificationTargetPayload */
/** @typedef {{ key: string, item_type: string, title: string, status: string, priority: string, project_key: string, project_name: string, assignee: string, updated_at: string }} WorkItemSummary */
/** @typedef {{ key: string, item_type: string, title: string, description: string, status: string, priority: string, project_key: string, project_name: string, parent_item_key: string, parent_title: string, assignee_username: string, assignee: string, reporter: string, due_date: string, created_at: string, updated_at: string, deleted_at: string }} WorkItemDetail */
/** @typedef {{ id: number, parent_comment_id: number | null, parent_author: string, body: string, body_format: string, author: string, created_at: string, updated_at: string, is_flow: boolean, is_draft: boolean }} WorkItemComment */
/** @typedef {{ id: number, filename: string, content_type: string, byte_size: number, status: string, created_by: string, created_at: string }} Attachment */
/** @typedef {{ method: string, url: string, headers: Array<[string, string]> }} SignedObjectRequest */
/** @typedef {{ attachment: Attachment, request: SignedObjectRequest, expires_in_seconds: number }} AttachmentSignedUrl */
/** @typedef {{ title?: string, description?: string, status?: string, priority?: string, assigneeUsername?: string, dueDate?: string, parentItemKey?: string }} WorkItemUpdatePayload */
/** @typedef {{ status: string, assigneeUsername: string, body: string, sourceCommentId?: number | null }} WorkItemHandoffPayload */
/** @typedef {{ body: string, bodyFormat?: string, parentCommentId?: number | null }} CommentRequestPayload */
/** @typedef {{ originalFilename: string, contentType: string, byteSize: number }} AttachmentCreatePayload */
/** @typedef {{ expiresInSeconds?: number }} SignedUrlOptions */

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

const apiClient = createApiClient({
  request: fetchJson,
  prepareWrite: async () => {
    await refreshCsrfToken();
  },
});

export const getCurrentUser = /** @type {() => Promise<AuthUser>} */ (apiClient.getCurrentUser);

export const getTopbarStatus = /** @type {() => Promise<TopbarStatus>} */ (apiClient.getTopbarStatus);

export const getProjects = /** @type {(query?: { status?: string, page?: number, perPage?: number }) => Promise<{ items: Array<{ key: string, name: string, status: string, owner: string, work_item_count: number, active_work_item_count: number, updated_at: string }>, pagination: { page: number, per_page: number, total_items: number, total_pages: number } }>} */ (apiClient.getProjects);

export const updateCurrentProject = /** @type {(projectKey: string) => Promise<{ key: string, name: string }>} */ (apiClient.updateCurrentProject);

export const getWorkItems = /** @type {(query?: { itemType?: string, q?: string, status?: string, priority?: string, assigneeUsername?: string, projectKey?: string, page?: number, perPage?: number }) => Promise<{ items: WorkItemSummary[], pagination: { page: number, per_page: number, total_items: number, total_pages: number } }>} */ (apiClient.getWorkItems);

export const getWorkItem = /** @type {(itemKey: string) => Promise<WorkItemDetail>} */ (apiClient.getWorkItem);

export const getWorkItemComments = /** @type {(itemKey: string) => Promise<WorkItemComment[]>} */ (apiClient.getWorkItemComments);

export const updateWorkItem = /** @type {(itemKey: string, payload: WorkItemUpdatePayload) => Promise<WorkItemDetail>} */ (apiClient.updateWorkItem);

export const handoffWorkItem = /** @type {(itemKey: string, payload: WorkItemHandoffPayload) => Promise<WorkItemDetail>} */ (apiClient.handoffWorkItem);

export const createWorkItemComment = /** @type {(itemKey: string, payload: CommentRequestPayload) => Promise<WorkItemComment>} */ (apiClient.createWorkItemComment);

export const createWorkItemCommentDraft = /** @type {(itemKey: string, payload: CommentRequestPayload) => Promise<WorkItemComment>} */ (apiClient.createWorkItemCommentDraft);

export const updateWorkItemComment = /** @type {(itemKey: string, commentId: number, payload: CommentRequestPayload) => Promise<WorkItemComment>} */ (apiClient.updateWorkItemComment);

export const publishWorkItemCommentDraft = /** @type {(itemKey: string, commentId: number, payload: CommentRequestPayload) => Promise<WorkItemComment>} */ (apiClient.publishWorkItemCommentDraft);

export const getWorkItemAttachments = /** @type {(itemKey: string) => Promise<Attachment[]>} */ (apiClient.getWorkItemAttachments);

export const createWorkItemAttachment = /** @type {(itemKey: string, payload: AttachmentCreatePayload) => Promise<Attachment>} */ (apiClient.createWorkItemAttachment);

export const getWorkItemAttachmentUploadUrl = /** @type {(itemKey: string, attachmentId: number, query?: SignedUrlOptions) => Promise<AttachmentSignedUrl>} */ (apiClient.getWorkItemAttachmentUploadUrl);

export const markWorkItemAttachmentUploaded = /** @type {(itemKey: string, attachmentId: number) => Promise<Attachment>} */ (apiClient.markWorkItemAttachmentUploaded);

export const getWorkItemAttachmentDownloadUrl = /** @type {(itemKey: string, attachmentId: number, query?: SignedUrlOptions) => Promise<AttachmentSignedUrl>} */ (apiClient.getWorkItemAttachmentDownloadUrl);

export const getWorkItemCommentAttachments = /** @type {(itemKey: string, commentId: number) => Promise<Attachment[]>} */ (apiClient.getWorkItemCommentAttachments);

export const createWorkItemCommentAttachment = /** @type {(itemKey: string, commentId: number, payload: AttachmentCreatePayload) => Promise<Attachment>} */ (apiClient.createWorkItemCommentAttachment);

export const getWorkItemCommentAttachmentUploadUrl = /** @type {(itemKey: string, commentId: number, attachmentId: number, query?: SignedUrlOptions) => Promise<AttachmentSignedUrl>} */ (apiClient.getWorkItemCommentAttachmentUploadUrl);

export const markWorkItemCommentAttachmentUploaded = /** @type {(itemKey: string, commentId: number, attachmentId: number) => Promise<Attachment>} */ (apiClient.markWorkItemCommentAttachmentUploaded);

export const getWorkItemCommentAttachmentDownloadUrl = /** @type {(itemKey: string, commentId: number, attachmentId: number, query?: SignedUrlOptions) => Promise<AttachmentSignedUrl>} */ (apiClient.getWorkItemCommentAttachmentDownloadUrl);

export const getNotifications = /** @type {(query?: number | { limit?: number, filter?: string, page?: number, perPage?: number }) => Promise<NotificationFeed>} */ (apiClient.getNotifications);

export const getNotificationTarget = /** @type {(notificationId: number) => Promise<NotificationTargetPayload>} */ (apiClient.getNotificationTarget);

export const markNotificationRead = /** @type {(notificationId: number) => Promise<NotificationTargetPayload>} */ (apiClient.markNotificationRead);

export const markAllNotificationsRead = /** @type {() => Promise<{ affected: number }>} */ (apiClient.markAllNotificationsRead);

export const logout = /** @type {() => Promise<{ revoked: boolean }>} */ (apiClient.logout);

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
