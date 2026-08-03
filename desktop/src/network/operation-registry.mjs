const OPERATION_NAME = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*){1,3}$/u;
const ACTIVE_OPERATION_NAMES = new Set(["file.upload", "file.download"]);
const MAX_ACTIVE_OPERATIONS = 4;
const PROBE_KEYS = [
  "access_expires_at", "authorization_version", "device_id", "display_name", "family_id",
  "generation", "server_instance_id", "user_id", "username",
];
const PROJECT_KEY = /^[A-Z][A-Z0-9-]{1,31}$/u;
const ITEM_KEY = /^[A-Z][A-Z0-9-]{2,63}$/u;
const PROJECT_STATUSES = new Set(["all", "not_started", "in_progress", "acceptance", "completed", "on_hold", "cancelled", "archived"]);
const ITEM_TYPES = new Set(["", "requirement", "task", "bug"]);
const ITEM_PRIORITIES = new Set(["", "P0", "P1", "P2", "P3"]);
const NOTIFICATION_FILTERS = new Set(["all", "unread", "pending", "read"]);

export function createOperationRegistry({ maxActiveOperations = MAX_ACTIVE_OPERATIONS } = {}) {
  if (!Number.isSafeInteger(maxActiveOperations) || maxActiveOperations < 1 || maxActiveOperations > MAX_ACTIVE_OPERATIONS) throw new TypeError("maxActiveOperations exceeds the fixed safety limit");
  const operations = new Map([
    ["session.probe", noInputOperation("GET", "/api/v1/device-session", parseSessionProbe)],
    ["file.canaryupload", noInputOperation("POST", "/api/v1/device-file-transfer/canary/upload-request", parseTransferEnvelope, false)],
    ["file.canarydownload", noInputOperation("GET", "/api/v1/device-file-transfer/canary/download-request", parseTransferEnvelope)],
    ["identity.current", noInputOperation("GET", "/api/v1/auth/me", parseUser)],
    ["shell.topbar", noInputOperation("GET", "/api/v1/topbar/status", parseTopbar)],
    ["project.list", projectListOperation],
    ["project.current", noInputOperation("GET", "/api/v1/current-project", parseCurrentProject)],
    ["notification.list", notificationListOperation],
    ["notification.target", notificationTargetOperation],
    ["workitem.list", workItemListOperation],
    ["workitem.detail", workItemDetailOperation],
    ["workitem.comments", workItemCommentsOperation],
    ["workitem.attachments", workItemAttachmentsOperation],
    ["workitem.commentattachments", workItemCommentAttachmentsOperation],
  ]);
  const active = new Set();
  function resolve(name, input) {
    if (typeof name !== "string" || !OPERATION_NAME.test(name) || !operations.has(name)) throw new TypeError("unknown operation");
    if (!isPlainObject(input)) throw new TypeError("operation input must be a plain object");
    return operations.get(name)(input);
  }
  function begin(name, controller) {
    if (!ACTIVE_OPERATION_NAMES.has(name) || !(controller instanceof AbortController)) throw new TypeError("active operation is invalid");
    if (active.size >= maxActiveOperations) throw Object.assign(new Error("Active operation quota exceeded"), { code: "file_transfer_concurrency_limit" });
    const entry = Object.freeze({ name, controller });
    active.add(entry);
    let finished = false;
    return () => {
      if (finished) return;
      finished = true;
      active.delete(entry);
    };
  }
  function abortAll() {
    for (const entry of active) entry.controller.abort();
  }
  return Object.freeze({ resolve, begin, abortAll, snapshot: () => Object.freeze({ active: active.size }) });
}

function descriptor(method, path, parse, idempotent = true) {
  return Object.freeze({ idempotent, method, path, parse });
}

function noInputOperation(method, path, parse, idempotent = true) {
  return (input) => { exactKeys(input, []); return descriptor(method, path, parse, idempotent); };
}

function projectListOperation(input) {
  exactKeys(input, ["page", "perPage", "status"]);
  const query = new URLSearchParams();
  const status = optionalEnum(input.status, PROJECT_STATUSES, "status", "all");
  if (status !== "all") query.set("status", status);
  appendPagination(query, input);
  return descriptor("GET", withQuery("/api/v1/projects", query), parseProjectPage);
}

function notificationListOperation(input) {
  exactKeys(input, ["filter", "limit", "page", "perPage"]);
  const query = new URLSearchParams();
  if (input.limit !== undefined) query.set("limit", String(integer(input.limit, 1, "limit", 100)));
  query.set("filter", optionalEnum(input.filter, NOTIFICATION_FILTERS, "filter", "all"));
  appendPagination(query, input);
  return descriptor("GET", withQuery("/api/v1/notifications", query), parseNotificationFeed);
}

function notificationTargetOperation(input) {
  exactKeys(input, ["notificationId"]);
  return descriptor("GET", `/api/v1/notifications/${integer(input.notificationId, 1, "notificationId")}/target`, parseNotificationTargetResult);
}

