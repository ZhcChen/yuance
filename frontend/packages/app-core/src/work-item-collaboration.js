// @ts-check

/** @typedef {import('@yuance/frontend-api-client').CommentRequestPayload} CommentRequestPayload */
/** @typedef {import('@yuance/frontend-api-client').AttachmentCreatePayload} AttachmentCreatePayload */
/** @typedef {import('@yuance/frontend-api-client').WorkItemHandoffPayload} WorkItemHandoffPayload */
/** @typedef {import('@yuance/frontend-api-client').WorkItemUpdatePayload} WorkItemUpdatePayload */
/** @typedef {import('@yuance/frontend-platform-contract').PlatformCapabilities} PlatformCapabilities */
/** @typedef {import('@yuance/frontend-platform-contract').SelectedFile} SelectedFile */

/**
 * @template T
 * @typedef {object} MutationLifecycle
 * @property {() => boolean} isCurrent
 * @property {(value: T) => boolean | void} onCommitted
 * @property {(value: T) => void | Promise<void>} [refreshCompanion]
 */

/**
 * @template T
 * @typedef {object} MutationResult
 * @property {boolean} applied
 * @property {T} value
 * @property {unknown | null} refreshError
 */

/**
 * @template T
 * @param {() => Promise<T>} mutate
 * @param {MutationLifecycle<T>} lifecycle
 * @returns {Promise<MutationResult<T>>}
 */
async function runMutation(mutate, lifecycle) {
  const value = await mutate();
  if (!lifecycle.isCurrent()) {
    return { applied: false, value, refreshError: null };
  }

  const committed = lifecycle.onCommitted(value);
  if (committed === false || !lifecycle.isCurrent()) {
    return { applied: false, value, refreshError: null };
  }

  let refreshError = null;
  try {
    await lifecycle.refreshCompanion?.(value);
  } catch (error) {
    refreshError = error;
  }
  return { applied: true, value, refreshError };
}

/**
 * @template T
 * @param {{
 *   api: { updateWorkItem(itemKey: string, payload: WorkItemUpdatePayload): Promise<T> },
 *   itemKey: string,
 *   payload: WorkItemUpdatePayload,
 *   lifecycle: MutationLifecycle<T>,
 * }} options
 * @returns {Promise<MutationResult<T>>}
 */
export function saveWorkItem({ api, itemKey, payload, lifecycle }) {
  return runMutation(() => api.updateWorkItem(itemKey, payload), lifecycle);
}

/**
 * @template T
 * @param {{
 *   api: { handoffWorkItem(itemKey: string, payload: WorkItemHandoffPayload): Promise<T> },
 *   itemKey: string,
 *   payload: WorkItemHandoffPayload,
 *   lifecycle: MutationLifecycle<T>,
 * }} options
 * @returns {Promise<MutationResult<T>>}
 */
export function handoffWorkItem({ api, itemKey, payload, lifecycle }) {
  return runMutation(() => api.handoffWorkItem(itemKey, payload), lifecycle);
}

/**
 * @template T
 * @param {{
 *   api: { createWorkItemComment(itemKey: string, payload: CommentRequestPayload): Promise<T> },
 *   itemKey: string,
 *   payload: CommentRequestPayload,
 *   lifecycle: MutationLifecycle<T>,
 * }} options
 * @returns {Promise<MutationResult<T>>}
 */
export function createWorkItemComment({ api, itemKey, payload, lifecycle }) {
  return runMutation(() => api.createWorkItemComment(itemKey, payload), lifecycle);
}

/**
 * @template T
 * @param {{
 *   api: { updateWorkItemComment(itemKey: string, commentId: number, payload: CommentRequestPayload): Promise<T> },
 *   itemKey: string,
 *   commentId: number,
 *   payload: CommentRequestPayload,
 *   lifecycle: MutationLifecycle<T>,
 * }} options
 * @returns {Promise<MutationResult<T>>}
 */
export function updateWorkItemComment({ api, itemKey, commentId, payload, lifecycle }) {
  return runMutation(() => api.updateWorkItemComment(itemKey, commentId, payload), lifecycle);
}

/**
 * @template T
 * @typedef {object} AttachmentLifecycle
 * @property {() => boolean} isCurrent
 * @property {(stage: 'registering' | 'signing' | 'uploading' | 'confirming') => void} onStage
 * @property {(attachment: T) => void} onCreated
 * @property {(attachment: T) => void} onUploaded
 * @property {() => void | Promise<void>} [refresh]
 */

/**
 * @template {{ id: number }} T
 * @param {{
 *   create: (payload: AttachmentCreatePayload) => Promise<T>,
 *   sign: (attachment: T) => Promise<{ request: unknown, expires_in_seconds: number }>,
 *   confirm: (attachment: T) => Promise<T>,
 *   platform: Pick<PlatformCapabilities, 'files' | 'transfers'> & { attachments?: import('@yuance/frontend-platform-contract').HostDelegatedAttachmentCapabilities },
 *   file: SelectedFile,
 *   lifecycle: AttachmentLifecycle<T>,
 * }} options
 */
