import { parseTransferContract } from "./transfer-contract.mjs";

const SHA256 = /^[0-9a-f]{64}$/u;

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

  async function uploadAttachment(target, input) {
    const { reference, fileCapability, binding, signal, onStage } = parseUploadInput(target, input);
    const uploadBinding = Object.freeze({ ...binding, purpose: "upload" });
    const metadata = fileVault.describe(fileCapability, uploadBinding);
    onStage("registering");
    let created;
    try {
      created = await restTransport.execute(`attachment.${target}create`, { ...reference, metadata });
    } catch (error) {
      if (error?.code === "mutation_result_uncertain") throw publicError("attachment_create_uncertain");
      throw error;
    }
    try {
      onStage("signing");
      const signed = await restTransport.execute(`attachment.${target}uploadsign`, { ...reference, attachmentId: created.id });
      validateUploadPair(created, signed, metadata);
      const contract = parseBusinessContract(signed.transfer, "upload");
      const transferGrant = grantVault.issue(contract, uploadBinding).grant;
      onStage("uploading");
      await uploadExecutor.execute({ fileCapability, transferGrant, binding: uploadBinding, signal });
      onStage("confirming");
      let uploaded;
      try {
        uploaded = await restTransport.execute(`attachment.${target}confirm`, { ...reference, attachmentId: created.id });
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
    downloadWorkItemAttachment,
    downloadWorkItemCommentAttachment,
  });
}

function parseUploadInput(target, input) {
  const allowed = target === "comment"
    ? ["binding", "commentId", "fileCapability", "itemKey", "onStage", "signal"]
    : ["binding", "fileCapability", "itemKey", "onStage", "signal"];
  exactInput(input, allowed);
  if (typeof input.fileCapability !== "string" || !/^yfc_[A-Za-z0-9_-]{32}$/u.test(input.fileCapability) || typeof input.onStage !== "function") throw new TypeError("Attachment upload input is invalid");
  validateBinding(input.binding);
  validateSignal(input.signal);
  return Object.freeze({
    reference: attachmentReference(target, input, false),
    fileCapability: input.fileCapability,
    binding: input.binding,
    signal: input.signal,
    onStage: input.onStage,
  });
}

function parseDownloadInput(target, input) {
  const allowed = target === "comment"
    ? ["attachmentId", "binding", "commentId", "itemKey", "signal", "window"]
    : ["attachmentId", "binding", "itemKey", "signal", "window"];
  exactInput(input, allowed);
  validateBinding(input.binding);
  validateSignal(input.signal);
  return Object.freeze({ reference: attachmentReference(target, input, true), binding: input.binding, signal: input.signal, window: input.window });
}

function attachmentReference(target, input, includeAttachment) {
  return Object.freeze({
    itemKey: input.itemKey,
    ...(target === "comment" ? { commentId: input.commentId } : {}),
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
