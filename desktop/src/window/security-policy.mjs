import { APP_HOST, APP_ORIGIN } from "../protocol/app-protocol.mjs";
import { isAllowedAppRoute } from "../routes/app-route.mjs";

export const PRODUCTION_SESSION_PARTITION = "persist:yuance";
export const DEVELOPMENT_SESSION_PARTITION = "persist:yuance-dev";
export const DEFAULT_RENDERER_DEV_URL = "http://127.0.0.1:4273";
const PREVIEW_SUBFRAME_PATH = /^\/\.preview\/ypv_[A-Za-z0-9_-]{32}$/u;

function isLoopbackHostname(hostname) {
  return hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "localhost";
}

function parseCanonicalUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (!url.hostname || url.username || url.password) return null;
    return url;
  } catch (_error) {
    return null;
  }
}

/** @param {{ isPackaged?: boolean, rawDevServerUrl?: string }} options */
export function resolveRendererTarget({ isPackaged, rawDevServerUrl } = {}) {
  if (isPackaged) {
    return Object.freeze({
      kind: "app-protocol",
      url: `${APP_ORIGIN}/`,
      origin: APP_ORIGIN,
      partition: PRODUCTION_SESSION_PARTITION,
    });
  }

  const url = parseCanonicalUrl(rawDevServerUrl || DEFAULT_RENDERER_DEV_URL);
  if (
    !url ||
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    !isLoopbackHostname(url.hostname) ||
    !url.port ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Renderer dev server must be an explicit loopback HTTP(S) origin with a port.");
  }
  return Object.freeze({
    kind: "dev-server",
    url: url.origin,
    origin: url.origin,
    partition: DEVELOPMENT_SESSION_PARTITION,
  });
}

export function isTrustedRendererUrl(value, rendererTarget) {
  const url = parseCanonicalUrl(value);
  if (!url || !rendererTarget) return false;
  if (rendererTarget.kind === "app-protocol") {
    return (
      url.protocol === "app:" &&
      url.hostname === APP_HOST &&
      !url.port &&
      isAllowedAppRoute(url.pathname)
    );
  }
  return (
    url.origin === rendererTarget.origin &&
    isAllowedAppRoute(url.pathname)
  );
}

/**
 * @param {unknown} value
 * @param {{ isDevelopment?: boolean, devOrigin?: string }} options
 */
export function normalizeSafeExternalUrl(value, { isDevelopment = false, devOrigin } = {}) {
  const url = parseCanonicalUrl(value);
  if (!url) return null;
  if (url.protocol === "https:") return !url.port || url.port === "443" ? url.href : null;
  if (!isDevelopment || url.protocol !== "http:" || !devOrigin) return null;

  const allowedOrigin = parseCanonicalUrl(devOrigin);
  return allowedOrigin &&
    allowedOrigin.protocol === "http:" &&
    isLoopbackHostname(allowedOrigin.hostname) &&
    allowedOrigin.port &&
    url.origin === allowedOrigin.origin
    ? url.href
    : null;
}

export function isSafeExternalUrl(value, options) {
  return normalizeSafeExternalUrl(value, options) !== null;
}

export function decideNavigation({ url, isMainFrame, rendererTarget }) {
  if (!isMainFrame) {
    const parsed = parseCanonicalUrl(url);
    const isPreviewSubframe = parsed?.protocol === "app:" &&
      parsed.hostname === APP_HOST &&
      !parsed.port &&
      !parsed.search &&
      !parsed.hash &&
      PREVIEW_SUBFRAME_PATH.test(parsed.pathname);
    return Object.freeze({ action: isPreviewSubframe ? "allow" : "deny" });
  }
  if (isTrustedRendererUrl(url, rendererTarget)) return Object.freeze({ action: "allow" });
  if (
    isSafeExternalUrl(url, {
      isDevelopment: rendererTarget?.kind === "dev-server",
      devOrigin: rendererTarget?.origin,
    })
  ) {
    return Object.freeze({ action: "external" });
  }
  return Object.freeze({ action: "deny" });
}

/** @param {{ preloadPath: string, partition: string, additionalArguments?: string[] }} options */
export function browserWindowWebPreferences({ preloadPath, partition, additionalArguments = [] }) {
  return Object.freeze({
    preload: preloadPath,
    partition,
    additionalArguments: Object.freeze([...additionalArguments]),
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    webSecurity: true,
    webviewTag: false,
  });
}
