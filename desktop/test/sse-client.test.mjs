import assert from "node:assert/strict";
import test from "node:test";

import { createDesktopProfile } from "../src/auth/profile.mjs";
import { createTrustedNetworkSession } from "../src/network/network-session.mjs";
import { createSseClient } from "../src/network/sse-client.mjs";

const profile = createDesktopProfile({ endpoint: "https://yuance.example", serverInstanceId: "server-1" });

test("parses split UTF-8, CRLF, comments, multiline data and retry without exposing raw events", async () => {
  const controls = []; const retries = [];
  const bytes = new TextEncoder().encode(": 心跳\r\nretry: 2500\r\nevent: connected\r\ndata: {\"schema_version\":\r\ndata: 1}\r\n\r\n");
  const client = createSseClient({ profile, fetchImpl: await trustedFetch(() => sseResponse(chunks(bytes, [2, 5, 9, 13]))) });
  const result = await client.subscribe({ accessToken: "yuance_dat_valid", signal: new AbortController().signal, onControl: (value) => controls.push(value), onRetry: (value) => retries.push(value) });
  assert.deepEqual(controls, [{ type: "connected" }]);
  assert.deepEqual(retries, [2500]);
  assert.deepEqual(result, { reason: "eof", retryHint: 2500 });
});

test("uses fixed request fields and rejects redirect, final URL, status and content type", async () => {
  let request;
  const client = createSseClient({ profile, fetchImpl: await trustedFetch((url, options) => { request = { url, options }; return sseResponse([]); }) });
  await client.subscribe({ accessToken: "yuance_dat_secret", signal: new AbortController().signal });
  assert.equal(request.url, "https://yuance.example/api/v1/device-session/events");
  assert.equal(request.options.redirect, "manual"); assert.equal(request.options.credentials, "omit");
  assert.deepEqual(request.options.headers, { Accept: "text/event-stream", Authorization: "Bearer yuance_dat_secret", "Cache-Control": "no-store" });
  for (const [response, code] of [[sseResponse([], { status: 302 }), "redirect_not_allowed"], [sseResponse([], { url: "https://evil.example/events" }), "response_url_mismatch"], [sseResponse([], { status: 500 }), "unexpected_status"], [sseResponse([], { contentType: "application/json" }), "invalid_content_type"]]) {
    const failing = createSseClient({ profile, fetchImpl: await trustedFetch(() => response) });
    await assert.rejects(failing.subscribe({ accessToken: "yuance_dat_valid", signal: new AbortController().signal }), (error) => error.code === code);
  }
});

test("enforces normalized header, parser buffer, event and rate limits", async () => {
  const cases = [
    [{ maxHeaderBytes: 8 }, sseResponse([], { headers: { "x-long": "0123456789" } }), "headers_too_large"],
    [{ maxBufferBytes: 16 }, sseResponse([new TextEncoder().encode(`data: ${"心".repeat(10)}`)]), "buffer_too_large"],
    [{ maxEventBytes: 8 }, sseResponse([new TextEncoder().encode("data: 0123456789\n\n")]), "event_too_large"],
    [{ maxEventsPerWindow: 1 }, sseResponse([new TextEncoder().encode("data: a\n\ndata: b\n\n")]), "event_rate_exceeded"],
  ];
  for (const [limits, response, code] of cases) {
    const client = createSseClient({ profile, ...limits, fetchImpl: await trustedFetch(() => response) });
    await assert.rejects(client.subscribe({ accessToken: "yuance_dat_valid", signal: new AbortController().signal }), (error) => error.code === code);
  }
});

test("fails closed for invalid UTF-8", async () => {
  await rejectsStream(sseResponse([Uint8Array.of(0xc3, 0x28)]), {}, "invalid_utf8");
});
test("fails closed for malformed connected events", async () => {
  await rejectsStream(sseResponse([new TextEncoder().encode("event: connected\ndata: {}\n\n")]), {}, "invalid_control_event");
});
test("fails closed when the stream becomes idle", async () => {
  await rejectsStream(sseResponse(new ReadableStream({ start() {} })), { idleMs: 10 }, "idle_timeout");
});
test("cancellation aborts a pending read", async () => {
  const controller = new AbortController();
  const client = createSseClient({ profile, fetchImpl: await trustedFetch(() => sseResponse(new ReadableStream({ start() {} }))) });
  const pending = client.subscribe({ accessToken: "yuance_dat_valid", signal: controller.signal }); controller.abort();
  await assert.rejects(pending, (error) => error.code === "stream_aborted");
});

async function rejectsStream(response, options, code) {
  const client = createSseClient({ profile, ...options, fetchImpl: await trustedFetch(() => response) });
  await assert.rejects(client.subscribe({ accessToken: "yuance_dat_valid", signal: new AbortController().signal }), (error) => error.code === code);
}

async function trustedFetch(delegate) {
  return (await createTrustedNetworkSession({ electronSession: { fromPartition: () => ({ async clearStorageData() {}, async clearCache() {}, async clearAuthCache() {}, fetch: delegate }) }, mode: "production", allowedOrigin: profile.origin })).fetch;
}
function sseResponse(source, { status = 200, url = `${profile.origin}/api/v1/device-session/events`, contentType = "text/event-stream", headers = {} } = {}) {
  const body = source instanceof ReadableStream ? source : new ReadableStream({ start(controller) { for (const chunk of source) controller.enqueue(chunk); controller.close(); } });
  const response = new Response(body, { status, headers: { "content-type": contentType, ...headers } });
  Object.defineProperty(response, "url", { value: url }); return response;
}
function chunks(bytes, offsets) { let start = 0; const values = []; for (const end of offsets) { values.push(bytes.slice(start, end)); start = end; } values.push(bytes.slice(start)); return values; }
