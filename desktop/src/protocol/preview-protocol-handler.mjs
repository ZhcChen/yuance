import { createReadStream } from "node:fs";
import { Readable } from "node:stream";

const PREVIEW_PATH = /^\/\.preview\/(ypv_[A-Za-z0-9_-]{32})$/u;

export function createPreviewProtocolHandler({ resolveSnapshot, streamFactory = createReadStream } = {}) {
  if (typeof resolveSnapshot !== "function" || typeof streamFactory !== "function") throw new TypeError("preview protocol dependencies are required");
  return async (request) => {
    const parsed = parseRequest(request);
    if (!parsed.ok) return response(parsed.status);
    let snapshot;
    try { snapshot = await resolveSnapshot(parsed.capability); }
    catch { return response(404); }
    if (!validSnapshot(snapshot)) return response(404);
    const range = parseRange(parsed.range, snapshot.byteSize);
    if (!range.ok) return response(416, { "Content-Range": `bytes */${snapshot.byteSize}` });
    const headers = previewHeaders(snapshot, range);
    if (parsed.headOnly) return response(range.partial ? 206 : 200, headers);
    const body = Readable.toWeb(streamFactory(snapshot.privatePath, { start: range.start, end: range.end, autoClose: true }));
    return new Response(body, { status: range.partial ? 206 : 200, headers });
  };
}

function parseRequest(request) {
  const method = String(request?.method || "GET").toUpperCase();
  if (!new Set(["GET", "HEAD"]).has(method) || request?.body != null) return { ok: false, status: method === "GET" || method === "HEAD" ? 400 : 405 };
  let url;
  try { url = new URL(String(request?.url || "")); } catch { return { ok: false, status: 400 }; }
  const match = url.protocol === "app:" && url.hostname === "yuance" && !url.username && !url.password && !url.port && !url.search && !url.hash ? url.pathname.match(PREVIEW_PATH) : null;
  if (!match) return { ok: false, status: 404 };
  const headers = new Headers(request?.headers);
  return { ok: true, capability: match[1], headOnly: method === "HEAD", range: headers.get("range") };
}

function parseRange(value, total) {
  if (value === null) return { ok: true, partial: false, start: 0, end: Math.max(0, total - 1), length: total };
  if (total === 0 || typeof value !== "string" || value.includes(",")) return { ok: false };
  const match = value.match(/^bytes=(\d*)-(\d*)$/u);
  if (!match || (!match[1] && !match[2])) return { ok: false };
  let start;
  let end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix < 1) return { ok: false };
    start = Math.max(0, total - suffix); end = total - 1;
  } else {
    start = Number(match[1]); end = match[2] ? Number(match[2]) : total - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= total || end < start) return { ok: false };
    end = Math.min(end, total - 1);
  }
  return { ok: true, partial: true, start, end, length: end - start + 1 };
}

function previewHeaders(snapshot, range) {
  return {
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "Content-Disposition": "inline",
    "Content-Length": String(range.length),
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Content-Type": snapshot.contentType,
    "X-Content-Type-Options": "nosniff",
    ...(range.partial ? { "Content-Range": `bytes ${range.start}-${range.end}/${snapshot.byteSize}` } : {}),
  };
}
function validSnapshot(value) { return value && typeof value.privatePath === "string" && typeof value.contentType === "string" && Number.isSafeInteger(value.byteSize) && value.byteSize >= 0; }
function response(status, headers = {}) { return new Response(null, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers } }); }
