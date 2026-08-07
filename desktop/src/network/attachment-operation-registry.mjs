const ITEM_KEY = /^[A-Z][A-Z0-9-]{2,63}$/u;
const PROJECT_KEY = /^[A-Z][A-Z0-9-]{1,31}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;

export function createAttachmentOperationRegistry() {
  const operations = new Map([
    ["attachment.workitemcreate", createOperation("work-item")],
    ["attachment.commentcreate", createOperation("comment")],
    ["attachment.projectcreate", createOperation("project")],
    ["attachment.resourcecreate", createOperation("resource")],
    ["attachment.workitemuploadsign", signOperation("work-item", "upload")],
    ["attachment.commentuploadsign", signOperation("comment", "upload")],
    ["attachment.projectuploadsign", signOperation("project", "upload")],
    ["attachment.resourceuploadsign", signOperation("resource", "upload")],
    ["attachment.workitemconfirm", confirmOperation("work-item")],
    ["attachment.commentconfirm", confirmOperation("comment")],
    ["attachment.projectconfirm", confirmOperation("project")],
    ["attachment.resourceconfirm", confirmOperation("resource")],
    ["attachment.workitemdownloadsign", signOperation("work-item", "download")],
    ["attachment.commentdownloadsign", signOperation("comment", "download")],
    ["attachment.projectdownloadsign", signOperation("project", "download")],
    ["attachment.resourcedownloadsign", signOperation("resource", "download")],
  ]);
  return Object.freeze({
    resolve(name, input) {
      if (!operations.has(name) || !isPlainObject(input)) throw new TypeError("unknown attachment operation");
      return operations.get(name)(input);
    },
  });
}

function createOperation(target) {
  return (input) => {
    exactKeys(input, target === "comment" ? ["commentId", "itemKey", "metadata"] : target === "project" ? ["metadata", "projectKey"] : target === "resource" ? ["metadata", "projectKey", "resourceId"] : ["itemKey", "metadata"]);
    const reference = parseReference(input, target, false);
    const metadata = parseMetadata(input.metadata);
    return descriptor("POST", collectionPath(reference, target), parsePublicAttachment, false, JSON.stringify({
      original_filename: metadata.filename,
      content_type: metadata.contentType,
      byte_size: metadata.byteSize,
      checksum_sha256: metadata.sha256,
    }));
  };
}

function signOperation(target, purpose) {
  return (input) => {
    exactKeys(input, target === "comment" ? ["attachmentId", "commentId", "itemKey"] : target === "project" ? ["attachmentId", "projectKey"] : target === "resource" ? [...(purpose === "download" ? ["accessToken"] : []), "attachmentId", "projectKey", "resourceId"] : ["attachmentId", "itemKey"]);
    const reference = parseReference(input, target, true);
    const query = new URLSearchParams({ expires_in_seconds: "60" });
    if (target === "resource" && purpose === "download") query.set("access", parseAccessToken(input.accessToken));
    return descriptor("GET", `${memberPath(reference, target)}/${purpose}-url?${query}`, (value) => parseSignedAttachment(value, purpose));
  };
}

function confirmOperation(target) {
  return (input) => {
    exactKeys(input, target === "comment" ? ["attachmentId", "commentId", "itemKey"] : target === "project" ? ["attachmentId", "projectKey"] : target === "resource" ? ["attachmentId", "projectKey", "resourceId"] : ["attachmentId", "itemKey"]);
    const reference = parseReference(input, target, true);
    return descriptor("POST", `${memberPath(reference, target)}/uploaded`, parsePublicAttachment, false);
  };
}

function descriptor(method, path, parse, idempotent = true, body) {
  return Object.freeze({ idempotent, method, path, parse, ...(body === undefined ? {} : { body, contentType: "application/json" }) });
}

function parseReference(input, target, needsAttachment) {
  const itemKey = ["project", "resource"].includes(target) ? undefined : parseItemKey(input.itemKey);
  const projectKey = ["project", "resource"].includes(target) ? parseProjectKey(input.projectKey) : undefined;
  const resourceId = target === "resource" ? positiveInteger(input.resourceId, "resourceId") : undefined;
  const commentId = target === "comment" ? positiveInteger(input.commentId, "commentId") : undefined;
  const attachmentId = needsAttachment ? positiveInteger(input.attachmentId, "attachmentId") : undefined;
  return Object.freeze({ itemKey, projectKey, resourceId, commentId, attachmentId });
}

function collectionPath(reference, target) {
  if (target === "project") return `/api/v1/projects/${encodeURIComponent(reference.projectKey)}/attachments`;
  if (target === "resource") return `/api/v1/projects/${encodeURIComponent(reference.projectKey)}/resources/${reference.resourceId}/attachments`;
  const base = `/api/v1/work-items/${encodeURIComponent(reference.itemKey)}`;
  return target === "comment" ? `${base}/comments/${reference.commentId}/attachments` : `${base}/attachments`;
}

