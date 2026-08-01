import path from "node:path";

import { isAllowedAppRoute, isCanonicalAppPathname } from "../routes/app-route.mjs";
import { validateResourceManifest } from "./resource-manifest.mjs";

export const APP_SCHEME = "app";
export const APP_HOST = "yuance";
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

export const APP_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'none'",
  "worker-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

const RESERVED_ROUTE_PREFIXES = Object.freeze(["/api", "/.well-known"]);
const MIME_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
});

function errorResult(status, reason) {
  return Object.freeze({ ok: false, status, reason });
}

function hasDangerousEncoding(rawUrl) {
  let candidate = rawUrl;
  for (let depth = 0; depth < 3; depth += 1) {
    if (
      /\\|%00|%(?:2e|2f|5c)/i.test(candidate) ||
      /(?:^|\/)\.{1,2}(?:\/|[?#]|$)/.test(candidate)
    ) return true;
    try {
      const decoded = decodeURIComponent(candidate);
      if (decoded === candidate) return false;
      candidate = decoded;
    } catch (_error) {
      return true;
    }
  }
  return /%/i.test(candidate);
}

function matchesPrefix(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isSpaRoute(pathname) {
  if (RESERVED_ROUTE_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix))) return false;
  if (path.posix.extname(pathname)) return false;
  return isAllowedAppRoute(pathname);
}

function responseHeaders(resourcePath, resource) {
  const extension = path.posix.extname(resourcePath).toLowerCase();
  const isHtml = extension === ".html";
  const fingerprint = resourcePath.match(/(?:^|\/)[^/]+[.-]([a-f0-9]{8,})\.[^/]+$/i)?.[1];
  const isFingerprinted = Boolean(
    fingerprint && resource.sha256.startsWith(fingerprint.toLowerCase()),
  );
  return Object.freeze({
    "Cache-Control": isHtml
      ? "no-store"
      : isFingerprinted
        ? "public, max-age=31536000, immutable"
        : "no-cache",
    "Content-Security-Policy": APP_CONTENT_SECURITY_POLICY,
    "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
  });
}

export function resolveAppProtocolRequest(request, manifestInput) {
  const manifest = validateResourceManifest(manifestInput);
  const method = String(request?.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") return errorResult(405, "method_not_allowed");
  if (request?.body != null) return errorResult(400, "request_body_not_allowed");

  const rawUrl = String(request?.url || "");
  if (!rawUrl || hasDangerousEncoding(rawUrl)) return errorResult(400, "invalid_url_encoding");

  let url;
  try {
    url = new URL(rawUrl);
  } catch (_error) {
    return errorResult(400, "invalid_url");
  }
  if (
    url.protocol !== `${APP_SCHEME}:` ||
    url.hostname !== APP_HOST ||
    url.username ||
    url.password ||
    url.port
  ) {
    return errorResult(403, "invalid_authority");
  }
  if (!isCanonicalAppPathname(url.pathname)) return errorResult(400, "invalid_pathname");

  const resourcePath = manifest.files[url.pathname]
    ? url.pathname
    : isSpaRoute(url.pathname)
      ? manifest.entrypoint
      : null;
  if (!resourcePath) return errorResult(404, "resource_not_found");

  return Object.freeze({
    ok: true,
    status: 200,
    headOnly: method === "HEAD",
    resourcePath,
    resource: manifest.files[resourcePath],
    headers: responseHeaders(resourcePath, manifest.files[resourcePath]),
  });
}
