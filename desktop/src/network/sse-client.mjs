import { EventSourceParserStream } from "eventsource-parser/stream";

import { createProfileKey } from "../auth/profile.mjs";
import { isTrustedSessionFetch } from "./network-session.mjs";

const CONTENT_TYPE = /^text\/event-stream(?:\s*;|$)/iu;

export class SseContractError extends Error {
  constructor(code, message, { status } = {}) {
    super(message);
    this.name = "SseContractError";
    this.code = code;
    this.status = status;
  }
}

export function createSseClient({
  profile,
  fetchImpl,
  maxHeaderBytes = 32 * 1024,
  maxBufferBytes = 128 * 1024,
  maxEventBytes = 64 * 1024,
  maxEventsPerWindow = 120,
  rateWindowMs = 10_000,
  idleMs = 45_000,
  now = Date.now,
} = {}) {
  validateProfile(profile);
  if (typeof fetchImpl !== "function" || !isTrustedSessionFetch(fetchImpl)) {
    throw new TypeError("trusted Electron session fetch is required");
  }
  for (const [name, value] of Object.entries({ maxHeaderBytes, maxBufferBytes, maxEventBytes, maxEventsPerWindow, rateWindowMs, idleMs })) {
    if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${name} is invalid`);
  }
  if (typeof now !== "function") throw new TypeError("now is required");

  async function subscribe({ accessToken, signal, onControl = () => {}, onRetry = () => {} } = {}) {
    if (typeof accessToken !== "string" || !accessToken.startsWith("yuance_dat_")) throw new TypeError("device access token is required");
    if (!(signal instanceof AbortSignal)) throw new TypeError("AbortSignal is required");
    if (typeof onControl !== "function" || typeof onRetry !== "function") throw new TypeError("SSE observers must be functions");
    const url = `${profile.origin}/api/v1/device-session/events`;
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) controller.abort();
    let response;
    try {
      response = await fetchImpl(url, { method: "GET", redirect: "manual", credentials: "omit", cache: "no-store", signal: controller.signal,
        headers: { Accept: "text/event-stream", Authorization: `Bearer ${accessToken}`, "Cache-Control": "no-store" } });
    } catch {
      signal.removeEventListener("abort", abort);
      throw contract(signal.aborted ? "stream_aborted" : "network_error", signal.aborted ? "Stream was aborted" : "Stream request failed");
    }
    try { validateResponse(response, url, maxHeaderBytes); }
    catch (error) {
      controller.abort();
      signal.removeEventListener("abort", abort);
      throw error;
    }
    let retryHint;
    const decoder = new TextDecoderStream("utf-8", { fatal: true });
    const bufferGate = createBufferGate(maxBufferBytes);
    const parser = new EventSourceParserStream({
      maxBufferSize: maxBufferBytes,
      onError: "terminate",
      onRetry(value) { retryHint = value; onRetry(value); },
    });
    const reader = response.body.pipeThrough(decoder).pipeThrough(bufferGate).pipeThrough(parser).getReader();
    const eventTimes = [];
    try {
      while (true) {
        const { done, value } = await readWithIdle(reader, controller.signal, idleMs);
        if (done) return Object.freeze({ reason: "eof", retryHint });
        const eventBytes = Buffer.byteLength(`${value.event || ""}\n${value.id || ""}\n${value.data || ""}`, "utf8");
        if (eventBytes > maxEventBytes) throw contract("event_too_large", "SSE event is too large");
        const timestamp = now();
        while (eventTimes.length > 0 && timestamp - eventTimes[0] >= rateWindowMs) eventTimes.shift();
        eventTimes.push(timestamp);
        if (eventTimes.length > maxEventsPerWindow) throw contract("event_rate_exceeded", "SSE event rate exceeded");
        const control = decodeControl(value);
        if (control) onControl(control);
      }
    } catch (error) {
      if (error instanceof SseContractError) throw error;
      if (controller.signal.aborted && signal.aborted) throw contract("stream_aborted", "Stream was aborted");
      if (error?.name === "TypeError") throw contract("invalid_utf8", "SSE stream is not valid UTF-8");
      throw contract("invalid_stream", "SSE stream is invalid");
    } finally {
      controller.abort();
      signal.removeEventListener("abort", abort);
      reader.cancel().catch(() => {});
    }
  }
  return Object.freeze({ subscribe });
}

function validateResponse(response, expectedUrl, maxHeaderBytes) {
  if (!response || typeof response.status !== "number") throw new TypeError("response is required");
  if (response.redirected || (response.status >= 300 && response.status < 400)) throw contract("redirect_not_allowed", "SSE redirects are not allowed", response.status);
  if (response.url && response.url !== expectedUrl) throw contract("response_url_mismatch", "SSE response URL changed", response.status);
  let headerBytes = 0;
  for (const [name, value] of response.headers) headerBytes += Buffer.byteLength(name, "utf8") + Buffer.byteLength(value, "utf8");
  if (headerBytes > maxHeaderBytes) throw contract("headers_too_large", "SSE response headers are too large", response.status);
  if (response.status !== 200) throw contract(response.status === 401 ? "unauthorized" : "unexpected_status", "SSE response status is invalid", response.status);
  if (!CONTENT_TYPE.test(response.headers.get("content-type") || "")) throw contract("invalid_content_type", "Response must be an event stream", response.status);
  if (!response.body) throw contract("missing_body", "SSE response body is missing", response.status);
}

function decodeControl(message) {
  if (message.event !== "connected") return undefined;
  try {
    const data = JSON.parse(message.data);
    if (data && Object.keys(data).length === 1 && data.schema_version === 1) return Object.freeze({ type: "connected" });
  } catch {}
  throw contract("invalid_control_event", "SSE control event is invalid");
}

function createBufferGate(maxBufferBytes) {
  let pending = "";
  return new TransformStream({
    transform(chunk, controller) {
      pending += chunk;
      const frames = pending.split(/(?:\r\n|\r|\n)(?:\r\n|\r|\n)/u);
      pending = frames.at(-1);
      if (Buffer.byteLength(pending, "utf8") > maxBufferBytes) {
        throw contract("buffer_too_large", "SSE parser buffer is too large");
      }
      controller.enqueue(chunk);
    },
  });
}

async function readWithIdle(reader, signal, idleMs) {
  if (signal.aborted) throw contract("stream_aborted", "Stream was aborted");
  let timer;
  let abort;
  const deadline = new Promise((_resolve, reject) => { timer = setTimeout(() => reject(contract("idle_timeout", "SSE stream became idle")), idleMs); });
  const cancelled = new Promise((_resolve, reject) => {
    abort = () => reject(contract("stream_aborted", "Stream was aborted"));
    signal.addEventListener("abort", abort, { once: true });
  });
  try { return await Promise.race([reader.read(), deadline, cancelled]); }
  finally { clearTimeout(timer); signal.removeEventListener("abort", abort); }
}

function contract(code, message, status) { return new SseContractError(code, message, { status }); }
function validateProfile(profile) {
  if (!profile || !Object.isFrozen(profile) || profile.version !== 1 || createProfileKey(profile) !== profile.key) throw new TypeError("trusted profile is required");
}
