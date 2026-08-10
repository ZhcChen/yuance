import { createProfileKey } from "../auth/profile.mjs";
import { isTrustedSessionFetch } from "../network/network-session.mjs";

const PROJECT_CONTENT_PATH = /^\/api\/v1\/projects\/[A-Z][A-Z0-9-]{1,31}\/attachments\/[1-9][0-9]*\/preview\/content$/u;
const RESOURCE_CONTENT_PATH = /^\/api\/v1\/projects\/[A-Z][A-Z0-9-]{1,31}\/resources\/[1-9][0-9]*\/attachments\/[1-9][0-9]*\/preview\/content$/u;
const WORK_ITEM_CONTENT_PATH = /^\/api\/v1\/work-items\/[A-Z][A-Z0-9-]{2,63}\/attachments\/[1-9][0-9]*\/preview\/content$/u;
const WORK_ITEM_COMMENT_CONTENT_PATH = /^\/api\/v1\/work-items\/[A-Z][A-Z0-9-]{2,63}\/comments\/[1-9][0-9]*\/attachments\/[1-9][0-9]*\/preview\/content$/u;
const MAX_TIMEOUT_MS = 30_000;

export function createPreviewContentLoader({ profile, credentialRuntime, fetchImpl, spool, timeoutMs = MAX_TIMEOUT_MS } = {}) {
  if (!profile || !Object.isFrozen(profile) || createProfileKey(profile) !== profile.key) throw new TypeError("trusted profile is required");
  if (typeof credentialRuntime?.withAccessLease !== "function" || typeof credentialRuntime?.refreshAccess !== "function") throw new TypeError("credential runtime is required");
  if (!isTrustedSessionFetch(fetchImpl)) throw new TypeError("trusted Electron session fetch is required");
  if (typeof spool?.capture !== "function") throw new TypeError("preview spool is required");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) throw new TypeError("preview timeout exceeds the fixed safety limit");

  async function load({ contentPath, contentType, byteSize, signal } = {}) {
    if (typeof contentPath !== "string" || !isPreviewContentPath(contentPath) || typeof contentType !== "string" || contentType.length < 1 || contentType.length > 255 || !Number.isSafeInteger(byteSize) || byteSize < 0 || (signal !== undefined && !(signal instanceof AbortSignal))) throw previewError("preview_request_invalid");
    const first = await fetchOnce({ contentPath, contentType, byteSize, signal, allowRefresh: true });
    if (!first.expired) return first.snapshot;
    if (!await credentialRuntime.refreshAccess(first.epoch)) throw previewError("preview_session_stale");
    const second = await fetchOnce({ contentPath, contentType, byteSize, signal, allowRefresh: false });
    if (second.expired) throw previewError("preview_unauthorized");
    return second.snapshot;
  }

  function fetchOnce({ contentPath, contentType, byteSize, signal, allowRefresh }) {
    return credentialRuntime.withAccessLease(async ({ accessToken, epoch }) => {
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) controller.abort();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const url = `${profile.origin}${contentPath}`;
      let response;
      try {
        response = await fetchImpl(url, { method: "GET", redirect: "manual", credentials: "omit", cache: "no-store", signal: controller.signal, headers: { Accept: contentType, Authorization: `Bearer ${accessToken}`, "Cache-Control": "no-store" } });
        if (allowRefresh && response.status === 401) return Object.freeze({ expired: true, epoch });
        validateResponse(response, url, contentType, byteSize);
        if (!response.body) throw previewError("preview_response_invalid");
        const snapshot = await spool.capture(response.body, { contentType, expectedBytes: byteSize });
        return Object.freeze({ expired: false, snapshot });
      } catch (error) {
        if (error?.code?.startsWith("preview_")) throw error;
        throw previewError(controller.signal.aborted ? "preview_request_aborted" : "preview_network_error");
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", abort);
        controller.abort();
        await response?.body?.cancel().catch(() => {});
      }
    });
  }

  return Object.freeze({ load });
}
function isPreviewContentPath(value) {
  let parsed;
  try { parsed = new URL(value, "https://preview.invalid"); } catch { return false; }
  if (parsed.origin !== "https://preview.invalid" || parsed.hash) return false;
  if (PROJECT_CONTENT_PATH.test(parsed.pathname) || WORK_ITEM_CONTENT_PATH.test(parsed.pathname) || WORK_ITEM_COMMENT_CONTENT_PATH.test(parsed.pathname)) return parsed.search === "";
  if (!RESOURCE_CONTENT_PATH.test(parsed.pathname)) return false;
  const entries = [...parsed.searchParams.entries()];
  if (entries.length === 0) return parsed.search === "";
  if (entries.length !== 1 || entries[0][0] !== "access" || entries[0][1].length < 1 || entries[0][1].length > 4096) return false;
  return parsed.search === `?${new URLSearchParams({ access: entries[0][1] })}`;
}

function validateResponse(response, url, contentType, byteSize) {
  if (!response || response.redirected || response.status !== 200 || (response.url && response.url !== url)) throw previewError(response?.status === 401 ? "preview_unauthorized" : "preview_response_invalid");
  if ((response.headers.get("content-type") || "").toLowerCase() !== contentType.toLowerCase()) throw previewError("preview_response_invalid");
  if (response.headers.get("content-length") !== String(byteSize) || response.headers.get("cache-control") !== "private, no-store" || response.headers.get("x-content-type-options") !== "nosniff") throw previewError("preview_response_invalid");
}
function previewError(code) { return Object.assign(new Error("Preview content load failed"), { code }); }
