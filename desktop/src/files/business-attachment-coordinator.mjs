import { parseTransferContract } from "./transfer-contract.mjs";

const SHA256 = /^[0-9a-f]{64}$/u;
const RELEASE_PLATFORMS = new Set(["windows", "macos", "linux", "android", "ios"]);
const RELEASE_ARCHITECTURES = new Set(["universal", "x64", "arm64"]);
const RELEASE_ARTIFACT_KINDS = new Set(["installer", "signature", "sbom", "manifest", "checksums"]);

export function createBusinessAttachmentCoordinator({
  restTransport,
  fileVault,
  grantVault,
  uploadExecutor,
  downloadExecutor,
  revealVault,
  apiOrigin,
  allowLoopbackHttp = false,
  allowedRelativePaths = Object.freeze({}),
} = {}) {
  if (typeof restTransport?.execute !== "function" || typeof fileVault?.describe !== "function" || typeof grantVault?.issue !== "function" || typeof uploadExecutor?.execute !== "function" || typeof downloadExecutor?.execute !== "function" || typeof revealVault?.issue !== "function") {
    throw new TypeError("Business attachment coordinator dependencies are required");
  }
  if (typeof apiOrigin !== "string" || !isPlainObject(allowedRelativePaths) || Object.keys(allowedRelativePaths).some((key) => !["download", "upload"].includes(key))) {
    throw new TypeError("Business attachment coordinator configuration is invalid");
  }

  async function uploadWorkItemAttachment(input) {
    return uploadAttachment("workitem", input);
  }

  async function uploadWorkItemCommentAttachment(input) {
    return uploadAttachment("comment", input);
  }

  async function uploadProjectAttachment(input) {
    return uploadAttachment("project", input);
  }

  async function uploadProjectResourceAttachment(input) {
    return uploadAttachment("resource", input);
  }

  async function uploadSystemReleaseAsset(input) {
    return uploadAttachment("release", input);
  }

  async function uploadAttachment(target, input) {
    const { reference, fileCapability, binding, signal, onStage } = parseUploadInput(target, input);
    const memberReference = target === "release" ? Object.freeze({ releaseId: reference.releaseId }) : reference;
    const uploadBinding = Object.freeze({ ...binding, purpose: "upload" });
    const metadata = fileVault.describe(fileCapability, uploadBinding);
    let created;
    if (reference.attachmentId === undefined) {
      onStage("registering");
      try {
        created = await restTransport.execute(`attachment.${target}create`, { ...reference, metadata });
      } catch (error) {
        if (error?.code === "mutation_result_uncertain") throw publicError("attachment_create_uncertain");
        throw error;
      }
    }
    try {
      onStage("signing", created);
      const signed = await restTransport.execute(`attachment.${target}uploadsign`, { ...memberReference, ...(created ? { attachmentId: created.id } : {}) });
      created ||= signed?.attachment;
      validateUploadPair(created, signed, metadata);
      const contract = parseBusinessContract(signed.transfer, "upload");
      const transferGrant = grantVault.issue(contract, uploadBinding).grant;
      onStage("uploading");
      await uploadExecutor.execute({ fileCapability, transferGrant, binding: uploadBinding, signal });
      onStage("confirming");
      let uploaded;
      try {
        uploaded = await restTransport.execute(`attachment.${target}confirm`, { ...memberReference, attachmentId: created.id });
      } catch (error) {
        if (error?.code === "mutation_result_uncertain") throw publicError("attachment_confirm_uncertain", created);
        throw error;
      }
      if (uploaded?.id !== created.id || uploaded.status !== "uploaded") throw new TypeError("Confirmed attachment does not match registration");
      return Object.freeze({ created, uploaded });
    } catch (error) {
      if (error?.code === "attachment_confirm_uncertain") throw error;
      throw publicError("attachment_upload_partial", created, error);
    }
  }

  async function downloadWorkItemAttachment(input) {
    return downloadAttachment("workitem", input);
  }

  async function downloadWorkItemCommentAttachment(input) {
    return downloadAttachment("comment", input);
  }

  async function downloadProjectAttachment(input) {
    return downloadAttachment("project", input);
  }

  async function downloadProjectResourceAttachment(input) {
    return downloadAttachment("resource", input);
  }

  async function downloadSystemReleaseAsset(input) {
    return downloadAttachment("release", input);
  }

  async function downloadAttachment(target, input) {
    const { reference, binding, signal, window } = parseDownloadInput(target, input);
    const signed = await restTransport.execute(`attachment.${target}downloadsign`, reference);
    if (signed?.attachment?.status !== "uploaded" || typeof signed?.transfer?.sha256 !== "string" || !SHA256.test(signed.transfer.sha256)) throw publicError("attachment_download_unavailable");
    const contract = parseBusinessContract(signed.transfer, "download");
    const downloadBinding = Object.freeze({ ...binding, purpose: "download" });
    const revealBinding = Object.freeze({ ...binding, purpose: "reveal-download" });
    const transferGrant = grantVault.issue(contract, downloadBinding).grant;
    let revealCapability;
    const result = await downloadExecutor.execute({
      window,
      suggestedFilename: signed.attachment.filename,
      transferGrant,
      binding: downloadBinding,
      signal,
      onCommittedTarget: (locator) => {
        try { revealCapability = revealVault.issue(locator, revealBinding).capability; }
        catch { revealCapability = undefined; }
      },
    });
    return Object.freeze({ ...result, ...(revealCapability ? { revealCapability } : {}) });
  }

  function parseBusinessContract(value, purpose) {
    return parseTransferContract(value, {
      apiOrigin,
      expectedPurpose: purpose,
      allowLoopbackHttp,
      allowedRelativePath: allowedRelativePaths[purpose],
    });
  }

  return Object.freeze({
    uploadWorkItemAttachment,
    uploadWorkItemCommentAttachment,
    uploadProjectAttachment,
    uploadProjectResourceAttachment,
    uploadSystemReleaseAsset,
    downloadWorkItemAttachment,
    downloadWorkItemCommentAttachment,
    downloadProjectAttachment,
    downloadProjectResourceAttachment,
    downloadSystemReleaseAsset,
  });
}

