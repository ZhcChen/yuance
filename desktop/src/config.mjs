import path from "node:path";

import { isLoopbackHostname } from "./auth/profile.mjs";
import { isAllowedAppRoute } from "./routes/app-route.mjs";

export const DEFAULT_WEB_URL = "https://yuance.quanxinfu.com/web";
export const DEFAULT_NOTIFICATION_TITLE = "元策";
export const PRODUCTION_APP_DISPLAY_NAME = "元策";
export const DEVELOPMENT_APP_DISPLAY_NAME = "元策 Dev";
export const PRODUCTION_APP_USER_MODEL_ID = "com.quanxinfu.yuance";
export const DEVELOPMENT_APP_USER_MODEL_ID = "com.quanxinfu.yuance.dev";

export function isDevelopmentRuntime({ isPackaged } = {}) {
  return !isPackaged;
}

export function resolveDesktopAppIdentity(isDevRuntime) {
  return isDevRuntime
    ? {
        displayName: DEVELOPMENT_APP_DISPLAY_NAME,
        appUserModelId: DEVELOPMENT_APP_USER_MODEL_ID,
      }
    : {
        displayName: PRODUCTION_APP_DISPLAY_NAME,
        appUserModelId: PRODUCTION_APP_USER_MODEL_ID,
      };
}

export function resolveDevelopmentDataPaths(appDataPath) {
  const userData = path.join(appDataPath, DEVELOPMENT_APP_DISPLAY_NAME);
  return {
    userData,
    sessionData: path.join(userData, "Session Data"),
  };
}

export function resolveWebUrl(rawUrl = process.env.YUANCE_DESKTOP_WEB_URL) {
  const candidate = String(rawUrl || DEFAULT_WEB_URL).trim();
  const parsed = new URL(candidate);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("YUANCE_DESKTOP_WEB_URL must use http or https.");
  }
  if (!parsed.hostname) {
    throw new Error("YUANCE_DESKTOP_WEB_URL must include a host.");
  }
  parsed.search = "";
  parsed.hash = "";
  if (!parsed.pathname || parsed.pathname === "/") {
    parsed.pathname = "/web";
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/web";
  return {
    url: parsed.toString(),
    origin: parsed.origin,
  };
}

export function resolveDeviceAuthEndpoint({
  isDevRuntime,
  rawUrl = process.env.YUANCE_DESKTOP_WEB_URL,
} = {}) {
  return resolveDesktopNetworkOrigin({ isDevRuntime, rawUrl });
}

export function resolveDesktopNetworkOrigin({ isDevRuntime, rawUrl } = {}) {
  if (!isDevRuntime) return new URL(DEFAULT_WEB_URL).origin;
  if (typeof rawUrl !== "string" || rawUrl.length === 0 || rawUrl.trim() !== rawUrl) {
    throw new Error("Development Desktop network origin must be an explicit loopback URL.");
  }
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Development Desktop network origin must be a valid URL.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Development Desktop network origin must not contain userinfo.");
  }
  if (parsed.search || parsed.hash) {
    throw new Error("Development Desktop network origin must not contain a query or fragment.");
  }
  if (!isLoopbackHostname(parsed.hostname)) {
    throw new Error("Development Desktop network origin must use a loopback host.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Development Desktop network origin must use HTTP or HTTPS.");
  }
  if (rawUrl.includes("\\") || !["/", "/web", "/web/"].includes(parsed.pathname)) {
    throw new Error("Development Desktop network origin path must be / or /web.");
  }
  return parsed.origin;
}

export function isTrustedAppUrl(value, appOrigin) {
  try {
    const target = new URL(value);
    const expected = new URL(appOrigin);
    return (
      target.protocol === expected.protocol &&
      target.hostname === expected.hostname &&
      target.port === expected.port &&
      !target.username &&
      !target.password
    );
  } catch (_error) {
    return false;
  }
}

export function safeNotificationTarget(value, appOrigin) {
  const fallback = "/messages";
  try {
    const target = new URL(value, appOrigin);
    const expected = new URL(appOrigin);
    if (
      target.protocol !== expected.protocol ||
      target.hostname !== expected.hostname ||
      target.port !== expected.port ||
      target.username ||
      target.password ||
      target.search ||
      target.hash ||
      !isAllowedAppRoute(target.pathname)
    ) {
      return fallback;
    }
    return target.pathname;
  } catch (_error) {
    return fallback;
  }
}

function normalizeText(value, fallback, limit) {
  const text = String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return (text || fallback).slice(0, limit);
}

export function normalizeNotificationPayload(payload, appOrigin) {
  const value = payload && typeof payload === "object" ? payload : {};
  return {
    title: normalizeText(value.title, DEFAULT_NOTIFICATION_TITLE, 120),
    body: normalizeText(value.body, "你有一条新的消息。", 240),
    targetPath: safeNotificationTarget(value.targetPath, appOrigin),
  };
}
