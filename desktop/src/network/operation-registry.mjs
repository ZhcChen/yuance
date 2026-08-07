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
const PROJECT_WRITE_STATUSES = new Set([...PROJECT_STATUSES].filter((status) => status !== "all"));
const ITEM_TYPES = new Set(["", "requirement", "task", "bug"]);
const ITEM_PRIORITIES = new Set(["", "P0", "P1", "P2", "P3"]);
const NOTIFICATION_FILTERS = new Set(["all", "unread", "pending", "read"]);
const WORK_ITEM_STATUSES = new Set(["open", "in_progress", "pending_confirmation", "done", "verified", "resolved", "closed", "cancelled"]);
const API_TOKEN_SCOPES = new Set(["project:read", "work_item:read", "work_item:write", "comment:write", "resource:read", "resource:write", "resource:unlock", "notification:read"]);

export function createOperationRegistry({ maxActiveOperations = MAX_ACTIVE_OPERATIONS } = {}) {
  if (!Number.isSafeInteger(maxActiveOperations) || maxActiveOperations < 1 || maxActiveOperations > MAX_ACTIVE_OPERATIONS) throw new TypeError("maxActiveOperations exceeds the fixed safety limit");
  const operations = new Map([
    ["session.probe", noInputOperation("GET", "/api/v1/device-session", parseSessionProbe)],
    ["file.canaryupload", noInputOperation("POST", "/api/v1/device-file-transfer/canary/upload-request", parseTransferEnvelope, false)],
    ["file.canarydownload", noInputOperation("GET", "/api/v1/device-file-transfer/canary/download-request", parseTransferEnvelope)],
    ["identity.current", noInputOperation("GET", "/api/v1/auth/me", parseUser)],
    ["identity.profile", noInputOperation("GET", "/api/v1/me/profile", parseProfile)],
    ["identity.profileupdate", profileUpdateOperation],
    ["identity.passwordupdate", passwordUpdateOperation],
    ["identity.tokens", noInputOperation("GET", "/api/v1/me/tokens", parseApiTokens, true, "array")],
    ["identity.tokencreate", apiTokenCreateOperation],
    ["identity.tokenupdate", apiTokenUpdateOperation],
    ["identity.tokendelete", apiTokenDeleteOperation],
    ["identity.devicesessions", noInputOperation("GET", "/api/v1/me/device-sessions", parseDeviceSessions, true, "array")],
    ["identity.devicesessionrevoke", deviceSessionRevokeOperation],
    ["shell.topbar", noInputOperation("GET", "/api/v1/topbar/status", parseTopbar)],
    ["search.list", searchListOperation],
    ["project.list", projectListOperation],
    ["project.create", projectCreateOperation],
    ["project.current", noInputOperation("GET", "/api/v1/current-project", parseCurrentProject, true, "nullable-object")],
    ["project.select", projectSelectOperation],
    ["notification.list", notificationListOperation],
    ["notification.target", notificationTargetOperation],
    ["notification.read", notificationReadOperation],
    ["notification.readall", noInputOperation("POST", "/api/v1/notifications/read-all", parseAffected, false)],
    ["workitem.list", workItemListOperation],
    ["workitem.detail", workItemDetailOperation],
    ["workitem.update", workItemUpdateOperation],
    ["workitem.handoff", workItemHandoffOperation],
    ["workitem.comments", workItemCommentsOperation],
    ["workitem.commentcreate", workItemCommentCreateOperation],
    ["workitem.commentupdate", workItemCommentUpdateOperation],
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

function descriptor(method, path, parse, idempotent = true, dataKind = "object", body) {
  return Object.freeze({ idempotent, method, path, parse, ...(dataKind === "object" ? {} : { dataKind }), ...(body === undefined ? {} : { body, contentType: "application/json" }) });
}

function noInputOperation(method, path, parse, idempotent = true, dataKind = "object") {
  return (input) => { exactKeys(input, []); return descriptor(method, path, parse, idempotent, dataKind); };
}

function projectListOperation(input) {
  exactKeys(input, ["page", "perPage", "status"]);
  const query = new URLSearchParams();
  const status = optionalEnum(input.status, PROJECT_STATUSES, "status", "all");
  if (status !== "all") query.set("status", status);
  appendPagination(query, input);
  return descriptor("GET", withQuery("/api/v1/projects", query), parseProjectPage);
}

function projectCreateOperation(input) {
  exactKeys(input, ["description", "dueDate", "name", "startDate", "status"]);
  const startDate = dateText(input.startDate);
  const dueDate = dateText(input.dueDate);
  if (startDate && dueDate && dueDate < startDate) throw new TypeError("dueDate is invalid");
  return descriptor("POST", "/api/v1/projects", parseProjectDetail, false, "object", jsonBody({
    name: boundedRequiredText(input.name, "name", 120), description: boundedText(input.description, "description", 2000),
    status: requiredEnum(input.status, PROJECT_WRITE_STATUSES, "status", false), start_date: startDate, due_date: dueDate,
  }));
}

function searchListOperation(input) {
  exactKeys(input, ["page", "perPage", "q"]);
  const query = new URLSearchParams();
  appendOptionalString(query, "q", optionalText(input.q, "q", 128));
  appendPagination(query, input);
  return descriptor("GET", withQuery("/api/v1/search", query), parseSearchPage);
}

function profileUpdateOperation(input) {
  exactKeys(input, ["displayName", "email", "mobile"]);
  const body = {
    display_name: boundedRequiredText(input.displayName, "displayName", 64),
    email: boundedText(input.email, "email", 254),
    mobile: boundedText(input.mobile, "mobile", 32),
  };
  return descriptor("PATCH", "/api/v1/me/profile", parseProfile, false, "object", jsonBody(body));
}

function passwordUpdateOperation(input) {
  exactKeys(input, ["currentPassword", "newPassword", "newPasswordConfirm"]);
  const body = {
    current_password: boundedRequiredText(input.currentPassword, "currentPassword", 256),
    new_password: boundedRequiredText(input.newPassword, "newPassword", 256),
    new_password_confirm: boundedRequiredText(input.newPasswordConfirm, "newPasswordConfirm", 256),
  };
  return descriptor("PATCH", "/api/v1/me/password", parseNoContent, false, "nullable-object", jsonBody(body));
}

function apiTokenCreateOperation(input) {
  exactKeys(input, ["expiresAt", "name", "projectScope", "scopes"]);
  return descriptor("POST", "/api/v1/me/tokens", parseCreatedApiToken, false, "object", jsonBody(apiTokenBody(input, true)));
}

function apiTokenUpdateOperation(input) {
  exactKeys(input, ["name", "projectScope", "scopes", "tokenId"]);
  return descriptor("PATCH", `/api/v1/me/tokens/${positiveInteger(input.tokenId)}`, parseApiToken, false, "object", jsonBody(apiTokenBody(input, false)));
}

function apiTokenDeleteOperation(input) {
  exactKeys(input, ["tokenId"]);
  return descriptor("DELETE", `/api/v1/me/tokens/${positiveInteger(input.tokenId)}`, parseApiToken, false);
}

function deviceSessionRevokeOperation(input) {
  exactKeys(input, ["familyId"]);
  const familyId = boundedRequiredText(input.familyId, "familyId", 128);
  if (!/^[A-Za-z0-9-]+$/u.test(familyId)) throw new TypeError("familyId is invalid");
  return descriptor("DELETE", `/api/v1/me/device-sessions/${familyId}`, parseDeviceSession, false);
}

function apiTokenBody(input, includeExpiration) {
  if (!Array.isArray(input.scopes) || input.scopes.length < 1 || input.scopes.length > API_TOKEN_SCOPES.size || input.scopes.some((scope) => !API_TOKEN_SCOPES.has(scope))) throw new TypeError("scopes is invalid");
  const projectScope = boundedRequiredText(input.projectScope, "projectScope", 128);
  return {
    name: boundedRequiredText(input.name, "name", 80), scopes: [...new Set(input.scopes)], project_scope: projectScope,
    ...(includeExpiration ? { expires_at: boundedText(input.expiresAt, "expiresAt", 64) } : {}),
  };
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

function projectSelectOperation(input) {
  exactKeys(input, ["projectKey"]);
  return descriptor("PATCH", "/api/v1/current-project", parseCurrentProject, false, "object", jsonBody({ project_key: projectKey(input.projectKey) }));
}

function notificationReadOperation(input) {
  exactKeys(input, ["notificationId"]);
  return descriptor("POST", `/api/v1/notifications/${integer(input.notificationId, 1, "notificationId")}/read`, parseNotificationTargetResult, false);
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

function workItemUpdateOperation(input) {
  exactKeys(input, ["itemKey", "payload"]);
  const payload = plainPayload(input.payload, "payload");
  exactKeys(payload, ["assigneeUsername", "description", "dueDate", "parentItemKey", "priority", "status", "title"]);
  const body = optionalBodyFields(payload, {
    title: (value) => boundedRequiredText(value, "title", 160),
    description: (value) => boundedText(value, "description", 5_000),
    status: (value) => requiredEnum(value, WORK_ITEM_STATUSES, "status"),
    priority: (value) => requiredEnum(value, ITEM_PRIORITIES, "priority", false),
    assigneeUsername: (value) => boundedText(value, "assigneeUsername", 64),
    dueDate: dateText,
    parentItemKey: optionalItemKey,
  }, {
    assigneeUsername: "assignee_username", dueDate: "due_date", parentItemKey: "parent_item_key",
  });
  if (Object.keys(body).length === 0) throw new TypeError("payload is invalid");
  return descriptor("PATCH", `/api/v1/work-items/${encodeURIComponent(itemKey(input.itemKey))}`, parseWorkItemDetail, false, "object", jsonBody(body));
}

function workItemHandoffOperation(input) {
  exactKeys(input, ["itemKey", "payload"]);
  const payload = plainPayload(input.payload, "payload");
  exactKeys(payload, ["assigneeUsername", "body", "sourceCommentId", "status"]);
  const body = {
    status: requiredEnum(payload.status, WORK_ITEM_STATUSES, "status"),
    assignee_username: boundedText(payload.assigneeUsername, "assigneeUsername", 64),
    body: boundedText(payload.body, "body", 5_000),
    ...(payload.sourceCommentId === undefined ? {} : { source_comment_id: nullablePositiveInteger(payload.sourceCommentId) }),
  };
  return descriptor("POST", `/api/v1/work-items/${encodeURIComponent(itemKey(input.itemKey))}/handoff`, parseWorkItemDetail, false, "object", jsonBody(body));
}

function workItemCommentCreateOperation(input) {
  exactKeys(input, ["itemKey", "payload"]);
  return descriptor("POST", `/api/v1/work-items/${encodeURIComponent(itemKey(input.itemKey))}/comments`, parseComment, false, "object", jsonBody(commentBody(input.payload)));
}

function workItemCommentUpdateOperation(input) {
  exactKeys(input, ["commentId", "itemKey", "payload"]);
  return descriptor("PATCH", `/api/v1/work-items/${encodeURIComponent(itemKey(input.itemKey))}/comments/${integer(input.commentId, 1, "commentId")}`, parseComment, false, "object", jsonBody(commentBody(input.payload)));
}

function workItemCommentsOperation(input) {
  exactKeys(input, ["itemKey"]);
  return descriptor("GET", `/api/v1/work-items/${encodeURIComponent(itemKey(input.itemKey))}/comments`, parseComments, true, "array");
}

function workItemAttachmentsOperation(input) {
  exactKeys(input, ["itemKey"]);
  return descriptor("GET", `/api/v1/work-items/${encodeURIComponent(itemKey(input.itemKey))}/attachments`, parseAttachments, true, "array");
}

function workItemCommentAttachmentsOperation(input) {
  exactKeys(input, ["commentId", "itemKey"]);
  return descriptor("GET", `/api/v1/work-items/${encodeURIComponent(itemKey(input.itemKey))}/comments/${integer(input.commentId, 1, "commentId")}/attachments`, parseAttachments, true, "array");
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
function parseProfile(data) { return freezeDto(data, {
  id: positiveInteger, username: shortString, display_name: shortString, email: shortString, mobile: shortString,
  status: shortString, is_super_admin: boolean, roles: shortString, created_at: shortString, updated_at: shortString,
}); }
function parseNoContent(data) { if (data !== null) throw new TypeError("empty response is invalid"); return null; }
function parseApiTokens(data) { return boundedArray(data, parseApiToken, 100, "api tokens"); }
function parseApiToken(value) { return freezeDto(value, {
  id: positiveInteger, name: shortString, scopes: apiTokenScopes, project_scope: longString, token_suffix: shortString,
  expires_at: shortString, revoked_at: shortString, last_used_at: shortString, created_at: shortString, updated_at: shortString,
}); }
function parseCreatedApiToken(value) { return freezeDto(value, { token: parseApiToken, raw_token: textString }); }
function apiTokenScopes(value) { return boundedArray(value, (scope) => requiredEnum(scope, API_TOKEN_SCOPES, "scope", false), API_TOKEN_SCOPES.size, "api token scopes"); }
function parseDeviceSessions(data) { return boundedArray(data, parseDeviceSession, 100, "device sessions"); }
function parseDeviceSession(value) { return freezeDto(value, {
  family_id: shortString, device_id: shortString, device_name: shortString, platform: shortString,
  client_version: shortString, status: shortString, generation: nonNegativeInteger,
  last_seen_at: shortString, created_at: shortString, is_current: boolean,
}); }
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
function parseSearchPage(data) { return parsePage(data, parseSearchResult); }
function parseSearchResult(value) { return freezeDto(value, {
  kind: shortString, key: shortString, title: textString, context: longString, target: textString, updated_at: shortString,
}); }
function parseProject(value) { return freezeDto(value, {
  key: shortString, name: shortString, status: shortString, owner: shortString,
  work_item_count: nonNegativeInteger, active_work_item_count: nonNegativeInteger, updated_at: shortString,
}); }
function parseProjectDetail(value) { return freezeDto(value, {
  key: shortString, name: textString, description: longString, status: shortString,
  owner_username: shortString, owner: shortString, start_date: shortString, due_date: shortString,
  created_at: shortString, updated_at: shortString,
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
function parseAffected(value) { return freezeDto(value, { affected: nonNegativeInteger }); }
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
function requiredEnum(value, allowed, name, allowEmpty = true) { if (typeof value !== "string" || !allowed.has(value) || (!allowEmpty && value === "")) throw new TypeError(`${name} is invalid`); return value; }
function projectKey(value) { if (typeof value !== "string" || !PROJECT_KEY.test(value)) throw new TypeError("projectKey is invalid"); return value; }
function itemKey(value) { if (typeof value !== "string" || !ITEM_KEY.test(value)) throw new TypeError("itemKey is invalid"); return value; }
function optionalItemKey(value) { return value === "" ? "" : itemKey(value); }
function boundedText(value, name, maximum) { if (typeof value !== "string" || value.length > maximum) throw new TypeError(`${name} is invalid`); return value; }
function boundedRequiredText(value, name, maximum) { const text = boundedText(value, name, maximum).trim(); if (!text) throw new TypeError(`${name} is invalid`); return text; }
function dateText(value) { if (value === "") return ""; if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new TypeError("dueDate is invalid"); return value; }
function plainPayload(value, name) { if (!isPlainObject(value)) throw new TypeError(`${name} is invalid`); return value; }
function optionalBodyFields(payload, parsers, wireNames) {
  const result = {};
  for (const [name, parser] of Object.entries(parsers)) if (payload[name] !== undefined) result[wireNames[name] ?? name] = parser(payload[name]);
  return result;
}
function commentBody(value) {
  const payload = plainPayload(value, "payload");
  exactKeys(payload, ["body", "bodyFormat", "parentCommentId"]);
  const bodyFormat = payload.bodyFormat === undefined ? "plain" : requiredEnum(payload.bodyFormat, new Set(["plain"]), "bodyFormat");
  return {
    body: boundedRequiredText(payload.body, "body", 5_000), body_format: bodyFormat,
    ...(payload.parentCommentId === undefined ? {} : { parent_comment_id: nullablePositiveInteger(payload.parentCommentId) }),
  };
}
function jsonBody(value) { const body = JSON.stringify(value); if (body.length > 128 * 1024) throw new TypeError("request body is invalid"); return body; }
function appendPagination(query, input) { if (input.page !== undefined) query.set("page", String(integer(input.page, 1, "page", 1_000_000))); if (input.perPage !== undefined) query.set("per_page", String(integer(input.perPage, 1, "perPage", 100))); }
function appendOptionalString(query, key, value) { if (value !== "") query.set(key, value); }
function withQuery(path, query) { const suffix = query.toString(); return suffix ? `${path}?${suffix}` : path; }
function isPlainObject(value) { return value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype; }
function sameKeys(value, expected) { const keys = Object.keys(value).sort(); return keys.length === expected.length && keys.every((key, index) => key === expected[index]); }
