// @ts-check

import { attachmentPreviewFromPayload } from './attachment-preview.js';

/** @typedef {{ method?: string, headers?: Record<string, string>, body?: string }} ApiRequestOptions */
/** @typedef {(url: string, options?: ApiRequestOptions) => Promise<any>} ApiRequest */
/** @typedef {() => Promise<void>} PrepareWrite */
/** @typedef {{ key: string, item_type: string, title: string, status: string, priority: string, project_key: string, project_name: string, assignee: string, updated_at: string }} WorkItemSummary */
/** @typedef {{ key: string, item_type: string, title: string, description: string, status: string, priority: string, project_key: string, project_name: string, parent_item_key: string, parent_title: string, assignee_username: string, assignee: string, reporter: string, due_date: string, created_at: string, updated_at: string, deleted_at: string }} WorkItemDetail */
/** @typedef {{ id: number, parent_comment_id: number | null, parent_author: string, body: string, body_format: string, author: string, author_username: string, created_at: string, updated_at: string, is_flow: boolean, is_draft: boolean }} WorkItemComment */
/** @typedef {{ id: number, filename: string, content_type: string, byte_size: number, status: string, created_by: string, created_at: string }} Attachment */
/** @typedef {{ method: string, url: string, headers: Array<[string, string]> }} SignedObjectRequest */
/** @typedef {{ attachment: Attachment, request: SignedObjectRequest, expires_in_seconds: number, checksum_sha256?: string }} AttachmentSignedUrl */
/** @typedef {{ attachment: Attachment, preview: { kind: 'image' | 'video' | 'document' | null, strategy: string | null, file_type: string | null, kind_label: string | null, is_experimental: boolean, legacy_preview_enabled: boolean, content_enabled: boolean }, navigation: { position: number, total: number, previous: { id: number, title: string, url: string } | null, next: { id: number, title: string, url: string } | null }, content_url: string, download_url: string }} AttachmentPreview */
/** @typedef {{ title?: string, description?: string, status?: string, priority?: string, assigneeUsername?: string, dueDate?: string, parentItemKey?: string }} WorkItemUpdatePayload */
/** @typedef {{ projectKey: string, itemType: string, title: string, description?: string, priority?: string, assigneeUsername?: string, cycleId?: number | null, dueDate?: string, parentItemKey?: string }} WorkItemCreatePayload */
/** @typedef {{ projectKey: string, itemType: string, itemKeys: string[], action: 'assignee' | 'status' | 'priority' | 'cycle', status?: string, assigneeUsername?: string, priority?: string, cycleId?: number | null }} WorkItemBatchUpdatePayload */
/** @typedef {{ updated_count: number, updated_item_keys: string[], failed_count: number, failed_items: { item_key: string, code: string, message: string }[] }} WorkItemBatchUpdateResult */
/** @typedef {{ status: string, assigneeUsername: string, body: string, sourceCommentId?: number | null }} WorkItemHandoffPayload */
/** @typedef {{ body: string, bodyFormat?: string, parentCommentId?: number | null }} CommentRequestPayload */
/** @typedef {{ originalFilename: string, contentType: string, byteSize: number, checksumSha256?: string }} AttachmentCreatePayload */
/** @typedef {{ expiresInSeconds?: number }} SignedUrlOptions */
/**
 * @typedef {object} WorkItemClient
 * @property {(query?: WorkItemListQuery) => Promise<{ items: WorkItemSummary[], pagination: Pagination }>} getWorkItems
 * @property {(query?: WorkItemListQuery) => Promise<WorkItemListView>} getWorkItemListView
 * @property {(itemKey: string) => Promise<WorkItemDetailView>} getWorkItemDetailView
 * @property {(payload: WorkItemCreatePayload) => Promise<WorkItemDetail>} createWorkItem
 * @property {(payload: WorkItemBatchUpdatePayload) => Promise<WorkItemBatchUpdateResult>} batchUpdateWorkItems
 * @property {(payload: WorkItemSavedViewCreatePayload) => Promise<WorkItemSavedView>} createWorkItemSavedView
 * @property {(savedViewId: number, name: string) => Promise<WorkItemSavedView>} renameWorkItemSavedView
 * @property {(savedViewId: number) => Promise<WorkItemSavedView>} setDefaultWorkItemSavedView
 * @property {(savedViewId: number) => Promise<void>} deleteWorkItemSavedView
 * @property {(itemKey: string) => Promise<WorkItemDetail>} getWorkItem
 * @property {(itemKey: string) => Promise<WorkItemComment[]>} getWorkItemComments
 * @property {(itemKey: string, payload: { clientId: string, active: boolean }) => Promise<void>} updateWorkItemTyping
 * @property {(itemKey: string, payload: WorkItemUpdatePayload) => Promise<WorkItemDetail>} updateWorkItem
 * @property {(itemKey: string, body: string) => Promise<WorkItemComment>} updateWorkItemPrimaryPost
 * @property {(itemKey: string) => Promise<WorkItemDetail>} restoreWorkItem
 * @property {(itemKey: string, payload: WorkItemHandoffPayload) => Promise<WorkItemDetail>} handoffWorkItem
 * @property {(itemKey: string, payload: CommentRequestPayload) => Promise<WorkItemComment>} createWorkItemComment
 * @property {(itemKey: string, payload: CommentRequestPayload) => Promise<WorkItemComment>} createWorkItemCommentDraft
 * @property {(itemKey: string, commentId: number, payload: CommentRequestPayload) => Promise<WorkItemComment>} updateWorkItemComment
 * @property {(itemKey: string, commentId: number, payload: CommentRequestPayload) => Promise<WorkItemComment>} publishWorkItemCommentDraft
 * @property {(itemKey: string, commentId: number) => Promise<WorkItemComment>} cancelWorkItemCommentDraft
 * @property {(itemKey: string) => Promise<Attachment[]>} getWorkItemAttachments
 * @property {(itemKey: string, attachmentId: number) => Promise<AttachmentPreview>} getWorkItemAttachmentPreview
 * @property {(itemKey: string, payload: AttachmentCreatePayload) => Promise<Attachment>} createWorkItemAttachment
 * @property {(itemKey: string, attachmentId: number, query?: SignedUrlOptions) => Promise<AttachmentSignedUrl>} getWorkItemAttachmentUploadUrl
 * @property {(itemKey: string, attachmentId: number) => Promise<Attachment>} markWorkItemAttachmentUploaded
 * @property {(itemKey: string, attachmentId: number, query?: SignedUrlOptions) => Promise<AttachmentSignedUrl>} getWorkItemAttachmentDownloadUrl
 * @property {(itemKey: string, commentId: number) => Promise<Attachment[]>} getWorkItemCommentAttachments
 * @property {(itemKey: string, commentId: number, attachmentId: number) => Promise<AttachmentPreview>} getWorkItemCommentAttachmentPreview
 * @property {(itemKey: string, commentId: number, attachmentId: number) => Promise<Attachment>} deleteWorkItemCommentAttachment
 * @property {(itemKey: string, commentId: number, attachmentId: number) => Promise<Attachment>} deleteWorkItemPrimaryPostAttachment
 * @property {(itemKey: string, commentId: number, payload: AttachmentCreatePayload) => Promise<Attachment>} createWorkItemCommentAttachment
 * @property {(itemKey: string, commentId: number, attachmentId: number, query?: SignedUrlOptions) => Promise<AttachmentSignedUrl>} getWorkItemCommentAttachmentUploadUrl
 * @property {(itemKey: string, commentId: number, attachmentId: number) => Promise<Attachment>} markWorkItemCommentAttachmentUploaded
 * @property {(itemKey: string, commentId: number, attachmentId: number, query?: SignedUrlOptions) => Promise<AttachmentSignedUrl>} getWorkItemCommentAttachmentDownloadUrl
 */
