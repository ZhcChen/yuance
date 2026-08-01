import assert from "node:assert/strict";
import test from "node:test";

import {
  DeviceAuthProtocolError,
  createDeviceAuthClient,
} from "../src/auth/device-auth-client.mjs";
import { createDesktopProfile } from "../src/auth/profile.mjs";

const profile = createDesktopProfile({
  endpoint: "https://yuance.example",
  serverInstanceId: "server-1",
  mode: "production",
});

function jsonResponse(body, options = {}) {
  return new Response(JSON.stringify(body), {
    status: options.status ?? 200,
    headers: { "content-type": "application/json", ...(options.headers ?? {}) },
  });
}

function credentialData(overrides = {}) {
  return {
    access_token: "yuance_dat_access",
    refresh_token: "yuance_drt_refresh",
    access_expires_in: 300,
    refresh_expires_in: 3600,
    access: {
      token_type: "Bearer",
      issuer: "yuance-device-session",
      audience: "yuance-api",
      device_id: "device-1",
      family_id: "family-1",
      generation: 1,
      authorization_version: 2,
    },
    refresh: {
      token_type: "Bearer",
      issuer: "yuance-device-session",
      audience: "yuance-device-refresh",
      device_id: "device-1",
      family_id: "family-1",
      generation: 1,
      authorization_version: 2,
    },
    ...overrides,
  };
}

test("rejects forged or downgraded profile objects", () => {
  assert.throws(
    () => createDeviceAuthClient({
      profile: Object.freeze({
        version: 1,
        mode: "production",
        origin: "http://remote.example",
        serverInstanceId: "server-1",
        key: profile.key,
      }),
    }),
    /profile|HTTPS/i,
  );
});

test("requires an explicit trusted fetch implementation", () => {
  assert.throws(() => createDeviceAuthClient({ profile }), /fetchImpl is required/);
});

test("network errors do not retain endpoint or credential details", async () => {
  const client = createDeviceAuthClient({
    profile,
    fetchImpl: async () => {
      throw new Error("https://yuance.example/?access_token=yuance_dat_secret");
    },
  });
  try {
    await client.probe("yuance_dat_secret");
    assert.fail("probe should reject");
  } catch (error) {
    const publicError = `${error.message}\n${error.stack}\n${JSON.stringify(error)}`;
    assert.equal(error.cause, undefined);
    assert.equal(publicError.includes("yuance.example"), false);
    assert.equal(publicError.includes("yuance_dat_secret"), false);
  }
});

test("server-controlled error messages do not enter public errors", async () => {
  const client = createDeviceAuthClient({
    profile,
    fetchImpl: async () => jsonResponse({
      error: {
        code: "temporarily_unavailable",
        message: "yuance_dat_secret https://internal.example Cookie=session",
      },
    }, { status: 503 }),
  });
  await assert.rejects(client.probe("yuance_dat_test"), (error) => {
    const publicError = `${error.message}\n${error.stack}\n${JSON.stringify(error)}`;
    assert.equal(error.message, "Device auth request failed");
    assert.doesNotMatch(publicError, /yuance_dat_secret|internal\.example|Cookie=session/);
    return true;
  });
});

test("uses fixed trusted paths, manual redirects, no-store, and no ambient credentials", async () => {
  const calls = [];
  const client = createDeviceAuthClient({
    profile,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ data: {
        device_code: "device-code",
        user_code: "ABCD-EFGH",
        verification_path: "/web/device-authorization",
        expires_in: 600,
        interval: 5,
        server_instance_id: "server-1",
      } }, { status: 201 });
    },
  });

  const started = await client.startAuthorization({
    codeChallenge: "challenge",
    installationId: "installation-1",
    deviceName: "Desktop",
    platform: "darwin",
    clientVersion: "0.1.0",
  });

  assert.equal(started.verificationUrl, "https://yuance.example/web/device-authorization?user_code=ABCD-EFGH");
  assert.equal(calls[0].url, "https://yuance.example/api/v1/device-authorizations");
  assert.equal(calls[0].options.redirect, "manual");
  assert.equal(calls[0].options.credentials, "omit");
  assert.equal(calls[0].options.cache, "no-store");
  assert.equal(calls[0].options.headers.Cookie, undefined);
  assert.equal(calls[0].options.headers.Authorization, undefined);
});