async function uploadAttachment({ create, sign, confirm, platform, file, lifecycle }) {
  if (!lifecycle.isCurrent()) {
    return { completed: false, created: null, uploaded: null, refreshError: null };
  }
  lifecycle.onStage('registering');
  const created = await create({
    originalFilename: file.filename,
    contentType: file.contentType,
    byteSize: file.byteSize,
  });
  if (!lifecycle.isCurrent()) {
    return { completed: false, created, uploaded: null, refreshError: null };
  }
  lifecycle.onCreated(created);

  lifecycle.onStage('signing');
  const signed = await sign(created);
  if (!lifecycle.isCurrent()) {
    return { completed: false, created, uploaded: null, refreshError: null };
  }

  const transfer = platform.transfers.authorizeSignedRequest({
    request: signed.request,
    purpose: 'upload',
    expiresInSeconds: signed.expires_in_seconds,
  });
  lifecycle.onStage('uploading');
  await platform.files.uploadSignedRequest(transfer, file.capability);

  const currentBeforeConfirm = lifecycle.isCurrent();
  if (currentBeforeConfirm) {
    lifecycle.onStage('confirming');
  }
  const uploaded = await confirm(created);
  if (!currentBeforeConfirm || !lifecycle.isCurrent()) {
    return { completed: false, created, uploaded, refreshError: null };
  }
  lifecycle.onUploaded(uploaded);

  let refreshError = null;
  try {
    await lifecycle.refresh?.();
  } catch (error) {
    refreshError = error;
  }
  return { completed: lifecycle.isCurrent(), created, uploaded, refreshError };
}

/**
 * @template {{ id: number }} T
 * @param {{
 *   api: {
 *     createWorkItemAttachment(itemKey: string, payload: AttachmentCreatePayload): Promise<T>,
 *     getWorkItemAttachmentUploadUrl(itemKey: string, attachmentId: number): Promise<{ request: unknown, expires_in_seconds: number }>,
 *     markWorkItemAttachmentUploaded(itemKey: string, attachmentId: number): Promise<T>,
 *   },
 *   platform: Pick<PlatformCapabilities, 'files' | 'transfers'> & { attachments?: import('@yuance/frontend-platform-contract').HostDelegatedAttachmentCapabilities },
 *   itemKey: string,
 *   file: SelectedFile,
 *   lifecycle: AttachmentLifecycle<T>,
 * }} options
 */
export function uploadWorkItemAttachment({ api, platform, itemKey, file, lifecycle }) {
  const attachments = platform.attachments;
  if (typeof attachments?.uploadWorkItemAttachment === 'function') {
    return uploadDelegatedAttachment({
      execute: (onStage) => attachments.uploadWorkItemAttachment({
        itemKey,
        fileCapability: file.capability,
      }, onStage),
      lifecycle,
    });
  }
  return uploadAttachment({
    create: (payload) => api.createWorkItemAttachment(itemKey, payload),
    sign: (attachment) => api.getWorkItemAttachmentUploadUrl(itemKey, attachment.id),
    confirm: (attachment) => api.markWorkItemAttachmentUploaded(itemKey, attachment.id),
    platform,
    file,
    lifecycle,
  });
}

/**
 * @template {{ id: number }} T
 * @param {{
 *   api: {
 *     createWorkItemCommentAttachment(itemKey: string, commentId: number, payload: AttachmentCreatePayload): Promise<T>,
 *     getWorkItemCommentAttachmentUploadUrl(itemKey: string, commentId: number, attachmentId: number): Promise<{ request: unknown, expires_in_seconds: number }>,
 *     markWorkItemCommentAttachmentUploaded(itemKey: string, commentId: number, attachmentId: number): Promise<T>,
 *   },
 *   platform: Pick<PlatformCapabilities, 'files' | 'transfers'> & { attachments?: import('@yuance/frontend-platform-contract').HostDelegatedAttachmentCapabilities },
 *   itemKey: string,
 *   commentId: number,
 *   file: SelectedFile,
 *   lifecycle: AttachmentLifecycle<T>,
 * }} options
 */
export function uploadWorkItemCommentAttachment({ api, platform, itemKey, commentId, file, lifecycle }) {
  const attachments = platform.attachments;
  if (typeof attachments?.uploadWorkItemCommentAttachment === 'function') {
    return uploadDelegatedAttachment({
      execute: (onStage) => attachments.uploadWorkItemCommentAttachment({
        itemKey,
        commentId,
        fileCapability: file.capability,
      }, onStage),
      lifecycle,
    });
  }
  return uploadAttachment({
    create: (payload) => api.createWorkItemCommentAttachment(itemKey, commentId, payload),
    sign: (attachment) => api.getWorkItemCommentAttachmentUploadUrl(itemKey, commentId, attachment.id),
    confirm: (attachment) => api.markWorkItemCommentAttachmentUploaded(itemKey, commentId, attachment.id),
    platform,
    file,
    lifecycle,
  });
}

