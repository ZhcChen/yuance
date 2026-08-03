export const FILE_CHANNELS = Object.freeze({
  choose: "yuance:file-choose",
  uploadCanary: "yuance:file-upload-canary",
  downloadCanary: "yuance:file-download-canary",
  uploadWorkItemAttachment: "yuance:file-upload-work-item-attachment",
  uploadWorkItemCommentAttachment: "yuance:file-upload-work-item-comment-attachment",
  downloadWorkItemAttachment: "yuance:file-download-work-item-attachment",
  downloadWorkItemCommentAttachment: "yuance:file-download-work-item-comment-attachment",
  attachmentProgress: "yuance:file-attachment-progress",
});

const OPERATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const STAGES = new Set(["registering", "signing", "uploading", "confirming"]);

export function registerFileCommandHandlers({ ipcMain, assertSender, getBinding, getWindow, fileDialog, issueTransferGrant, uploadExecutor, downloadExecutor, attachmentCoordinator } = {}) {
  if (!ipcMain || typeof ipcMain.handle !== "function" || typeof ipcMain.removeHandler !== "function") throw new TypeError("ipcMain is required");
  if (typeof assertSender !== "function" || typeof getBinding !== "function" || typeof getWindow !== "function" || typeof fileDialog?.choose !== "function" || typeof issueTransferGrant !== "function" || typeof uploadExecutor?.execute !== "function" || typeof downloadExecutor?.execute !== "function" || !hasAttachmentOperations(attachmentCoordinator)) {
    throw new TypeError("file command dependencies are required");
  }

  const handlers = {
    [FILE_CHANNELS.choose]: async (event, payload) => {
      assertSender(event);
      rejectPayload(payload);
      return normalizeSelection(await fileDialog.choose({ window: getWindow(), binding: getBinding(event, "upload") }));
    },
    [FILE_CHANNELS.uploadCanary]: async (event, capability) => {
      assertSender(event);
      if (typeof capability !== "string" || !/^yfc_[A-Za-z0-9_-]{32}$/.test(capability)) throw publicError("file_capability_invalid");
      const binding = getBinding(event, "upload");
      const transferGrant = await issueTransferGrant("upload", binding);
      return normalizeResult(await uploadExecutor.execute({ fileCapability: capability, transferGrant, binding }));
    },
    [FILE_CHANNELS.downloadCanary]: async (event, payload) => {
      assertSender(event);
      rejectPayload(payload);
      const binding = getBinding(event, "download");
      const transferGrant = await issueTransferGrant("download", binding);
      return normalizeResult(await downloadExecutor.execute({ window: getWindow(), suggestedFilename: "yuance-file-transfer-canary.txt", transferGrant, binding }));
    },
    [FILE_CHANNELS.uploadWorkItemAttachment]: attachmentUploadHandler("uploadWorkItemAttachment", false),
    [FILE_CHANNELS.uploadWorkItemCommentAttachment]: attachmentUploadHandler("uploadWorkItemCommentAttachment", true),
    [FILE_CHANNELS.downloadWorkItemAttachment]: attachmentDownloadHandler("downloadWorkItemAttachment", false),
    [FILE_CHANNELS.downloadWorkItemCommentAttachment]: attachmentDownloadHandler("downloadWorkItemCommentAttachment", true),
  };

  function attachmentUploadHandler(operation, comment) {
    return async (event, payload) => {
      assertSender(event);
      const parsed = parseAttachmentUpload(payload, comment);
      const binding = stripPurpose(getBinding(event, "upload"));
      const controller = new AbortController();
      const onDestroyed = () => controller.abort();
      event.sender.once?.("destroyed", onDestroyed);
      try {
        const result = await attachmentCoordinator[operation]({
          ...parsed.reference,
          fileCapability: parsed.fileCapability,
          binding,
          signal: controller.signal,
          onStage: (stage) => publishProgress(event, parsed.operationId, stage),
        });
        return normalizeAttachmentUploadResult(result);
      } finally {
        controller.abort();
        event.sender.removeListener?.("destroyed", onDestroyed);
      }
    };
  }

  function attachmentDownloadHandler(operation, comment) {
    return async (event, payload) => {
      assertSender(event);
      const reference = parseAttachmentDownload(payload, comment);
      const binding = stripPurpose(getBinding(event, "download"));
      return normalizeResult(await attachmentCoordinator[operation]({ ...reference, binding, signal: undefined, window: getWindow() }));
    };
  }
  for (const [channel, handler] of Object.entries(handlers)) ipcMain.handle(channel, sanitize(handler));
  return () => { for (const channel of Object.keys(handlers)) ipcMain.removeHandler(channel); };
}

