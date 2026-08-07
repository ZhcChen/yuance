// @ts-check

import { ApiError } from "@yuance/frontend-api-client";

const STATIC_ROUTES = new Map([
  ["/api/v1/auth/me", ["identity.current", []]],
  ["/api/v1/me/profile", ["identity.profile", []]],
  ["/api/v1/me/tokens", ["identity.tokens", []]],
  ["/api/v1/me/device-sessions", ["identity.devicesessions", []]],
  ["/api/v1/topbar/status", ["shell.topbar", []]],
  ["/api/v1/current-project", ["project.current", []]],
]);

/**
 * @param {{ execute?: (operation: string, input: Record<string, unknown>) => Promise<unknown> }} [bridge]
 */
export function createDesktopApiTransport(bridge = {}) {
  return Object.freeze({
    /** @param {string} url @param {{ method?: string, headers?: Record<string, string>, body?: string }} [options] */
    async request(url, options) {
      if (typeof bridge.execute !== "function") throw apiError("business_unavailable", 503);
      const { operation, input } = resolveReadOperation(url, options);
      const result = await bridge.execute(operation, input);
      if (!isPlainObject(result)) throw apiError("invalid_response", 502);
      const envelope = /** @type {Record<string, any>} */ (result);
      if (typeof envelope.ok !== "boolean") throw apiError("invalid_response", 502);
      if (envelope.ok === true && sameKeys(envelope, ["data", "ok"])) return envelope.data;
      if (envelope.ok === false && sameKeys(envelope, ["error", "ok"]) && isPlainObject(envelope.error)) {
        const code = typeof envelope.error.code === "string" ? envelope.error.code : "business_unavailable";
        const status = Number.isSafeInteger(envelope.error.status) ? envelope.error.status : 500;
        throw apiError(code, status);
      }
      throw apiError("invalid_response", 502);
    },
  });
}

function resolveReadOperation(url, options) {
  if (typeof url !== "string" || !url.startsWith("/api/v1/") || url.includes("#")) throw apiError("invalid_request", 400);
  if (options !== undefined && !isPlainObject(options)) throw apiError("invalid_request", 400);
  const method = options?.method ?? "GET";
  if (!["DELETE", "GET", "POST", "PATCH"].includes(method)) throw apiError("operation_not_allowed", 405);
  const parsed = new URL(url, "https://desktop.invalid");
  if (parsed.origin !== "https://desktop.invalid" || `${parsed.pathname}${parsed.search}` !== url) throw apiError("invalid_request", 400);
  if (method !== "GET") return resolveMutationOperation(parsed, method, options);
  if (options !== undefined && Object.keys(options).some((key) => key !== "method")) throw apiError("operation_not_allowed", 405);
  const staticRoute = STATIC_ROUTES.get(parsed.pathname);
  if (staticRoute) {
    rejectQuery(parsed.searchParams, staticRoute[1]);
    return { operation: staticRoute[0], input: {} };
  }
  if (parsed.pathname === "/api/v1/projects") return { operation: "project.list", input: parseQuery(parsed.searchParams, {
    status: "status", page: "page", per_page: "perPage",
  }) };
  const projectMembers = matchPath(parsed, /^\/api\/v1\/projects\/([^/]+)\/members$/u, "project.members", ([projectKey]) => ({ projectKey: decodeSegment(projectKey) }));
  if (projectMembers) return projectMembers;
  const projectCycle = matchPath(parsed, /^\/api\/v1\/projects\/([^/]+)\/cycles\/(\d+)$/u, "project.cycledetail", ([projectKey, cycleId]) => ({ projectKey: decodeSegment(projectKey), cycleId: positiveInteger(cycleId) }));
  if (projectCycle) return projectCycle;
  const projectCycles = matchPath(parsed, /^\/api\/v1\/projects\/([^/]+)\/cycles$/u, "project.cycles", ([projectKey]) => ({ projectKey: decodeSegment(projectKey) }));
  if (projectCycles) return projectCycles;
  const projectAttachments = matchPath(parsed, /^\/api\/v1\/projects\/([^/]+)\/attachments$/u, "project.attachments", ([projectKey]) => ({ projectKey: decodeSegment(projectKey) }));
  if (projectAttachments) return projectAttachments;
  const projectDetail = matchPath(parsed, /^\/api\/v1\/projects\/([^/]+)$/u, "project.detail", ([projectKey]) => ({ projectKey: decodeSegment(projectKey) }));
  if (projectDetail) return projectDetail;
  if (parsed.pathname === "/api/v1/search") return { operation: "search.list", input: parseQuery(parsed.searchParams, {
    q: "q", page: "page", per_page: "perPage",
  }) };
  if (parsed.pathname === "/api/v1/notifications") return { operation: "notification.list", input: parseQuery(parsed.searchParams, {
    limit: "limit", filter: "filter", page: "page", per_page: "perPage",
  }) };
  if (parsed.pathname === "/api/v1/work-items") return { operation: "workitem.list", input: parseQuery(parsed.searchParams, {
    item_type: "itemType", q: "q", status: "status", priority: "priority", assignee_username: "assigneeUsername",
    project_key: "projectKey", page: "page", per_page: "perPage",
  }) };
  const target = matchPath(parsed, /^\/api\/v1\/notifications\/(\d+)\/target$/u, "notification.target", ([notificationId]) => ({ notificationId: positiveInteger(notificationId) }));
  if (target) return target;
  const commentAttachments = matchPath(parsed, /^\/api\/v1\/work-items\/([^/]+)\/comments\/(\d+)\/attachments$/u, "workitem.commentattachments", ([itemKey, commentId]) => ({ itemKey: decodeSegment(itemKey), commentId: positiveInteger(commentId) }));
  if (commentAttachments) return commentAttachments;
  const childMatch = parsed.pathname.match(/^\/api\/v1\/work-items\/([^/]+)\/(comments|attachments)$/u);
  if (childMatch) {
    rejectQuery(parsed.searchParams, []);
    return {
      operation: childMatch[2] === "comments" ? "workitem.comments" : "workitem.attachments",
      input: { itemKey: decodeSegment(childMatch[1]) },
    };
  }
  const detail = matchPath(parsed, /^\/api\/v1\/work-items\/([^/]+)$/u, "workitem.detail", ([itemKey]) => ({ itemKey: decodeSegment(itemKey) }));
  if (detail) return detail;
  throw apiError("operation_not_allowed", 405);
}

