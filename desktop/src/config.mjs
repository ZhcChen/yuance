export const DEFAULT_WEB_URL = "https://yuance.quanxinfu.com/web";
export const DEFAULT_NOTIFICATION_TITLE = "元策";

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

export function isTrustedAppUrl(value, appOrigin) {
  try {
    return new URL(value).origin === appOrigin;
  } catch (_error) {
    return false;
  }
}

export function safeNotificationTarget(value, appOrigin) {
  const fallback = "/web/messages";
  try {
    const target = new URL(value, appOrigin);
    if (
      target.origin !== appOrigin ||
      !(target.pathname === "/web" || target.pathname.startsWith("/web/"))
    ) {
      return fallback;
    }
    return `${target.pathname}${target.search}${target.hash}`;
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

export function isSafeExternalUrl(value) {
  try {
    const target = new URL(value);
    return target.protocol === "https:" || target.protocol === "http:";
  } catch (_error) {
    return false;
  }
}