/**
 * @param {{
 *   getSignedRequest: () => Promise<{ request: unknown, expires_in_seconds: number }>,
 *   platform: Pick<PlatformCapabilities, 'downloads' | 'transfers'> & { attachments?: import('@yuance/frontend-platform-contract').HostDelegatedAttachmentCapabilities },
 *   suggestedFilename: string,
 *   isCurrent: () => boolean,
 * }} options
 */
async function downloadAttachment({ getSignedRequest, platform, suggestedFilename, isCurrent }) {
  const signed = await getSignedRequest();
  if (!isCurrent()) {
    return false;
  }
  const transfer = platform.transfers.authorizeSignedRequest({
    request: signed.request,
    purpose: 'download',
    expiresInSeconds: signed.expires_in_seconds,
  });
  await platform.downloads.downloadSignedRequest(transfer, suggestedFilename);
  return isCurrent();
}

/**
 * @param {{
 *   api: { getWorkItemAttachmentDownloadUrl(itemKey: string, attachmentId: number): Promise<{ request: unknown, expires_in_seconds: number }> },
 *   platform: Pick<PlatformCapabilities, 'downloads' | 'transfers'> & { attachments?: import('@yuance/frontend-platform-contract').HostDelegatedAttachmentCapabilities },
 *   itemKey: string,
 *   attachmentId: number,
 *   suggestedFilename: string,
 *   isCurrent: () => boolean,
 * }} options
 */
export function downloadWorkItemAttachment({ api, platform, itemKey, attachmentId, suggestedFilename, isCurrent }) {
  if (typeof platform.attachments?.downloadWorkItemAttachment === 'function') {
    if (!isCurrent()) return Promise.resolve(false);
    return platform.attachments.downloadWorkItemAttachment({ itemKey, attachmentId, suggestedFilename })
      .then((result) => result.status === 'completed' && isCurrent());
  }
  return downloadAttachment({
    getSignedRequest: () => api.getWorkItemAttachmentDownloadUrl(itemKey, attachmentId),
    platform,
    suggestedFilename,
    isCurrent,
  });
}

/**
 * @param {{
 *   api: { getWorkItemCommentAttachmentDownloadUrl(itemKey: string, commentId: number, attachmentId: number): Promise<{ request: unknown, expires_in_seconds: number }> },
 *   platform: Pick<PlatformCapabilities, 'downloads' | 'transfers'> & { attachments?: import('@yuance/frontend-platform-contract').HostDelegatedAttachmentCapabilities },
 *   itemKey: string,
 *   commentId: number,
 *   attachmentId: number,
 *   suggestedFilename: string,
 *   isCurrent: () => boolean,
 * }} options
 */
export function downloadWorkItemCommentAttachment({ api, platform, itemKey, commentId, attachmentId, suggestedFilename, isCurrent }) {
  if (typeof platform.attachments?.downloadWorkItemCommentAttachment === 'function') {
    if (!isCurrent()) return Promise.resolve(false);
    return platform.attachments.downloadWorkItemCommentAttachment({ itemKey, commentId, attachmentId, suggestedFilename })
      .then((result) => result.status === 'completed' && isCurrent());
  }
  return downloadAttachment({
    getSignedRequest: () => api.getWorkItemCommentAttachmentDownloadUrl(itemKey, commentId, attachmentId),
    platform,
    suggestedFilename,
    isCurrent,
  });
}

/**
 * @template T
 * @param {{
 *   execute: (onStage: (stage: 'registering' | 'signing' | 'uploading' | 'confirming') => void) => Promise<{ created: T, uploaded: T }>,
 *   lifecycle: AttachmentLifecycle<T>,
 * }} options
 */
async function uploadDelegatedAttachment({ execute, lifecycle }) {
  if (!lifecycle.isCurrent()) {
    return { completed: false, created: null, uploaded: null, refreshError: null };
  }
  const result = await execute((stage) => {
    if (lifecycle.isCurrent()) lifecycle.onStage(stage);
  });
  if (!lifecycle.isCurrent()) {
    return { completed: false, created: result.created, uploaded: result.uploaded, refreshError: null };
  }
  lifecycle.onCreated(result.created);
  lifecycle.onUploaded(result.uploaded);
  let refreshError = null;
  try {
    await lifecycle.refresh?.();
  } catch (error) {
    refreshError = error;
  }
  return { completed: lifecycle.isCurrent(), created: result.created, uploaded: result.uploaded, refreshError };
}