function resolveMutationOperation(parsed, method, options) {
  rejectQuery(parsed.searchParams, []);
  if (method === "PATCH" && parsed.pathname === "/api/v1/me/profile") {
    const body = parseJsonBody(options, ["display_name", "email", "mobile"]);
    return { operation: "identity.profileupdate", input: renameBody(body, { display_name: "displayName" }) };
  }
  if (method === "PATCH" && parsed.pathname === "/api/v1/me/password") {
    const body = parseJsonBody(options, ["current_password", "new_password", "new_password_confirm"]);
    return { operation: "identity.passwordupdate", input: renameBody(body, { current_password: "currentPassword", new_password: "newPassword", new_password_confirm: "newPasswordConfirm" }) };
  }
  if (method === "POST" && parsed.pathname === "/api/v1/me/tokens") {
    const body = parseJsonBody(options, ["expires_at", "name", "project_scope", "scopes"]);
    return { operation: "identity.tokencreate", input: renameBody(body, { expires_at: "expiresAt", project_scope: "projectScope" }) };
  }
  if (method === "POST" && parsed.pathname === "/api/v1/projects") {
    const body = parseJsonBody(options, ["description", "due_date", "name", "start_date", "status"]);
    return { operation: "project.create", input: renameBody(body, { due_date: "dueDate", start_date: "startDate" }) };
  }
  const projectMember = parsed.pathname.match(/^\/api\/v1\/projects\/([^/]+)\/members\/([^/]+)$/u);
  if (method === "PATCH" && projectMember) {
    const body = parseJsonBody(options, ["member_role"]);
    return { operation: "project.memberroleupdate", input: { projectKey: decodeSegment(projectMember[1]), username: decodeSegment(projectMember[2]), memberRole: body.member_role } };
  }
  if (method === "DELETE" && projectMember) {
    rejectBody(options);
    return { operation: "project.memberremove", input: { projectKey: decodeSegment(projectMember[1]), username: decodeSegment(projectMember[2]) } };
  }
  const projectMembers = parsed.pathname.match(/^\/api\/v1\/projects\/([^/]+)\/members$/u);
  if (method === "POST" && projectMembers) {
    const body = parseJsonBody(options, ["member_role", "username"]);
    return { operation: "project.memberadd", input: { projectKey: decodeSegment(projectMembers[1]), username: body.username, memberRole: body.member_role } };
  }
  const project = parsed.pathname.match(/^\/api\/v1\/projects\/([^/]+)$/u);
  if (method === "PATCH" && project) {
    const body = parseJsonBody(options, ["description", "due_date", "name", "owner_username", "start_date", "status"]);
    return { operation: "project.update", input: { projectKey: decodeSegment(project[1]), ...renameBody(body, {
      due_date: "dueDate", owner_username: "ownerUsername", start_date: "startDate",
    }) } };
  }
  const cycleClose = parsed.pathname.match(/^\/api\/v1\/projects\/([^/]+)\/cycles\/(\d+)\/close$/u);
  if (method === "POST" && cycleClose) {
    rejectBody(options);
    return { operation: "project.cycleclose", input: { projectKey: decodeSegment(cycleClose[1]), cycleId: positiveInteger(cycleClose[2]) } };
  }
  const cycle = parsed.pathname.match(/^\/api\/v1\/projects\/([^/]+)\/cycles\/(\d+)$/u);
  if (method === "PATCH" && cycle) {
    return { operation: "project.cycleupdate", input: { projectKey: decodeSegment(cycle[1]), cycleId: positiveInteger(cycle[2]), ...cyclePayload(options) } };
  }
  const cycles = parsed.pathname.match(/^\/api\/v1\/projects\/([^/]+)\/cycles$/u);
  if (method === "POST" && cycles) {
    return { operation: "project.cyclecreate", input: { projectKey: decodeSegment(cycles[1]), ...cyclePayload(options) } };
  }
  const projectAttachment = parsed.pathname.match(/^\/api\/v1\/projects\/([^/]+)\/attachments\/(\d+)$/u);
  if (method === "DELETE" && projectAttachment) {
    rejectBody(options);
    return { operation: "project.attachmentarchive", input: { projectKey: decodeSegment(projectAttachment[1]), attachmentId: positiveInteger(projectAttachment[2]) } };
  }
  const token = parsed.pathname.match(/^\/api\/v1\/me\/tokens\/(\d+)$/u);
  if (method === "PATCH" && token) {
    const body = parseJsonBody(options, ["name", "project_scope", "scopes"]);
    return { operation: "identity.tokenupdate", input: { tokenId: positiveInteger(token[1]), ...renameBody(body, { project_scope: "projectScope" }) } };
  }
  if (method === "DELETE" && token) { rejectBody(options); return { operation: "identity.tokendelete", input: { tokenId: positiveInteger(token[1]) } }; }
  const deviceSession = parsed.pathname.match(/^\/api\/v1\/me\/device-sessions\/([^/]+)$/u);
  if (method === "DELETE" && deviceSession) { rejectBody(options); return { operation: "identity.devicesessionrevoke", input: { familyId: decodeSegment(deviceSession[1]) } }; }
  if (method === "PATCH" && parsed.pathname === "/api/v1/current-project") {
    const body = parseJsonBody(options, ["project_key"]);
    return { operation: "project.select", input: { projectKey: body.project_key } };
  }
  if (method === "POST" && parsed.pathname === "/api/v1/notifications/read-all") {
    rejectBody(options);
    return { operation: "notification.readall", input: {} };
  }
  const notificationRead = parsed.pathname.match(/^\/api\/v1\/notifications\/(\d+)\/read$/u);
  if (method === "POST" && notificationRead) {
    rejectBody(options);
    return { operation: "notification.read", input: { notificationId: positiveInteger(notificationRead[1]) } };
  }
  const handoff = parsed.pathname.match(/^\/api\/v1\/work-items\/([^/]+)\/handoff$/u);
  if (method === "POST" && handoff) {
    const body = parseJsonBody(options, ["assignee_username", "body", "source_comment_id", "status"]);
    return { operation: "workitem.handoff", input: { itemKey: decodeSegment(handoff[1]), payload: renameBody(body, {
      assignee_username: "assigneeUsername", source_comment_id: "sourceCommentId",
    }) } };
  }
  const comments = parsed.pathname.match(/^\/api\/v1\/work-items\/([^/]+)\/comments$/u);
  if (method === "POST" && comments) {
    return { operation: "workitem.commentcreate", input: { itemKey: decodeSegment(comments[1]), payload: commentPayload(options) } };
  }
  const comment = parsed.pathname.match(/^\/api\/v1\/work-items\/([^/]+)\/comments\/(\d+)$/u);
  if (method === "PATCH" && comment) {
    return { operation: "workitem.commentupdate", input: { itemKey: decodeSegment(comment[1]), commentId: positiveInteger(comment[2]), payload: commentPayload(options) } };
  }
  const item = parsed.pathname.match(/^\/api\/v1\/work-items\/([^/]+)$/u);
  if (method === "PATCH" && item) {
    const body = parseJsonBody(options, ["assignee_username", "description", "due_date", "parent_item_key", "priority", "status", "title"]);
    return { operation: "workitem.update", input: { itemKey: decodeSegment(item[1]), payload: renameBody(body, {
      assignee_username: "assigneeUsername", due_date: "dueDate", parent_item_key: "parentItemKey",
    }) } };
  }
  throw apiError("operation_not_allowed", 405);
}