/** @typedef {{ itemType?: string, q?: string, status?: string, priority?: string, assigneeUsername?: string, projectKey?: string, cycleId?: number, sort?: string, clearDefault?: boolean, page?: number, perPage?: number }} WorkItemListQuery */
/** @typedef {{ page: number, per_page: number, total_items: number, total_pages: number }} Pagination */
/** @typedef {{ item_type: string, q: string, status: string, priority: string, project_key: string, assignee_username: string, cycle_id: string, sort: string }} WorkItemListFilter */
/** @typedef {{ id: number, name: string, filters: WorkItemListFilter, per_page: number, is_default: boolean }} WorkItemSavedView */
/** @typedef {{ projectKey: string, itemType: string, name: string, q?: string, status?: string, priority?: string, assigneeUsername?: string, cycleId?: string, sort?: string, perPage: number, isDefault?: boolean }} WorkItemSavedViewCreatePayload */
/** @typedef {{ items: WorkItemSummary[], pagination: Pagination, summary: { total_items: number, active_items: number, high_priority_items: number }, filters: WorkItemListFilter, assignees: { username: string, display_name: string }[], cycles: { id: number, name: string, is_closed: boolean }[], parent_options: { key: string, title: string }[], saved_views: WorkItemSavedView[], can_manage_work_items: boolean }} WorkItemListView */
/** @typedef {{ item: WorkItemDetail, primary_post: WorkItemComment | null, cycle: { value: string, label: string } | null, assignees: { value: string, label: string }[], parent_options: { key: string, title: string }[], status_options: { value: string, label: string }[], permissions: { can_manage_work_items: boolean, can_edit_primary_post: boolean, can_close_work_item: boolean, can_reopen_work_item: boolean, can_restore_work_item: boolean }, navigation: { previous: { item_key: string, title: string } | null, next: { item_key: string, title: string } | null }, flow_history: { items: { source_kind: string, actor: string, created_at: string, summary: string }[], pagination: Pagination } }} WorkItemDetailView */