function workItemListOperation(input) {
  exactKeys(input, ["assigneeUsername", "itemType", "page", "perPage", "priority", "projectKey", "q", "status"]);
  const query = new URLSearchParams();
  appendOptionalString(query, "item_type", optionalEnum(input.itemType, ITEM_TYPES, "itemType", ""));
  appendOptionalString(query, "q", optionalText(input.q, "q", 120));
  appendOptionalString(query, "status", optionalText(input.status, "status", 48));
  appendOptionalString(query, "priority", optionalEnum(input.priority, ITEM_PRIORITIES, "priority", ""));
  appendOptionalString(query, "assignee_username", optionalText(input.assigneeUsername, "assigneeUsername", 64));
  if (input.projectKey !== undefined && input.projectKey !== "") query.set("project_key", projectKey(input.projectKey));
  appendPagination(query, input);
  return descriptor("GET", withQuery("/api/v1/work-items", query), parseWorkItemPage);
}

function workItemDetailOperation(input) {
  exactKeys(input, ["itemKey"]);
  return descriptor("GET", `/api/v1/work-items/${encodeURIComponent(itemKey(input.itemKey))}`, parseWorkItemDetail);
}

function workItemCommentsOperation(input) {
  exactKeys(input, ["itemKey"]);
  return descriptor("GET", `/api/v1/work-items/${encodeURIComponent(itemKey(input.itemKey))}/comments`, parseComments);
}

function workItemAttachmentsOperation(input) {
  exactKeys(input, ["itemKey"]);
  return descriptor("GET", `/api/v1/work-items/${encodeURIComponent(itemKey(input.itemKey))}/attachments`, parseAttachments);
}

function workItemCommentAttachmentsOperation(input) {
  exactKeys(input, ["commentId", "itemKey"]);
  return descriptor("GET", `/api/v1/work-items/${encodeURIComponent(itemKey(input.itemKey))}/comments/${integer(input.commentId, 1, "commentId")}/attachments`, parseAttachments);
}