function commentPayload(options) {
  return renameBody(parseJsonBody(options, ["body", "body_format", "parent_comment_id"]), {
    body_format: "bodyFormat", parent_comment_id: "parentCommentId",
  });
}

function cyclePayload(options) {
  return renameBody(parseJsonBody(options, ["description", "end_date", "goal", "name", "owner_username", "start_date"]), {
    end_date: "endDate", owner_username: "ownerUsername", start_date: "startDate",
  });
}

function parseJsonBody(options, allowed) {
  if (!isPlainObject(options) || !sameKeys(options, ["body", "headers", "method"]) || !isPlainObject(options.headers) ||
    !sameKeys(options.headers, ["content-type"]) || options.headers["content-type"] !== "application/json" || typeof options.body !== "string" || options.body.length > 128 * 1024) {
    throw apiError("invalid_request", 400);
  }
  let body;
  try { body = JSON.parse(options.body); } catch { throw apiError("invalid_request", 400); }
  if (!isPlainObject(body) || Object.keys(body).some((key) => !allowed.includes(key))) throw apiError("invalid_request", 400);
  return body;
}

function rejectBody(options) {
  if (!isPlainObject(options) || !sameKeys(options, ["method"])) throw apiError("invalid_request", 400);
}

function renameBody(body, names) {
  return Object.fromEntries(Object.entries(body).map(([key, value]) => [names[key] ?? key, value]));
}