function parseUploadInput(target, input) {
  const allowed = target === "comment"
    ? ["binding", "commentId", "fileCapability", "itemKey", "onStage", "signal"]
    : target === "project" ? ["binding", "fileCapability", "onStage", "projectKey", "signal"]
      : target === "resource" ? ["binding", "fileCapability", "onStage", "projectKey", "resourceId", "signal"]
        : target === "release" ? ["architecture", "artifactKind", "binding", "fileCapability", "onStage", "platform", "releaseId", "signal"] : ["binding", "fileCapability", "itemKey", "onStage", "signal"];
  const retryAllowed = ["workitem", "project", "resource"].includes(target) && sameKeys(input, [...allowed, "attachmentId"]);
  if (!retryAllowed) exactInput(input, allowed);
  if (typeof input.fileCapability !== "string" || !/^yfc_[A-Za-z0-9_-]{32}$/u.test(input.fileCapability) || typeof input.onStage !== "function" || (retryAllowed && (!Number.isSafeInteger(input.attachmentId) || input.attachmentId < 1))) throw new TypeError("Attachment upload input is invalid");
  if (target === "release") validateReleaseReference(input, false);
  validateBinding(input.binding);
  validateSignal(input.signal);
  return Object.freeze({
    reference: attachmentReference(target, input, retryAllowed),
    fileCapability: input.fileCapability,
    binding: input.binding,
    signal: input.signal,
    onStage: input.onStage,
  });
}

function parseDownloadInput(target, input) {
  const allowed = target === "comment"
    ? ["attachmentId", "binding", "commentId", "itemKey", "signal", "window"]
    : target === "project" ? ["attachmentId", "binding", "projectKey", "signal", "window"]
      : target === "resource" ? ["accessToken", "attachmentId", "binding", "projectKey", "resourceId", "signal", "window"]
        : target === "release" ? ["attachmentId", "binding", "releaseId", "signal", "window"] : ["attachmentId", "binding", "itemKey", "signal", "window"];
  exactInput(input, allowed);
  if (target === "release") validateReleaseReference(input, true);
  validateBinding(input.binding);
  validateSignal(input.signal);
  return Object.freeze({ reference: attachmentReference(target, input, true), binding: input.binding, signal: input.signal, window: input.window });
}

function validateReleaseReference(value, attachment) {
  if (!Number.isSafeInteger(value.releaseId) || value.releaseId < 1 || (attachment && (!Number.isSafeInteger(value.attachmentId) || value.attachmentId < 1)) || (!attachment && (!RELEASE_PLATFORMS.has(value.platform) || !RELEASE_ARCHITECTURES.has(value.architecture) || !RELEASE_ARTIFACT_KINDS.has(value.artifactKind)))) throw new TypeError("Release attachment reference is invalid");
}

function attachmentReference(target, input, includeAttachment) {
  return Object.freeze({
    ...(["project", "resource"].includes(target) ? { projectKey: input.projectKey } : target === "release" ? { releaseId: input.releaseId } : { itemKey: input.itemKey }),
    ...(target === "resource" ? { resourceId: input.resourceId, ...(input.accessToken === undefined ? {} : { accessToken: input.accessToken }) } : {}),
    ...(target === "comment" ? { commentId: input.commentId } : {}),
    ...(target === "release" && !includeAttachment ? { platform: input.platform, architecture: input.architecture, artifactKind: input.artifactKind } : {}),
    ...(includeAttachment ? { attachmentId: input.attachmentId } : {}),
  });
}

function validateUploadPair(created, signed, metadata) {
  const attachment = signed?.attachment;
  if (!attachment || attachment.id !== created.id || attachment.filename !== metadata.filename || attachment.content_type !== metadata.contentType || attachment.byte_size !== metadata.byteSize || signed.transfer?.sha256 !== metadata.sha256) {
    throw new TypeError("Signed attachment does not match local metadata");
  }
}

function validateBinding(value) {
  if (!isPlainObject(value) || !sameKeys(value, ["authorizationVersion", "frameRoutingId", "profileEpoch", "webContentsId"]) || !Object.values(value).every((entry) => Number.isSafeInteger(entry) && entry >= 0) || value.authorizationVersion < 1) {
    throw new TypeError("Attachment binding is invalid");
  }
}

function validateSignal(value) {
  if (value !== undefined && !(value instanceof AbortSignal)) throw new TypeError("Attachment signal is invalid");
}

function exactInput(value, keys) {
  if (!isPlainObject(value) || !sameKeys(value, keys)) throw new TypeError("Attachment input is invalid");
}

function publicError(code, created, cause) {
  const error = Object.assign(new Error("Attachment operation failed"), { code, ...(created === undefined ? {} : { created }) });
  const diagnosticCode = typeof cause?.code === "string" && /^[a-z][a-z0-9_]{0,63}$/u.test(cause.code) ? cause.code : cause?.name;
  if (typeof diagnosticCode === "string" && diagnosticCode.length <= 64) Object.defineProperty(error, "diagnosticCode", { value: diagnosticCode });
  return error;
}

function sameKeys(value, expected) {
  const keys = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return keys.length === sortedExpected.length && keys.every((key, index) => key === sortedExpected[index]);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}