function memberPath(reference, target) {
  return `${collectionPath(reference, target)}/${reference.attachmentId}`;
}

function parseMetadata(value) {
  if (!isPlainObject(value)) throw new TypeError("attachment metadata is invalid");
  exactKeys(value, ["byteSize", "contentType", "filename", "sha256"]);
  if (typeof value.filename !== "string" || value.filename.length < 1 || value.filename.length > 255 || /[\\/\u0000-\u001f\u007f]/u.test(value.filename)) throw new TypeError("filename is invalid");
  if (typeof value.contentType !== "string" || value.contentType.length < 1 || value.contentType.length > 128 || /[\r\n]/u.test(value.contentType)) throw new TypeError("contentType is invalid");
  if (!Number.isSafeInteger(value.byteSize) || value.byteSize < 1 || value.byteSize > MAX_ATTACHMENT_BYTES) throw new TypeError("byteSize is invalid");
  if (typeof value.sha256 !== "string" || !SHA256.test(value.sha256)) throw new TypeError("sha256 is invalid");
  return value;
}

function parseSignedAttachment(value, purpose) {
  if (!isPlainObject(value) || !sameKeys(value, ["attachment", "checksum_sha256", "expires_at", "expires_in_seconds", "request"])) throw new TypeError("signed attachment is invalid");
  const attachment = parsePrivateAttachment(value.attachment);
  if (typeof value.checksum_sha256 !== "string" || !SHA256.test(value.checksum_sha256)) throw new TypeError("signed attachment checksum is invalid");
  if (!Number.isSafeInteger(value.expires_in_seconds) || value.expires_in_seconds < 1 || value.expires_in_seconds > 60) throw new TypeError("signed attachment expiry is invalid");
  if (typeof value.expires_at !== "string" || !Number.isFinite(Date.parse(value.expires_at))) throw new TypeError("signed attachment expiry is invalid");
  if (!isPlainObject(value.request) || !sameKeys(value.request, ["headers", "method", "url"])) throw new TypeError("signed attachment request is invalid");
  return Object.freeze({
    attachment: attachment.publicValue,
    transfer: Object.freeze({
      schema_version: 1,
      purpose,
      request: value.request,
      expected_bytes: attachment.publicValue.byte_size,
      content_type: attachment.publicValue.content_type,
      sha256: value.checksum_sha256,
      expires_in_seconds: value.expires_in_seconds,
      expires_at: value.expires_at,
    }),
  });
}

function parsePrivateAttachment(value) {
  if (!isPlainObject(value) || !sameKeys(value, ["byte_size", "content_type", "created_at", "created_by", "file_object_id", "filename", "id", "object_key", "status"])) throw new TypeError("attachment response is invalid");
  const publicValue = parsePublicAttachment(value);
  if (!Number.isSafeInteger(value.file_object_id) || value.file_object_id < 1 || typeof value.object_key !== "string" || value.object_key.length < 1 || value.object_key.length > 1024) throw new TypeError("private attachment response is invalid");
  return Object.freeze({ publicValue });
}

function parsePublicAttachment(value) {
  if (!isPlainObject(value)) throw new TypeError("attachment response is invalid");
  return Object.freeze({
    id: positiveInteger(value.id, "id"),
    filename: boundedString(value.filename, 255),
    content_type: boundedString(value.content_type, 128),
    byte_size: boundedInteger(value.byte_size, 0, MAX_ATTACHMENT_BYTES),
    status: boundedString(value.status, 32),
    created_by: boundedString(value.created_by, 256),
    created_at: boundedString(value.created_at, 64),
  });
}

function parseItemKey(value) { if (typeof value !== "string" || !ITEM_KEY.test(value)) throw new TypeError("itemKey is invalid"); return value; }
function parseProjectKey(value) { if (typeof value !== "string" || !PROJECT_KEY.test(value)) throw new TypeError("projectKey is invalid"); return value; }
function parseAccessToken(value) { if (typeof value !== "string" || value.length > 4096 || /[\u0000-\u001f\u007f]/u.test(value)) throw new TypeError("accessToken is invalid"); return value; }
function positiveInteger(value, name) { return boundedInteger(value, 1, Number.MAX_SAFE_INTEGER, name); }
function boundedInteger(value, minimum, maximum, name = "integer") { if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`${name} is invalid`); return value; }
function boundedString(value, maximum) { if (typeof value !== "string" || value.length > maximum) throw new TypeError("string field is invalid"); return value; }
function exactKeys(value, allowed) { if (Object.keys(value).some((key) => !allowed.includes(key))) throw new TypeError("attachment operation contains unknown fields"); }
function sameKeys(value, expected) { const keys = Object.keys(value).sort(); return keys.length === expected.length && keys.every((key, index) => key === expected[index]); }
function isPlainObject(value) { return value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype; }