/** @param {string} itemKey */
export function workItemApiPath(itemKey) {
  return `/api/v1/work-items/${encodeURIComponent(itemKey)}`;
}

/**
 * @param {string} itemKey
 * @param {number} commentId
 */
export function workItemCommentApiPath(itemKey, commentId) {
  return `${workItemApiPath(itemKey)}/comments/${encodeURIComponent(String(commentId))}`;
}

/**
 * @param {string} itemKey
 * @param {number} attachmentId
 */
export function workItemAttachmentApiPath(itemKey, attachmentId) {
  return `${workItemApiPath(itemKey)}/attachments/${encodeURIComponent(String(attachmentId))}`;
}

/**
 * @param {string} itemKey
 * @param {number} commentId
 * @param {number} attachmentId
 */
export function workItemCommentAttachmentApiPath(itemKey, commentId, attachmentId) {
  return `${workItemCommentApiPath(itemKey, commentId)}/attachments/${encodeURIComponent(String(attachmentId))}`;
}

/**
 * @param {Record<string, unknown>} payload
 * @returns {Record<string, unknown>}
 */
export function omitUndefined(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  );
}

/**
 * @param {CommentRequestPayload} payload
 */
export function commentRequestBody(payload) {
  return omitUndefined({
    body: payload.body,
    body_format: payload.bodyFormat ?? 'plain',
    parent_comment_id: payload.parentCommentId,
  });
}

/**
 * @param {AttachmentCreatePayload} payload
 */
export function attachmentCreateRequestBody(payload) {
  return {
    original_filename: payload.originalFilename,
    content_type: payload.contentType,
    byte_size: payload.byteSize,
    ...(payload.checksumSha256 ? { checksum_sha256: payload.checksumSha256 } : {}),
  };
}

/**
 * @param {SignedUrlOptions} [query]
 */
export function signedUrlSuffix(query = {}) {
  const params = new URLSearchParams();
  const expiresInSeconds = query.expiresInSeconds;
  if (typeof expiresInSeconds === 'number' && Number.isInteger(expiresInSeconds) && expiresInSeconds > 0) {
    params.set('expires_in_seconds', String(expiresInSeconds));
  }
  return params.size > 0 ? `?${params.toString()}` : '';
}

/**
 * @param {unknown} raw
 * @returns {Attachment}
 */
