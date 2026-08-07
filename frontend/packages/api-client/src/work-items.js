// @ts-check

/** @typedef {{ method?: string, headers?: Record<string, string>, body?: string }} ApiRequestOptions */
/** @typedef {(url: string, options?: ApiRequestOptions) => Promise<any>} ApiRequest */
/** @typedef {() => Promise<void>} PrepareWrite */
/** @typedef {{ key: string, item_type: string, title: string, status: string, priority: string, project_key: string, project_name: string, assignee: string, updated_at: string }} WorkItemSummary */
/** @typedef {{ key: string, item_type: string, title: string, description: string, status: string, priority: string, project_key: string, project_name: string, parent_item_key: string, parent_title: string, assignee_username: string, assignee: string, reporter: string, due_date: string, created_at: string, updated_at: string, deleted_at: string }} WorkItemDetail */
/** @typedef {{ id: number, parent_comment_id: number | null, parent_author: string, body: string, body_format: string, author: string, created_at: string, updated_at: string, is_flow: boolean, is_draft: boolean }} WorkItemComment */
/** @typedef {{ id: number, filename: string, content_type: string, byte_size: number, status: string, created_by: string, created_at: string }} Attachment */
/** @typedef {{ method: string, url: string, headers: Array<[string, string]> }} SignedObjectRequest */
/** @typedef {{ attachment: Attachment, request: SignedObjectRequest, expires_in_seconds: number, checksum_sha256?: string }} AttachmentSignedUrl */
/** @typedef {{ title?: string, description?: string, status?: string, priority?: string, assigneeUsername?: string, dueDate?: string, parentItemKey?: string }} WorkItemUpdatePayload */
/** @typedef {{ status: string, assigneeUsername: string, body: string, sourceCommentId?: number | null }} WorkItemHandoffPayload */
/** @typedef {{ body: string, bodyFormat?: string, parentCommentId?: number | null }} CommentRequestPayload */
/** @typedef {{ originalFilename: string, contentType: string, byteSize: number, checksumSha256?: string }} AttachmentCreatePayload */
/** @typedef {{ expiresInSeconds?: number }} SignedUrlOptions */
/** @typedef {{ getWorkItems(query?: { itemType?: string, q?: string, status?: string, priority?: string, assigneeUsername?: string, projectKey?: string, cycleId?: number, sort?: string, page?: number, perPage?: number }): Promise<{ items: WorkItemSummary[], pagination: { page: number, per_page: number, total_items: number, total_pages: number } }>, getWorkItem(itemKey: string): Promise<WorkItemDetail>, getWorkItemComments(itemKey: string): Promise<WorkItemComment[]>, updateWorkItem(itemKey: string, payload: WorkItemUpdatePayload): Promise<WorkItemDetail>, handoffWorkItem(itemKey: string, payload: WorkItemHandoffPayload): Promise<WorkItemDetail>, createWorkItemComment(itemKey: string, payload: CommentRequestPayload): Promise<WorkItemComment>, createWorkItemCommentDraft(itemKey: string, payload: CommentRequestPayload): Promise<WorkItemComment>, updateWorkItemComment(itemKey: string, commentId: number, payload: CommentRequestPayload): Promise<WorkItemComment>, publishWorkItemCommentDraft(itemKey: string, commentId: number, payload: CommentRequestPayload): Promise<WorkItemComment>, getWorkItemAttachments(itemKey: string): Promise<Attachment[]>, createWorkItemAttachment(itemKey: string, payload: AttachmentCreatePayload): Promise<Attachment>, getWorkItemAttachmentUploadUrl(itemKey: string, attachmentId: number, query?: SignedUrlOptions): Promise<AttachmentSignedUrl>, markWorkItemAttachmentUploaded(itemKey: string, attachmentId: number): Promise<Attachment>, getWorkItemAttachmentDownloadUrl(itemKey: string, attachmentId: number, query?: SignedUrlOptions): Promise<AttachmentSignedUrl>, getWorkItemCommentAttachments(itemKey: string, commentId: number): Promise<Attachment[]>, createWorkItemCommentAttachment(itemKey: string, commentId: number, payload: AttachmentCreatePayload): Promise<Attachment>, getWorkItemCommentAttachmentUploadUrl(itemKey: string, commentId: number, attachmentId: number, query?: SignedUrlOptions): Promise<AttachmentSignedUrl>, markWorkItemCommentAttachmentUploaded(itemKey: string, commentId: number, attachmentId: number): Promise<Attachment>, getWorkItemCommentAttachmentDownloadUrl(itemKey: string, commentId: number, attachmentId: number, query?: SignedUrlOptions): Promise<AttachmentSignedUrl> }} WorkItemClient */

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

    /** @param {string} itemKey */
    getWorkItem(itemKey) {
      return request(workItemApiPath(itemKey));
    },

    /** @param {string} itemKey */
    getWorkItemComments(itemKey) {
      return request(`${workItemApiPath(itemKey)}/comments`);
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

    /** @param {string} itemKey */
    async getWorkItemAttachments(itemKey) {
      return attachmentsFromPayload(await request(`${workItemApiPath(itemKey)}/attachments`));
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
