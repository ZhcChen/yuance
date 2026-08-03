// @ts-check

import { ApiError } from "@yuance/frontend-api-client";

const STATIC_ROUTES = new Map([
  ["/api/v1/auth/me", ["identity.current", []]],
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
  if (options !== undefined && (!isPlainObject(options) || Object.keys(options).some((key) => key !== "method") || options.method !== "GET")) {
    throw apiError("operation_not_allowed", 405);
  }
  const parsed = new URL(url, "https://desktop.invalid");
  if (parsed.origin !== "https://desktop.invalid" || `${parsed.pathname}${parsed.search}` !== url) throw apiError("invalid_request", 400);
  const staticRoute = STATIC_ROUTES.get(parsed.pathname);
  if (staticRoute) {
    rejectQuery(parsed.searchParams, staticRoute[1]);
    return { operation: staticRoute[0], input: {} };
  }
  if (parsed.pathname === "/api/v1/projects") return { operation: "project.list", input: parseQuery(parsed.searchParams, {
    status: "status", page: "page", per_page: "perPage",
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