export function attachmentFromPayload(raw) {
  const attachment = /** @type {Attachment} */ (raw || {});
  return {
    id: attachment.id,
    filename: attachment.filename,
    content_type: attachment.content_type,
    byte_size: attachment.byte_size,
    status: attachment.status,
    created_by: attachment.created_by,
    created_at: attachment.created_at,
  };
}

/** @returns {AttachmentPreview} */
export function workItemAttachmentPreviewFromPayload(payload) {
  return /** @type {AttachmentPreview} */ (attachmentPreviewFromPayload(payload, attachmentFromPayload));
}

/**
 * @param {unknown} raw
 * @returns {Attachment[]}
 */
export function attachmentsFromPayload(raw) {
  return Array.isArray(raw) ? raw.map(attachmentFromPayload) : [];
}

/**
 * @param {unknown} raw
 * @returns {AttachmentSignedUrl}
 */
export function attachmentSignedUrlFromPayload(raw) {
  const payload = /** @type {AttachmentSignedUrl} */ (raw || {});
  return {
    attachment: attachmentFromPayload(payload.attachment),
    request: payload.request,
    expires_in_seconds: payload.expires_in_seconds,
    ...(payload.checksum_sha256 ? { checksum_sha256: payload.checksum_sha256 } : {}),
  };
}

/** @param {WorkItemListQuery} query */
function workItemListSearchParams(query) {
  const params = new URLSearchParams();
  if (typeof query.itemType === 'string' && query.itemType.trim()) params.set('item_type', query.itemType.trim());
  if (typeof query.q === 'string' && query.q.trim()) params.set('q', query.q.trim());
  if (typeof query.status === 'string' && query.status.trim()) params.set('status', query.status.trim());
  if (typeof query.priority === 'string' && query.priority.trim()) params.set('priority', query.priority.trim().toUpperCase());
  if (typeof query.assigneeUsername === 'string' && query.assigneeUsername.trim()) params.set('assignee_username', query.assigneeUsername.trim());
  if (typeof query.projectKey === 'string' && query.projectKey.trim()) params.set('project_key', query.projectKey.trim().toUpperCase());
  if (typeof query.cycleId === 'number' && Number.isInteger(query.cycleId) && query.cycleId > 0) params.set('cycle_id', String(query.cycleId));
  if (typeof query.sort === 'string' && query.sort.trim()) params.set('sort', query.sort.trim());
  if (query.clearDefault === true) params.set('clear_default', 'true');
  if (typeof query.page === 'number' && Number.isInteger(query.page) && query.page > 0) params.set('page', String(query.page));
  if (typeof query.perPage === 'number' && Number.isInteger(query.perPage) && query.perPage > 0) params.set('per_page', String(query.perPage));
  return params;
}

/**
 * @param {{ request: ApiRequest, prepareWrite: PrepareWrite }} dependencies
 * @returns {WorkItemClient}
 */