function sanitize(handler) {
  return async (...args) => {
    try { return await handler(...args); }
    catch (error) {
      if (typeof error?.code === "string" && (error.code.startsWith("file_") || error.code.startsWith("attachment_"))) throw publicError(error.code, error.created);
      throw publicError("file_unavailable");
    }
  };
}
function parseAttachmentUpload(value, comment) {
  const inputKeys = comment ? ["commentId", "fileCapability", "itemKey"] : ["fileCapability", "itemKey"];
  if (!isPlainObject(value) || !sameKeys(value, ["input", "operationId"]) || !OPERATION_ID.test(value.operationId) || !isPlainObject(value.input) || !sameKeys(value.input, inputKeys) || typeof value.input.fileCapability !== "string" || !/^yfc_[A-Za-z0-9_-]{32}$/u.test(value.input.fileCapability)) throw new TypeError("attachment upload request is invalid");
  return Object.freeze({ operationId: value.operationId, fileCapability: value.input.fileCapability, reference: attachmentReference(value.input, comment, false) });
}
function parseAttachmentDownload(value, comment) {
  const keys = comment ? ["attachmentId", "commentId", "itemKey", "suggestedFilename"] : ["attachmentId", "itemKey", "suggestedFilename"];
  if (!isPlainObject(value) || !sameKeys(value, keys) || typeof value.suggestedFilename !== "string") throw new TypeError("attachment download request is invalid");
  return attachmentReference(value, comment, true);
}
function attachmentReference(value, comment, attachment) {
  return Object.freeze({ itemKey: value.itemKey, ...(comment ? { commentId: value.commentId } : {}), ...(attachment ? { attachmentId: value.attachmentId } : {}) });
}
function publishProgress(event, operationId, stage) {
  if (!STAGES.has(stage) || event.sender.isDestroyed?.()) return;
  event.sender.send(FILE_CHANNELS.attachmentProgress, Object.freeze({ operationId, stage }));
}
function stripPurpose(binding) {
  const { purpose: _purpose, ...value } = binding;
  return Object.freeze(value);
}
function normalizeAttachmentUploadResult(value) {
  if (!value || !isPlainObject(value) || !sameKeys(value, ["created", "uploaded"])) throw publicError("file_unavailable");
  return Object.freeze({ created: normalizeAttachment(value.created), uploaded: normalizeAttachment(value.uploaded) });
}
function normalizeAttachment(value) {
  if (!isPlainObject(value)) throw publicError("file_unavailable");
  return Object.freeze({ id: value.id, filename: value.filename, content_type: value.content_type, byte_size: value.byte_size, status: value.status, created_by: value.created_by, created_at: value.created_at });
}
function hasAttachmentOperations(value) {
  return ["uploadWorkItemAttachment", "uploadWorkItemCommentAttachment", "downloadWorkItemAttachment", "downloadWorkItemCommentAttachment"].every((name) => typeof value?.[name] === "function");
}
function rejectPayload(payload) { if (payload !== undefined) throw new TypeError("file command does not accept payload"); }
function normalizeSelection(value) {
  if (value === null) return null;
  if (!value || typeof value.capability !== "string" || typeof value.filename !== "string" || typeof value.contentType !== "string" || !Number.isSafeInteger(value.byteSize)) throw publicError("file_unavailable");
  return Object.freeze({ capability: value.capability, filename: value.filename, contentType: value.contentType, byteSize: value.byteSize });
}
function normalizeResult(value) {
  if (!value || !["completed", "cancelled"].includes(value.status)) throw publicError("file_unavailable");
  return Object.freeze({ status: value.status, ...(Number.isSafeInteger(value.byteSize) ? { byteSize: value.byteSize } : {}), ...(typeof value.filename === "string" ? { filename: value.filename } : {}) });
}
function publicError(code, created) { return Object.assign(new Error("File operation failed"), { code, ...(created === undefined ? {} : { created: normalizeAttachment(created) }) }); }
function sameKeys(value, expected) { const keys = Object.keys(value).sort(); return keys.length === expected.length && keys.every((key, index) => key === expected[index]); }
function isPlainObject(value) { return value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype; }
