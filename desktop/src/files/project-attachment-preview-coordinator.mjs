const PROJECT_KEY = /^[A-Z][A-Z0-9-]{1,31}$/u;
const ITEM_KEY = /^[A-Z][A-Z0-9-]{2,63}$/u;
const MAX_PREVIEW_BYTES = 100 * 1024 * 1024;
const TEXT_PREVIEW_CONTENT_TYPE = "text/plain; charset=utf-8";

export function createProjectAttachmentPreviewCoordinator({ restTransport, loader, vault } = {}) {
  if (typeof restTransport?.execute !== "function" || typeof loader?.load !== "function" || typeof vault?.issue !== "function" || typeof vault?.release !== "function") throw new TypeError("preview coordinator dependencies are required");

  async function openPreviewSnapshot(metadata, attachmentId, expectedContentPath, binding, signal) {
    if (metadata?.attachment?.id !== attachmentId || metadata.attachment.status !== "uploaded" || metadata.attachment.byte_size > MAX_PREVIEW_BYTES || metadata.content_url !== expectedContentPath || metadata.preview?.content_enabled !== true || !["image", "video", "document"].includes(metadata.preview.kind)) throw previewError("preview_unavailable");
    const contentType = metadata.preview.strategy === "text" ? TEXT_PREVIEW_CONTENT_TYPE : metadata.attachment.content_type;
    const snapshot = await loader.load({ contentPath: expectedContentPath, contentType, byteSize: metadata.attachment.byte_size, signal });
    try {
      return Object.freeze({ ...vault.issue(snapshot, binding), attachment: metadata.attachment, preview: metadata.preview, navigation: metadata.navigation });
    } catch (error) {
      await snapshot.remove().catch(() => {});
      throw error;
    }
  }

  async function openProjectAttachmentPreview(input) {
    const { projectKey, attachmentId, binding, signal } = parseOpenInput(input);
    const metadata = await restTransport.execute("project.attachmentpreview", { projectKey, attachmentId });
    const expectedContentPath = `/api/v1/projects/${projectKey}/attachments/${attachmentId}/preview/content`;
    return openPreviewSnapshot(metadata, attachmentId, expectedContentPath, binding, signal);
  }

  async function openWorkItemAttachmentPreview(input) {
    const { itemKey, attachmentId, binding, signal } = parseWorkItemOpenInput(input);
    const metadata = await restTransport.execute("workitem.attachmentpreview", { itemKey, attachmentId });
    const expectedContentPath = `/api/v1/work-items/${itemKey}/attachments/${attachmentId}/preview/content`;
    return openPreviewSnapshot(metadata, attachmentId, expectedContentPath, binding, signal);
  }

  async function openWorkItemCommentAttachmentPreview(input) {
    const { itemKey, commentId, attachmentId, binding, signal } = parseWorkItemCommentOpenInput(input);
    const metadata = await restTransport.execute("workitem.commentattachmentpreview", { itemKey, commentId, attachmentId });
    const expectedContentPath = `/api/v1/work-items/${itemKey}/comments/${commentId}/attachments/${attachmentId}/preview/content`;
    return openPreviewSnapshot(metadata, attachmentId, expectedContentPath, binding, signal);
  }

  async function openProjectResourceAttachmentPreview(input) {
    const { projectKey, resourceId, attachmentId, accessToken, binding, signal } = parseResourceOpenInput(input);
    const metadata = await restTransport.execute("project.resourceattachmentpreview", { projectKey, resourceId, attachmentId, accessToken });
    const query = accessToken ? `?${new URLSearchParams({ access: accessToken })}` : "";
    const expectedContentPath = `/api/v1/projects/${projectKey}/resources/${resourceId}/attachments/${attachmentId}/preview/content${query}`;
    return openPreviewSnapshot(metadata, attachmentId, expectedContentPath, binding, signal);
  }

  function releaseProjectAttachmentPreview(input) {
    if (!isPlainObject(input) || !sameKeys(input, ["binding", "capability"]) || typeof input.capability !== "string") throw new TypeError("preview release input is invalid");
    validateBinding(input.binding);
    vault.release(input.capability, input.binding);
    return Object.freeze({ status: "released" });
  }

  return Object.freeze({ openProjectAttachmentPreview, openWorkItemAttachmentPreview, openWorkItemCommentAttachmentPreview, openProjectResourceAttachmentPreview, releaseProjectAttachmentPreview });
}
function parseWorkItemCommentOpenInput(value) {
  if (!isPlainObject(value) || !sameKeys(value, ["attachmentId", "binding", "commentId", "itemKey", "signal"]) || typeof value.itemKey !== "string" || !ITEM_KEY.test(value.itemKey) || !Number.isSafeInteger(value.commentId) || value.commentId < 1 || !Number.isSafeInteger(value.attachmentId) || value.attachmentId < 1 || (value.signal !== undefined && !(value.signal instanceof AbortSignal))) throw new TypeError("work item comment preview open input is invalid");
  validateBinding(value.binding);
  return value;
}
function parseWorkItemOpenInput(value) {
  if (!isPlainObject(value) || !sameKeys(value, ["attachmentId", "binding", "itemKey", "signal"]) || typeof value.itemKey !== "string" || !ITEM_KEY.test(value.itemKey) || !Number.isSafeInteger(value.attachmentId) || value.attachmentId < 1 || (value.signal !== undefined && !(value.signal instanceof AbortSignal))) throw new TypeError("work item preview open input is invalid");
  validateBinding(value.binding);
  return value;
}
function parseResourceOpenInput(value) {
  if (!isPlainObject(value) || !sameKeys(value, ["accessToken", "attachmentId", "binding", "projectKey", "resourceId", "signal"]) || typeof value.projectKey !== "string" || !PROJECT_KEY.test(value.projectKey) || !Number.isSafeInteger(value.resourceId) || value.resourceId < 1 || !Number.isSafeInteger(value.attachmentId) || value.attachmentId < 1 || typeof value.accessToken !== "string" || value.accessToken.length > 4096 || (value.signal !== undefined && !(value.signal instanceof AbortSignal))) throw new TypeError("resource preview open input is invalid");
  validateBinding(value.binding);
  return value;
}

function parseOpenInput(value) {
  if (!isPlainObject(value) || !sameKeys(value, ["attachmentId", "binding", "projectKey", "signal"]) || typeof value.projectKey !== "string" || !PROJECT_KEY.test(value.projectKey) || !Number.isSafeInteger(value.attachmentId) || value.attachmentId < 1 || (value.signal !== undefined && !(value.signal instanceof AbortSignal))) throw new TypeError("preview open input is invalid");
  validateBinding(value.binding);
  return value;
}
function validateBinding(value) { if (!isPlainObject(value) || !sameKeys(value, ["authorizationVersion", "frameRoutingId", "profileEpoch", "webContentsId"]) || !Object.values(value).every((entry) => Number.isSafeInteger(entry) && entry >= 0) || value.authorizationVersion < 1) throw new TypeError("preview binding is invalid"); }
function isPlainObject(value) { return value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype; }
function sameKeys(value, expected) { const keys = Object.keys(value).sort(); const target = [...expected].sort(); return keys.length === target.length && keys.every((key, index) => key === target[index]); }
function previewError(code) { return Object.assign(new Error("Project attachment preview failed"), { code }); }