export function createWorkItemClient({ request, prepareWrite }) {
  return {
    /**
     * @param {{ itemType?: string, q?: string, status?: string, priority?: string, assigneeUsername?: string, projectKey?: string, cycleId?: number, sort?: string, page?: number, perPage?: number }} [query]
     */
    getWorkItems(query = {}) {
      const params = new URLSearchParams();
      if (typeof query.itemType === 'string' && query.itemType.trim()) {
        params.set('item_type', query.itemType.trim());
      }
      if (typeof query.q === 'string' && query.q.trim()) {
        params.set('q', query.q.trim());
      }
      if (typeof query.status === 'string' && query.status.trim()) {
        params.set('status', query.status.trim());
      }
      if (typeof query.priority === 'string' && query.priority.trim()) {
        params.set('priority', query.priority.trim().toUpperCase());
      }
      if (typeof query.assigneeUsername === 'string' && query.assigneeUsername.trim()) {
        params.set('assignee_username', query.assigneeUsername.trim());
      }
      if (typeof query.projectKey === 'string' && query.projectKey.trim()) {
        params.set('project_key', query.projectKey.trim().toUpperCase());
      }
      if (typeof query.cycleId === 'number' && Number.isInteger(query.cycleId) && query.cycleId > 0) {
        params.set('cycle_id', String(query.cycleId));
      }
      if (typeof query.sort === 'string' && query.sort.trim()) {
        params.set('sort', query.sort.trim());
      }
      if (typeof query.page === 'number' && Number.isInteger(query.page) && query.page > 0) {
        params.set('page', String(query.page));
      }
      if (typeof query.perPage === 'number' && Number.isInteger(query.perPage) && query.perPage > 0) {
        params.set('per_page', String(query.perPage));
      }
      const suffix = params.size > 0 ? `?${params.toString()}` : '';
      return request(`/api/v1/work-items${suffix}`);
    },

    /** @param {WorkItemListQuery} [query] */
    getWorkItemListView(query = {}) {
      const params = workItemListSearchParams(query);
      const suffix = params.size > 0 ? `?${params.toString()}` : '';
      return request(`/api/v1/work-item-list-view${suffix}`);
    },

    /** @param {WorkItemCreatePayload} payload */
    async createWorkItem(payload) {
      await prepareWrite();
      return request('/api/v1/work-items', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          project_key: payload.projectKey,
          item_type: payload.itemType,
          title: payload.title,
          description: payload.description || '',
          priority: payload.priority || 'P2',
          assignee_username: payload.assigneeUsername || '',
          cycle_id: payload.cycleId || null,
          due_date: payload.dueDate || '',
          parent_item_key: payload.parentItemKey || '',
        }),
      });
    },

    /** @param {WorkItemBatchUpdatePayload} payload */
    async batchUpdateWorkItems(payload) {
      await prepareWrite();
      return request('/api/v1/work-items/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          project_key: payload.projectKey,
          item_type: payload.itemType,
          item_keys: payload.itemKeys,
          action: payload.action,
          status: payload.status ?? '',
          assignee_username: payload.assigneeUsername ?? '',
          priority: payload.priority ?? '',
          cycle_id: payload.cycleId ?? null,
        }),
      });
    },

    /** @param {WorkItemSavedViewCreatePayload} payload */
    async createWorkItemSavedView(payload) {
      await prepareWrite();
      return request('/api/v1/work-item-saved-views', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          project_key: payload.projectKey, item_type: payload.itemType, name: payload.name,
          q: payload.q || '', status: payload.status || '', priority: payload.priority || '',
          assignee_username: payload.assigneeUsername || '', cycle_id: payload.cycleId || '',
          sort: payload.sort || '', per_page: payload.perPage, is_default: Boolean(payload.isDefault),
        }),
      });
    },

    /** @param {number} savedViewId @param {string} name */
    async renameWorkItemSavedView(savedViewId, name) {
      await prepareWrite();
      return request(`/api/v1/work-item-saved-views/${encodeURIComponent(String(savedViewId))}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }),
      });
    },

    /** @param {number} savedViewId */
    async setDefaultWorkItemSavedView(savedViewId) {
      await prepareWrite();
      return request(`/api/v1/work-item-saved-views/${encodeURIComponent(String(savedViewId))}/default`, { method: 'POST' });
    },

    /** @param {number} savedViewId */
    async deleteWorkItemSavedView(savedViewId) {
      await prepareWrite();
      await request(`/api/v1/work-item-saved-views/${encodeURIComponent(String(savedViewId))}`, { method: 'DELETE' });
    },

    /** @param {string} itemKey */
    getWorkItem(itemKey) {
      return request(workItemApiPath(itemKey));
    },

    /** @param {string} itemKey */
    getWorkItemDetailView(itemKey) {
      return request(`/api/v1/work-item-detail-view/${encodeURIComponent(itemKey)}`);
    },

    /** @param {string} itemKey */
    getWorkItemComments(itemKey) {
      return request(`${workItemApiPath(itemKey)}/comments`);
    },

    /** @param {string} itemKey @param {{ clientId: string, active: boolean }} payload */
    async updateWorkItemTyping(itemKey, payload) {
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(itemKey)) throw new TypeError('work item key is invalid');
      if (!payload || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(payload.clientId)) throw new TypeError('typing client id is invalid');
      if (typeof payload.active !== 'boolean') throw new TypeError('typing active state is invalid');
      await prepareWrite();
      await request(`${workItemApiPath(itemKey)}/typing`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ client_id: payload.clientId, active: payload.active }),
      });
    },

    /**
     * @param {string} itemKey
     * @param {WorkItemUpdatePayload} payload
     */
    async updateWorkItem(itemKey, payload) {
      await prepareWrite();
      return request(workItemApiPath(itemKey), {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(omitUndefined({
          title: payload.title,
          description: payload.description,
          status: payload.status,
          priority: payload.priority,
          assignee_username: payload.assigneeUsername,
          due_date: payload.dueDate,
          parent_item_key: payload.parentItemKey,
        })),
      });
    },

    /** @param {string} itemKey @param {string} body */
    async updateWorkItemPrimaryPost(itemKey, body) {
      await prepareWrite();
      return request(`${workItemApiPath(itemKey)}/primary-post`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body, body_format: 'html' }),
      });
    },

    /** @param {string} itemKey */
    async restoreWorkItem(itemKey) {
      await prepareWrite();
      return request(`${workItemApiPath(itemKey)}/restore`, { method: 'POST' });
    },

    /**
     * @param {string} itemKey
     * @param {WorkItemHandoffPayload} payload
     */
    async handoffWorkItem(itemKey, payload) {
      await prepareWrite();
      return request(`${workItemApiPath(itemKey)}/handoff`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(omitUndefined({
          status: payload.status,
          assignee_username: payload.assigneeUsername,
          body: payload.body,
          source_comment_id: payload.sourceCommentId,
        })),
      });
    },

    /**
     * @param {string} itemKey
     * @param {CommentRequestPayload} payload
     */
    async createWorkItemComment(itemKey, payload) {
      await prepareWrite();
      return request(`${workItemApiPath(itemKey)}/comments`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(commentRequestBody(payload)),
      });
    },

    /**
     * @param {string} itemKey
     * @param {CommentRequestPayload} payload
     */
    async createWorkItemCommentDraft(itemKey, payload) {
      await prepareWrite();
      return request(`${workItemApiPath(itemKey)}/comments/draft`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(commentRequestBody(payload)),
      });
    },

    /**
     * @param {string} itemKey
     * @param {number} commentId
     * @param {CommentRequestPayload} payload
     */
    async updateWorkItemComment(itemKey, commentId, payload) {
      await prepareWrite();
      return request(workItemCommentApiPath(itemKey, commentId), {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(commentRequestBody(payload)),
      });
    },

    /**
     * @param {string} itemKey
     * @param {number} commentId
     * @param {CommentRequestPayload} payload
     */
    async publishWorkItemCommentDraft(itemKey, commentId, payload) {
      await prepareWrite();
      return request(`${workItemCommentApiPath(itemKey, commentId)}/publish`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(commentRequestBody(payload)),
      });
    },

    /** @param {string} itemKey @param {number} commentId */
    async cancelWorkItemCommentDraft(itemKey, commentId) {
      await prepareWrite();
      return request(`${workItemCommentApiPath(itemKey, commentId)}/draft`, { method: 'DELETE' });
    },

    /** @param {string} itemKey */
    async getWorkItemAttachments(itemKey) {
      return attachmentsFromPayload(await request(`${workItemApiPath(itemKey)}/attachments`));
    },

    async getWorkItemAttachmentPreview(itemKey, attachmentId) {
      return workItemAttachmentPreviewFromPayload(await request(
        `${workItemAttachmentApiPath(itemKey, attachmentId)}/preview`,
      ));
    },

    /**
     * @param {string} itemKey
     * @param {AttachmentCreatePayload} payload
     */
    async createWorkItemAttachment(itemKey, payload) {
      await prepareWrite();
      return attachmentFromPayload(await request(`${workItemApiPath(itemKey)}/attachments`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(attachmentCreateRequestBody(payload)),
      }));
    },

    /**
     * @param {string} itemKey
     * @param {number} attachmentId
     * @param {SignedUrlOptions} [query]
     */
    async getWorkItemAttachmentUploadUrl(itemKey, attachmentId, query = {}) {
      return attachmentSignedUrlFromPayload(await request(
        `${workItemAttachmentApiPath(itemKey, attachmentId)}/upload-url${signedUrlSuffix(query)}`,
      ));
    },

    /**
     * @param {string} itemKey
     * @param {number} attachmentId
     */
    async markWorkItemAttachmentUploaded(itemKey, attachmentId) {
      await prepareWrite();
      return attachmentFromPayload(await request(`${workItemAttachmentApiPath(itemKey, attachmentId)}/uploaded`, {
        method: 'POST',
      }));
    },

    /**
     * @param {string} itemKey
     * @param {number} attachmentId
     * @param {SignedUrlOptions} [query]
     */
    async getWorkItemAttachmentDownloadUrl(itemKey, attachmentId, query = {}) {
      return attachmentSignedUrlFromPayload(await request(
        `${workItemAttachmentApiPath(itemKey, attachmentId)}/download-url${signedUrlSuffix(query)}`,
      ));
    },

    /**
     * @param {string} itemKey
     * @param {number} commentId
     */
    async getWorkItemCommentAttachments(itemKey, commentId) {
      return attachmentsFromPayload(await request(
        `${workItemCommentApiPath(itemKey, commentId)}/attachments`,
      ));
    },

    async getWorkItemCommentAttachmentPreview(itemKey, commentId, attachmentId) {
      return workItemAttachmentPreviewFromPayload(await request(
        `${workItemCommentAttachmentApiPath(itemKey, commentId, attachmentId)}/preview`,
      ));
    },
    async deleteWorkItemCommentAttachment(itemKey, commentId, attachmentId) {
      await prepareWrite();
      return attachmentFromPayload(await request(workItemCommentAttachmentApiPath(itemKey, commentId, attachmentId), {
        method: 'DELETE',
        headers: { 'x-yuance-editor-context': 'work-item-comment-edit' },
      }));
    },
    async deleteWorkItemPrimaryPostAttachment(itemKey, commentId, attachmentId) {
      await prepareWrite();
      return attachmentFromPayload(await request(workItemCommentAttachmentApiPath(itemKey, commentId, attachmentId), {
        method: 'DELETE',
        headers: { 'x-yuance-editor-context': 'work-item-primary-post' },
      }));
    },

    /**
     * @param {string} itemKey
     * @param {number} commentId
     * @param {AttachmentCreatePayload} payload
     */
    async createWorkItemCommentAttachment(itemKey, commentId, payload) {
      await prepareWrite();
      return attachmentFromPayload(await request(`${workItemCommentApiPath(itemKey, commentId)}/attachments`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(attachmentCreateRequestBody(payload)),
      }));
    },

    /**
     * @param {string} itemKey
     * @param {number} commentId
     * @param {number} attachmentId
     * @param {SignedUrlOptions} [query]
     */
    async getWorkItemCommentAttachmentUploadUrl(itemKey, commentId, attachmentId, query = {}) {
      return attachmentSignedUrlFromPayload(await request(
        `${workItemCommentAttachmentApiPath(itemKey, commentId, attachmentId)}/upload-url${signedUrlSuffix(query)}`,
      ));
    },

    /**
     * @param {string} itemKey
     * @param {number} commentId
     * @param {number} attachmentId
     */
    async markWorkItemCommentAttachmentUploaded(itemKey, commentId, attachmentId) {
      await prepareWrite();
      return attachmentFromPayload(await request(
        `${workItemCommentAttachmentApiPath(itemKey, commentId, attachmentId)}/uploaded`,
        { method: 'POST' },
      ));
    },

    /**
     * @param {string} itemKey
     * @param {number} commentId
     * @param {number} attachmentId
     * @param {SignedUrlOptions} [query]
     */
    async getWorkItemCommentAttachmentDownloadUrl(itemKey, commentId, attachmentId, query = {}) {
      return attachmentSignedUrlFromPayload(await request(
        `${workItemCommentAttachmentApiPath(itemKey, commentId, attachmentId)}/download-url${signedUrlSuffix(query)}`,
      ));
    },
  };
}
