import assert from "node:assert/strict";
import test from "node:test";

import { ResponseContractError, parseJsonResponse } from "../src/network/response-contract.mjs";

test("parses a bounded same-URL JSON data envelope", async () => {
  const response = jsonResponse({ data: { ok: true } }, { url: "https://yuance.example/api/v1/device-session" });
  assert.deepEqual(await parseJsonResponse(response, {
    expectedUrl: "https://yuance.example/api/v1/device-session",
  }), { ok: true });
});

test("rejects redirects, URL drift, content type, oversized JSON, and malformed envelopes", async () => {
  const cases = [
    jsonResponse({ data: {} }, { status: 302 }),
    jsonResponse({ data: {} }, { url: "https://evil.example/api/v1/device-session" }),
    new Response("<html>", { headers: { "content-type": "text/html" } }),
    jsonResponse({ data: { value: "x".repeat(100) } }),
    jsonResponse({ result: {} }),
  ];
  for (const response of cases) {
    await assert.rejects(parseJsonResponse(response, {
      expectedUrl: "https://yuance.example/api/v1/device-session",
      maxResponseBytes: 64,
    }), ResponseContractError);
  }
});

test("returns a sanitized coded error envelope", async () => {
  await assert.rejects(
    parseJsonResponse(jsonResponse({ error: { code: "device_access_expired", message: "secret" } }, { status: 401 }), {
      expectedUrl: "https://yuance.example/api/v1/device-session",
    }),
    (error) => error.code === "device_access_expired" && !error.message.includes("secret"),
  );
});

test("rejects malformed error envelopes before retry decisions", async () => {
  for (const body of [
    { error: { code: "device_access_expired", message: "expired" }, extra: true },
    { error: { code: "device_access_expired", message: "expired", token: "secret" } },
  ]) {
    await assert.rejects(parseJsonResponse(jsonResponse(body, { status: 401 }), {
      expectedUrl: "https://yuance.example/api/v1/device-session",
    }), (error) => error.code === "invalid_error_response");
  }
});

test("sanitizes response stream read failures", async () => {
  const response = new Response(new ReadableStream({
    pull(controller) { controller.error(new Error("yuance_dat_secret https://internal.example")); },
  }), { headers: { "content-type": "application/json" } });
  Object.defineProperty(response, "url", { value: "https://yuance.example/api/v1/device-session" });
  await assert.rejects(parseJsonResponse(response, {
    expectedUrl: "https://yuance.example/api/v1/device-session",
  }), (error) => {
    assert.equal(error.code, "response_read_failed");
    assert.doesNotMatch(`${error.message}\n${error.stack}`, /yuance_dat_secret|internal\.example/);
    return true;
  });
});

function jsonResponse(body, { status = 200, url = "https://yuance.example/api/v1/device-session" } = {}) {
  const response = new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  Object.defineProperty(response, "url", { value: url });
  return response;
}