function matchPath(parsed, pattern, operation, buildInput) {
  const match = parsed.pathname.match(pattern);
  if (!match) return null;
  rejectQuery(parsed.searchParams, []);
  return { operation, input: buildInput(match.slice(1)) };
}
function parseQuery(params, names) {
  rejectQuery(params, Object.keys(names));
  const input = {};
  for (const [wireName, domainName] of Object.entries(names)) {
    if (!params.has(wireName)) continue;
    const value = params.get(wireName);
    input[domainName] = ["page", "per_page", "limit"].includes(wireName) ? positiveInteger(value) : value;
  }
  return input;
}
function rejectQuery(params, allowed) {
  for (const key of params.keys()) if (!allowed.includes(key) || params.getAll(key).length !== 1) throw apiError("invalid_request", 400);
}
function positiveInteger(value) { const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed < 1 || String(parsed) !== value) throw apiError("invalid_request", 400); return parsed; }
function decodeSegment(value) { try { const decoded = decodeURIComponent(value); if (encodeURIComponent(decoded) !== value) throw new Error(); return decoded; } catch { throw apiError("invalid_request", 400); } }
function apiError(code, status) { return new ApiError({ code, status, message: "Desktop business request failed." }); }
function isPlainObject(value) { return value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype; }
function sameKeys(value, expected) { const keys = Object.keys(value).sort(); return keys.length === expected.length && keys.every((key, index) => key === expected[index]); }
