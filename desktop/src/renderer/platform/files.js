// @ts-check

import { defineHostDelegatedAttachmentCapabilities, defineHostDelegatedFileCapabilities } from "@yuance/frontend-platform-contract";

export function createDesktopFiles(bridge) {
  return defineHostDelegatedFileCapabilities({
    chooseFile: async () => normalizeSelection(await requireOperation(bridge, "choose")()),
    uploadCanary: async (capability) => normalizeResult(await requireOperation(bridge, "uploadCanary")(capability)),
    downloadCanary: async () => normalizeResult(await requireOperation(bridge, "downloadCanary")()),
  });
}

export function createDesktopAppFiles(bridge, hostFiles = createDesktopFiles(bridge)) {
  const unavailable = () => { throw new Error("signed transfer operation is unavailable in Desktop renderer"); };
  const attachments = defineHostDelegatedAttachmentCapabilities({
    uploadWorkItemAttachment: async (input, onStage) => normalizeUploadResult(await requireOperation(bridge, "uploadWorkItemAttachment")(input, onStage)),
    uploadWorkItemCommentAttachment: async (input, onStage) => normalizeUploadResult(await requireOperation(bridge, "uploadWorkItemCommentAttachment")(input, onStage)),
    uploadProjectAttachment: async (input, onStage) => normalizeUploadResult(await requireOperation(bridge, "uploadProjectAttachment")(input, onStage)),
    uploadProjectResourceAttachment: async (input, onStage) => normalizeUploadResult(await requireOperation(bridge, "uploadProjectResourceAttachment")(input, onStage)),
    downloadWorkItemAttachment: async (input) => normalizeAttachmentDownload(await requireOperation(bridge, "downloadWorkItemAttachment")(input)),
    downloadWorkItemCommentAttachment: async (input) => normalizeAttachmentDownload(await requireOperation(bridge, "downloadWorkItemCommentAttachment")(input)),
    downloadProjectAttachment: async (input) => normalizeAttachmentDownload(await requireOperation(bridge, "downloadProjectAttachment")(input)),
    downloadProjectResourceAttachment: async (input) => normalizeAttachmentDownload(await requireOperation(bridge, "downloadProjectResourceAttachment")(input)),
    openProjectAttachmentPreview: async (input) => normalizePreview(await requireOperation(bridge, "openProjectAttachmentPreview")(input)),
    openProjectResourceAttachmentPreview: async (input) => normalizePreview(await requireOperation(bridge, "openProjectResourceAttachmentPreview")(input)),
    releaseProjectAttachmentPreview: async (capability) => normalizeRelease(await requireOperation(bridge, "releaseProjectAttachmentPreview")(capability)),
    revealDownload: async (capability) => normalizeReveal(await requireOperation(bridge, "revealDownload")(capability)),
  });
  return Object.freeze({
    files: Object.freeze({ chooseFile: hostFiles.chooseFile, uploadSignedRequest: unavailable }),
    downloads: Object.freeze({ downloadSignedRequest: unavailable }),
    transfers: Object.freeze({ authorizeSignedRequest: unavailable }),
    attachments,
  });
}

function requireOperation(bridge, name) {
  const operation = bridge?.[name];
  if (typeof operation !== "function") throw new Error("file operation is unavailable");
  return operation;
}
function normalizeSelection(value) {
  if (value === null) return null;
  if (!value || typeof value !== "object" || typeof value.capability !== "string" || typeof value.filename !== "string" || typeof value.contentType !== "string" || !Number.isSafeInteger(value.byteSize)) throw new Error("file result is invalid");
  return Object.freeze({ capability: value.capability, filename: value.filename, contentType: value.contentType, byteSize: value.byteSize });
}
function normalizeResult(value) {
  if (!value || typeof value !== "object" || !["completed", "cancelled"].includes(value.status)) throw new Error("file result is invalid");
  return Object.freeze({ status: value.status, ...(Number.isSafeInteger(value.byteSize) ? { byteSize: value.byteSize } : {}), ...(typeof value.filename === "string" ? { filename: value.filename } : {}) });
}
function normalizeUploadResult(value) {
  if (!value || typeof value !== "object") throw new Error("attachment result is invalid");
  return Object.freeze({ created: normalizeAttachment(value.created), uploaded: normalizeAttachment(value.uploaded) });
}
function normalizeAttachment(value) {
  if (!value || typeof value !== "object" || !Number.isSafeInteger(value.id) || typeof value.filename !== "string" || typeof value.content_type !== "string" || !Number.isSafeInteger(value.byte_size) || typeof value.status !== "string" || typeof value.created_by !== "string" || typeof value.created_at !== "string") throw new Error("attachment result is invalid");
  return Object.freeze({ id: value.id, filename: value.filename, content_type: value.content_type, byte_size: value.byte_size, status: value.status, created_by: value.created_by, created_at: value.created_at });
}
function normalizeAttachmentDownload(value) {
  const result = normalizeResult(value);
  const revealCapability = typeof value?.revealCapability === "string"
    ? /** @type {import('@yuance/frontend-platform-contract').RevealDownloadCapability} */ (/** @type {unknown} */ (value.revealCapability))
    : undefined;
  return Object.freeze({ ...result, ...(revealCapability ? { revealCapability } : {}) });
}
function normalizeReveal(value) {
  if (!value || value.status !== "revealed") throw new Error("reveal result is invalid");
  return Object.freeze({ status: "revealed" });
}
function normalizePreview(value) {
  if (!value || typeof value !== "object" || typeof value.capability !== "string" || value.source !== `app://yuance/.preview/${value.capability}` || typeof value.contentType !== "string" || !Number.isSafeInteger(value.byteSize) || !value.preview || !value.navigation) throw new Error("preview result is invalid");
  return Object.freeze({ capability: value.capability, source: value.source, contentType: value.contentType, byteSize: value.byteSize, attachment: normalizeAttachment(value.attachment), preview: Object.freeze({ ...value.preview }), navigation: Object.freeze({ ...value.navigation }) });
}
function normalizeRelease(value) { if (!value || value.status !== "released") throw new Error("preview release is invalid"); return Object.freeze({ status: "released" }); }
