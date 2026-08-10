import { createHash } from "node:crypto";
import { isIP } from "node:net";

const PROFILE_KEY_VERSION = "yuance-desktop-profile-v1";
const PROFILE_MODES = new Set(["production", "development"]);

function fail(message) {
  throw new TypeError(`Invalid desktop profile: ${message}`);
}

export function isLoopbackHostname(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "localhost") {
    return true;
  }

  const ipVersion = isIP(normalized);
  if (ipVersion === 4) {
    return normalized.split(".")[0] === "127";
  }
  return ipVersion === 6 && normalized === "::1";
}

function requireMode(mode) {
  if (!PROFILE_MODES.has(mode)) {
    fail("mode must be production or development");
  }
  return mode;
}

function requireServerInstanceId(serverInstanceId) {
  if (typeof serverInstanceId !== "string" || serverInstanceId.length === 0) {
    fail("server_instance_id must be a non-empty string");
  }
  if (serverInstanceId.trim() !== serverInstanceId || /[\u0000-\u001f\u007f]/u.test(serverInstanceId)) {
    fail("server_instance_id must not contain surrounding whitespace or control characters");
  }
  return serverInstanceId;
}

export function canonicalizeServerOrigin(
  endpoint,
  { mode = "production", allowLoopbackHttp = false, redirected = false } = {},
) {
  requireMode(mode);
  if (redirected !== false) {
    fail("redirected endpoints are not accepted");
  }
  if (typeof endpoint !== "string" || endpoint.length === 0 || endpoint.trim() !== endpoint) {
    fail("endpoint must be a non-empty URL without surrounding whitespace");
  }

  let parsed;
  try {
    parsed = new URL(endpoint);
  } catch {
    fail("endpoint must be an absolute URL");
  }

  if (parsed.username || parsed.password) {
    fail("endpoint must not contain userinfo");
  }
  if (parsed.search) {
    fail("endpoint must not contain a query");
  }
  if (parsed.hash) {
    fail("endpoint must not contain a fragment");
  }
  if (
    parsed.pathname !== "/" ||
    endpoint.includes("\\") ||
    !/^[A-Za-z][A-Za-z\d+.-]*:\/\/[^/?#]+\/?$/u.test(endpoint)
  ) {
    fail("endpoint must be an origin without a path");
  }

  if (parsed.protocol === "https:") {
    return parsed.origin;
  }
  if (
    parsed.protocol === "http:" &&
    mode === "development" &&
    allowLoopbackHttp === true &&
    isLoopbackHostname(parsed.hostname)
  ) {
    return parsed.origin;
  }
  fail("endpoint must use HTTPS, except explicitly allowed loopback HTTP in development");
}

export function createProfileKey({ origin, serverInstanceId, mode }) {
  const normalizedMode = requireMode(mode);
  const normalizedServerInstanceId = requireServerInstanceId(serverInstanceId);
  const normalizedOrigin = canonicalizeServerOrigin(origin, {
    mode: normalizedMode,
    allowLoopbackHttp: normalizedMode === "development",
  });
  const identity = [PROFILE_KEY_VERSION, normalizedMode, normalizedOrigin, normalizedServerInstanceId];
  const hash = createHash("sha256");
  for (const value of identity) {
    const bytes = Buffer.from(value, "utf8");
    const length = Buffer.allocUnsafe(4);
    length.writeUInt32BE(bytes.length);
    hash.update(length);
    hash.update(bytes);
  }
  return `${PROFILE_KEY_VERSION}:${hash.digest("hex")}`;
}

export function createDesktopProfile({
  endpoint,
  serverInstanceId,
  mode = "production",
  allowLoopbackHttp = false,
  redirected = false,
} = {}) {
  const normalizedMode = requireMode(mode);
  const normalizedServerInstanceId = requireServerInstanceId(serverInstanceId);
  const origin = canonicalizeServerOrigin(endpoint, {
    mode: normalizedMode,
    allowLoopbackHttp,
    redirected,
  });
  const key = createProfileKey({
    origin,
    serverInstanceId: normalizedServerInstanceId,
    mode: normalizedMode,
  });

  return Object.freeze({
    version: 1,
    mode: normalizedMode,
    origin,
    serverInstanceId: normalizedServerInstanceId,
    key,
  });
}
