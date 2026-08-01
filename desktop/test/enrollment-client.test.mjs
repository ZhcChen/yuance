import assert from "node:assert/strict";
import test from "node:test";

import {
  DesktopEnrollmentError,
  enrollDesktop,
} from "../src/network/enrollment-client.mjs";

const origin = "https://yuance.example";
const enrollment = {
  schema_version: 1,
  api_protocol_version: 1,
  server_instance_id: "server-1",
  capabilities: ["device-authorization.v1", "device-session.probe.v1"],
};

test("reads the fixed enrollment path and creates a trusted profile", async () => {
  const calls = [];
  const result = await enrollDesktop({
    origin,
    mode: "production",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse(enrollment, { url });
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${origin}/.well-known/yuance-desktop`);
  assert.deepEqual(calls[0].options, {
    method: "GET",
    redirect: "manual",
    credentials: "omit",
    cache: "no-store",
    signal: calls[0].options.signal,
    headers: {
      Accept: "application/json",
      "Cache-Control": "no-store",
    },
  });
  assert.equal(result.profile.origin, origin);
  assert.equal(result.profile.serverInstanceId, "server-1");
  assert.deepEqual(result.capabilities, enrollment.capabilities);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.capabilities), true);
});

test("rejects redirect, URL drift, content type, size, identity drift, and timeout", async () => {
  const cases = [
    {
      code: "redirect_not_allowed",
      response: () => new Response("", { status: 302, headers: { location: "/elsewhere" } }),
    },
    {
      code: "response_url_mismatch",
      response: () => jsonResponse(enrollment, { url: "https://other.example/.well-known/yuance-desktop" }),
    },
    {
      code: "invalid_content_type",
      response: () => responseWithUrl(
        new Response(JSON.stringify(enrollment), { headers: { "content-type": "text/html" } }),
        `${origin}/.well-known/yuance-desktop`,
      ),
    },
    {
      code: "response_too_large",
      maxResponseBytes: 8,
      response: () => jsonResponse(enrollment, { url: `${origin}/.well-known/yuance-desktop` }),
    },
    {
      code: "server_instance_mismatch",
      expectedServerInstanceId: "previous-server",
      response: () => jsonResponse(enrollment, { url: `${origin}/.well-known/yuance-desktop` }),
    },
  ];

  for (const scenario of cases) {
    await assert.rejects(
      enrollDesktop({
        origin,
        mode: "production",
        maxResponseBytes: scenario.maxResponseBytes,
        expectedServerInstanceId: scenario.expectedServerInstanceId,
        fetchImpl: async () => scenario.response(),
      }),
      (error) => error instanceof DesktopEnrollmentError && error.code === scenario.code,
      scenario.code,
    );
  }

  await assert.rejects(
    enrollDesktop({
      origin,
      mode: "production",
      timeoutMs: 5,
      fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
    }),
    (error) => error instanceof DesktopEnrollmentError && error.code === "request_timeout",
  );

  try {
    await enrollDesktop({
      origin,
      mode: "production",
      fetchImpl: async () => {
        throw new Error(`request failed for ${origin}/?credential=secret`);
      },
    });
    assert.fail("network failure should reject");
  } catch (error) {
    assert.equal(error.cause, undefined);
    assert.equal(`${error.message}\n${error.stack}\n${JSON.stringify(error)}`.includes(origin), false);
    assert.equal(`${error.message}\n${error.stack}\n${JSON.stringify(error)}`.includes("secret"), false);
  }

  await assert.rejects(
    enrollDesktop({
      origin,
      mode: "production",
      timeoutMs: 5,
      fetchImpl: async () => responseWithUrl(
        new Response(new ReadableStream({ start() {} }), {
          headers: { "content-type": "application/json" },
        }),
        `${origin}/.well-known/yuance-desktop`,
      ),
    }),
    (error) => error instanceof DesktopEnrollmentError && error.code === "request_timeout",
  );
});

test("rejects unknown fields, invalid versions, capabilities, and server identity", async () => {
  const invalidPayloads = [
    { ...enrollment, endpoint: "https://attacker.example" },
    { ...enrollment, schema_version: 2 },
    { ...enrollment, api_protocol_version: "1" },
    { ...enrollment, server_instance_id: " server-1" },
    { ...enrollment, server_instance_id: "server\n1" },
    { ...enrollment, capabilities: ["device-session.probe.v1", "device-authorization.v1"] },
    { ...enrollment, capabilities: [...enrollment.capabilities, "unknown.v1"] },
    { ...enrollment, capabilities: ["device-authorization.v1"] },
  ];

  for (const payload of invalidPayloads) {
    await assert.rejects(
      enrollDesktop({
        origin,
        mode: "production",
        fetchImpl: async () => jsonResponse(payload, {
          url: `${origin}/.well-known/yuance-desktop`,
        }),
      }),
      DesktopEnrollmentError,
    );
  }
});

test("requires an injected fetch implementation", async () => {
  await assert.rejects(
    enrollDesktop({ origin, mode: "production" }),
    /fetchImpl is required/,
  );
});

function jsonResponse(body, { url, status = 200, headers = {} } = {}) {
  const response = new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
  return url ? responseWithUrl(response, url) : response;
}

function responseWithUrl(response, url) {
  Object.defineProperty(response, "url", { value: url });
  return response;
}