function parseSessionProbe(data, profile) {
  if (!isPlainObject(data) || !sameKeys(data, PROBE_KEYS) || data.server_instance_id !== profile.serverInstanceId) {
    throw new TypeError("session probe identity is invalid");
  }
  return Object.freeze({
    userId: integer(data.user_id, 1, "user_id"),
    username: requiredString(data.username, "username"), displayName: requiredString(data.display_name, "display_name"),
    deviceId: requiredString(data.device_id, "device_id"), familyId: requiredString(data.family_id, "family_id"),
    generation: integer(data.generation, 0, "generation"), authorizationVersion: integer(data.authorization_version, 1, "authorization_version"),
    accessExpiresAt: timestamp(data.access_expires_at, "access_expires_at"),
  });
}
function parseTransferEnvelope(data) { if (!isPlainObject(data)) throw new TypeError("transfer envelope is invalid"); return data; }
function parseUser(data) { return freezeDto(data, { id: positiveInteger, username: shortString, display_name: shortString, is_super_admin: boolean }); }
function parseCurrentProject(data) {
  if (data === null) return null;
  return freezeDto(data, { key: shortString, name: shortString });
}
function parseTopbar(data) {
  const value = freezeDto(data, {
    requirements_count: nonNegativeInteger, tasks_count: nonNegativeInteger, bugs_count: nonNegativeInteger,
    notifications_count: nonNegativeInteger, project_badges: projectBadges, current_project: nullableTopbarProject,
  });
  return value;
}
function parseProjectPage(data) { return parsePage(data, parseProject); }
function parseProject(value) { return freezeDto(value, {
  key: shortString, name: shortString, status: shortString, owner: shortString,
  work_item_count: nonNegativeInteger, active_work_item_count: nonNegativeInteger, updated_at: shortString,
}); }
function parseWorkItemPage(data) { return parsePage(data, parseWorkItemSummary); }
function parseWorkItemSummary(value) { return freezeDto(value, {
  key: shortString, item_type: shortString, title: textString, status: shortString, priority: shortString,
  project_key: shortString, project_name: shortString, assignee: shortString, updated_at: shortString,
}); }
function parseWorkItemDetail(value) { return freezeDto(value, {
  key: shortString, item_type: shortString, title: textString, description: longString, status: shortString,
  priority: shortString, project_key: shortString, project_name: shortString, parent_item_key: shortString,
  parent_title: textString, assignee_username: shortString, assignee: shortString, reporter: shortString,
  due_date: shortString, created_at: shortString, updated_at: shortString, deleted_at: shortString,
}); }
function parseComments(data) { return boundedArray(data, parseComment, 500, "comments"); }
function parseComment(value) { return freezeDto(value, {
  id: positiveInteger, parent_comment_id: nullablePositiveInteger, parent_author: shortString, body: longString,
  body_format: shortString, author: shortString, created_at: shortString, updated_at: shortString,
  is_flow: boolean, is_draft: boolean,
}); }
function parseAttachments(data) { return boundedArray(data, parseAttachment, 500, "attachments"); }
function parseAttachment(value) { return freezeDto(value, {
  id: positiveInteger, filename: textString, content_type: shortString, byte_size: nonNegativeInteger,
  status: shortString, created_by: shortString, created_at: shortString,
}); }
function parseNotificationFeed(data) {
  if (!isPlainObject(data)) throw new TypeError("notification feed is invalid");
  return Object.freeze({
    items: boundedArray(data.items, parseNotification, 100, "notifications"),
    unread_count: nonNegativeInteger(data.unread_count), pending_count: nonNegativeInteger(data.pending_count),
    filter: shortString(data.filter), page: positiveInteger(data.page), per_page: positiveInteger(data.per_page),
    total_items: nonNegativeInteger(data.total_items), total_pages: positiveInteger(data.total_pages),
  });
}
function parseNotification(value) { return freezeDto(value, {
  id: positiveInteger, kind: shortString, title: textString, body: longString, actor: shortString,
  created_at: shortString, read: boolean, target: nullableNotificationTarget,
}); }
function parseNotificationTargetResult(value) { return freezeDto(value, {
  notification_id: positiveInteger, read: boolean, target: nullableNotificationTarget,
}); }
function nullableNotificationTarget(value) {
  if (value === null) return null;
  return freezeDto(value, { kind: workItemKind, project_key: shortString, work_item_key: shortString, comment_id: nullablePositiveInteger });
}
function projectBadges(value) { return boundedArray(value, (badge) => freezeDto(badge, { project_key: shortString, pending_count: nonNegativeInteger }), 500, "project badges"); }
function nullableTopbarProject(value) { if (value === null) return null; return freezeDto(value, { key: shortString, name: shortString, pending_count: nonNegativeInteger }); }
function parsePage(data, itemParser) {
  if (!isPlainObject(data) || !isPlainObject(data.pagination)) throw new TypeError("page is invalid");
  return Object.freeze({ items: boundedArray(data.items, itemParser, 500, "page items"), pagination: freezeDto(data.pagination, {
    page: positiveInteger, per_page: positiveInteger, total_items: nonNegativeInteger, total_pages: positiveInteger,
  }) });
}
function freezeDto(value, schema) {
  if (!isPlainObject(value)) throw new TypeError("response object is invalid");
  return Object.freeze(Object.fromEntries(Object.entries(schema).map(([key, parser]) => [key, parser(value[key])])));
}
function boundedArray(value, parser, maximum, name) { if (!Array.isArray(value) || value.length > maximum) throw new TypeError(`${name} is invalid`); return Object.freeze(value.map(parser)); }
function requiredString(value, name) { if (typeof value !== "string" || value.length === 0 || value.length > 1024) throw new TypeError(`${name} is invalid`); return value; }
function shortString(value) { if (typeof value !== "string" || value.length > 256) throw new TypeError("string field is invalid"); return value; }
function textString(value) { if (typeof value !== "string" || value.length > 4096) throw new TypeError("text field is invalid"); return value; }
function longString(value) { if (typeof value !== "string" || value.length > 128 * 1024) throw new TypeError("long text field is invalid"); return value; }
function boolean(value) { if (typeof value !== "boolean") throw new TypeError("boolean field is invalid"); return value; }
function workItemKind(value) { if (value !== "work_item") throw new TypeError("notification target is invalid"); return value; }
function positiveInteger(value) { return integer(value, 1, "integer"); }
function nullablePositiveInteger(value) { return value === null ? null : positiveInteger(value); }
function nonNegativeInteger(value) { return integer(value, 0, "integer"); }
function integer(value, minimum, name, maximum = Number.MAX_SAFE_INTEGER) { if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`${name} is invalid`); return value; }
function timestamp(value, name) { const parsed = Date.parse(value); if (typeof value !== "string" || !Number.isFinite(parsed)) throw new TypeError(`${name} is invalid`); return new Date(parsed).toISOString(); }
function exactKeys(value, allowed) { const keys = Object.keys(value); if (keys.some((key) => !allowed.includes(key))) throw new TypeError("operation input contains unknown fields"); }
function optionalText(value, name, maximum) { if (value === undefined || value === "") return ""; if (typeof value !== "string" || value.trim().length > maximum) throw new TypeError(`${name} is invalid`); return value.trim(); }
function optionalEnum(value, allowed, name, fallback) { const normalized = value === undefined ? fallback : value; if (typeof normalized !== "string" || !allowed.has(normalized)) throw new TypeError(`${name} is invalid`); return normalized; }
function projectKey(value) { if (typeof value !== "string" || !PROJECT_KEY.test(value)) throw new TypeError("projectKey is invalid"); return value; }
function itemKey(value) { if (typeof value !== "string" || !ITEM_KEY.test(value)) throw new TypeError("itemKey is invalid"); return value; }
function appendPagination(query, input) { if (input.page !== undefined) query.set("page", String(integer(input.page, 1, "page", 1_000_000))); if (input.perPage !== undefined) query.set("per_page", String(integer(input.perPage, 1, "perPage", 100))); }
function appendOptionalString(query, key, value) { if (value !== "") query.set(key, value); }
function withQuery(path, query) { const suffix = query.toString(); return suffix ? `${path}?${suffix}` : path; }
function isPlainObject(value) { return value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype; }
function sameKeys(value, expected) { const keys = Object.keys(value).sort(); return keys.length === expected.length && keys.every((key, index) => key === expected[index]); }