test("rejects redirects, wrong content type, oversized bodies, and wrong server identity", async () => {
  const cases = [
    () => new Response("", { status: 302, headers: { location: "/same-origin" } }),
    () => new Response("{}", { headers: { "content-type": "text/html" } }),
    () => new Response("x".repeat(129), { headers: { "content-type": "application/json" } }),
    () => jsonResponse({ data: {
      device_code: "device-code", user_code: "CODE", verification_path: "/web/device-authorization",
      expires_in: 60, interval: 5, server_instance_id: "other-server",
    } }),
  ];
  for (const [index, response] of cases.entries()) {
    const client = createDeviceAuthClient({
      profile,
      maxResponseBytes: 128,
      fetchImpl: async () => response(),
    });
    await assert.rejects(
      client.startAuthorization({
        codeChallenge: "challenge", installationId: "install", deviceName: "Desktop",
        platform: "darwin", clientVersion: "0.1.0",
      }),
      DeviceAuthProtocolError,
      `case ${index}`,
    );
  }
});

test("times out requests and never follows same-origin or cross-origin redirects", async () => {
  const client = createDeviceAuthClient({
    profile,
    timeoutMs: 5,
    fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }),
  });
  await assert.rejects(
    client.probe("yuance_dat_access"),
    (error) => error instanceof DeviceAuthProtocolError && error.code === "request_timeout",
  );
});

test("timeout also aborts a response body that stalls after headers", async () => {
  const client = createDeviceAuthClient({
    profile,
    timeoutMs: 5,
    fetchImpl: async () => new Response(new ReadableStream({ start() {} }), {
      headers: { "content-type": "application/json" },
    }),
  });
  await assert.rejects(
    client.probe("yuance_dat_access"),
    (error) => error instanceof DeviceAuthProtocolError && error.code === "request_timeout",
  );
});

test("polling respects initial interval and the greater Retry-After hint", async () => {
  const waits = [];
  let attempts = 0;
  const client = createDeviceAuthClient({
    profile,
    sleep: async (milliseconds) => waits.push(milliseconds),
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) {
        return jsonResponse({ error: { code: "authorization_pending", message: "pending", retry_after: 7 } }, {
          status: 400,
          headers: { "retry-after": "9" },
        });
      }
      return jsonResponse({ data: credentialData({
        access: { ...credentialData().access, generation: 0 },
        refresh: { ...credentialData().refresh, generation: 0 },
      }) });
    },
  });

  const result = await client.pollAuthorization({
    deviceCode: "device-code",
    codeVerifier: "verifier",
    exchangeTransactionId: "550e8400-e29b-41d4-a716-446655440000",
    intervalSeconds: 5,
    expiresAt: Date.now() + 60_000,
  });
  assert.equal(result.generation, 0);
  assert.deepEqual(waits, [5_000, 9_000]);
});

test("validates credential metadata and refuses PAT/Cookie token shapes", async () => {
  for (const mutation of [
    { access_token: "yuance_pat_bad" },
    { refresh_token: "session-cookie" },
    { access: { ...credentialData().access, audience: "yuance-device-refresh" } },
    { refresh: { ...credentialData().refresh, device_id: "other-device" } },
  ]) {
    const client = createDeviceAuthClient({
      profile,
      fetchImpl: async () => jsonResponse({ data: credentialData(mutation) }),
    });
    await assert.rejects(
      client.refresh({
        refreshToken: "yuance_drt_old", generation: 0,
        transactionId: "550e8400-e29b-41d4-a716-446655440000", deviceId: "device-1",
      }),
      DeviceAuthProtocolError,
    );
  }
});

test("initial exchange rejects a non-zero credential generation", async () => {
  const client = createDeviceAuthClient({
    profile,
    fetchImpl: async () => jsonResponse({ data: credentialData() }),
  });

  await assert.rejects(
    client.exchangeAuthorization({
      deviceCode: "yuance_dc_device-code-value-with-enough-entropy",
      codeVerifier: "v".repeat(43),
      exchangeTransactionId: "550e8400-e29b-41d4-a716-446655440000",
    }),
    (error) => error instanceof DeviceAuthProtocolError && error.code === "invalid_initial_generation",
  );
});

test("sends device access only to probe/logout and validates the response URL", async () => {
  const calls = [];
  const client = createDeviceAuthClient({
    profile,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ data: { revoked: true, family_id: "family-1" } });
    },
  });
  await client.logout("yuance_dat_access");
  assert.equal(calls[0].url, "https://yuance.example/api/v1/device-session/logout");
  assert.equal(calls[0].options.headers.Authorization, "Bearer yuance_dat_access");
  assert.equal(calls[0].options.credentials, "omit");
});
