import assert from "node:assert/strict";
import test from "node:test";

import { createRestTransport } from "../src/network/rest-transport.mjs";
import { createDesktopProfile } from "../src/auth/profile.mjs";
import { createTrustedNetworkSession } from "../src/network/network-session.mjs";

const profile = createDesktopProfile({ endpoint: "https://yuance.example", serverInstanceId: "server-1" });
const probe = {
  user_id: 7, username: "alice", display_name: "Alice", device_id: "device-1", family_id: "family-1",
  generation: 0, authorization_version: 1, access_expires_at: "2026-08-02T12:00:00Z", server_instance_id: "server-1",
};

test("uses only a runtime lease and fixed no-ambient request fields", async () => {
  const calls = [];
  const transport = createRestTransport({
    profile,
    credentialRuntime: runtimeFixture(),
    fetchImpl: await trustedFetch(async (url, options) => { calls.push({ url, options }); return jsonResponse({ data: probe }); }),
  });
  assert.equal((await transport.execute("session.probe", {})).username, "alice");
  assert.equal(calls[0].url, "https://yuance.example/api/v1/device-session");
  assert.deepEqual(calls[0].options.headers, {
    Accept: "application/json", Authorization: "Bearer yuance_dat_lease-1", "Cache-Control": "no-store",
  });
  assert.equal(calls[0].options.credentials, "omit");
  assert.equal(calls[0].options.redirect, "manual");
  assert.equal(calls[0].options.cache, "no-store");
});

test("refreshes and retries an idempotent read once only for access expiry", async () => {
  const runtime = runtimeFixture();
  let calls = 0;
  const transport = createRestTransport({ profile, credentialRuntime: runtime, fetchImpl: await trustedFetch(async () => {
    calls += 1;
    return calls === 1
      ? jsonResponse({ error: { code: "device_access_expired", message: "expired" } }, { status: 401 })
      : jsonResponse({ data: probe });
  }) });
  assert.equal((await transport.execute("session.probe", {})).username, "alice");
  assert.equal(runtime.refreshCalls, 1);
  assert.equal(calls, 2);
});

test("does not retry revoked, replay, unknown, or stale-epoch failures", async () => {
  for (const code of ["device_revoked", "device_refresh_replay", "unknown_security_error"]) {
    const runtime = runtimeFixture();
    let calls = 0;
    const transport = createRestTransport({ profile, credentialRuntime: runtime, fetchImpl: await trustedFetch(async () => {
      calls += 1;
      return jsonResponse({ error: { code, message: "unsafe" } }, { status: 401 });
    }) });
    await assert.rejects(transport.execute("session.probe", {}));
    assert.equal(calls, 1);
    assert.equal(runtime.refreshCalls, 0);
  }
});

test("sanitizes fetch failures and rejects forged profiles before requesting", async () => {
  const transport = createRestTransport({
    profile,
    credentialRuntime: runtimeFixture(),
    fetchImpl: await trustedFetch(async () => { throw new Error("https://secret.example yuance_dat_leaked"); }),
  });
  await assert.rejects(transport.execute("session.probe", {}), (error) => {
    assert.equal(error.code, "network_error");
    assert.doesNotMatch(`${error.message}\n${error.stack}`, /secret\.example|yuance_dat_leaked/);
    return true;
  });
  const trusted = await trustedFetch(async () => {});
  assert.throws(() => createRestTransport({
    profile: Object.freeze({ ...profile, origin: "https://evil.example" }),
    credentialRuntime: runtimeFixture(),
    fetchImpl: trusted,
  }), /profile/i);
});

test("requires trusted session fetch and binds access expiry to HTTP 401", async () => {
  assert.throws(() => createRestTransport({
    profile, credentialRuntime: runtimeFixture(), fetchImpl: async () => jsonResponse({ data: probe }),
  }), /trusted Electron session fetch/);
  const runtime = runtimeFixture();
  const transport = createRestTransport({
    profile,
    credentialRuntime: runtime,
    fetchImpl: await trustedFetch(async () => jsonResponse({
      error: { code: "device_access_expired", message: "expired" },
    }, { status: 500 })),
  });
  await assert.rejects(transport.execute("session.probe", {}), (error) => error.code === "device_access_expired");
  assert.equal(runtime.refreshCalls, 0);
});

test("staggered old-epoch responses trigger one refresh and never publish late success", async () => {
  const runtime = runtimeFixture();
  const pending = [];
  let calls = 0;
  const transport = createRestTransport({
    profile,
    credentialRuntime: runtime,
    fetchImpl: await trustedFetch(async () => {
      calls += 1;
      if (calls === 3) return jsonResponse({ data: probe });
      return new Promise((resolve) => pending.push(resolve));
    }),
  });

  const first = transport.execute("session.probe", {});
  const second = transport.execute("session.probe", {});
  await waitUntil(() => pending.length === 2);
  pending[0](jsonResponse({ error: { code: "device_access_expired", message: "expired" } }, { status: 401 }));
  assert.equal((await first).username, "alice");
  pending[1](jsonResponse({ data: probe }));
  await assert.rejects(second, /stale network epoch/);
  assert.equal(runtime.refreshCalls, 1);
  assert.equal(calls, 3);
});

test("sends registry-built JSON mutations without retrying access expiry", async () => {
  const calls = [];
  const runtime = runtimeFixture();
  const registry = { resolve: () => Object.freeze({
    idempotent: false, method: "PATCH", path: "/api/v1/work-items/DEMO-1", body: '{"title":"Updated"}', contentType: "application/json", parse: (value) => value,
  }) };
  const transport = createRestTransport({ profile, credentialRuntime: runtime, registry, fetchImpl: await trustedFetch(async (url, options) => {
    calls.push({ url, options });
    return jsonResponse({ error: { code: "device_access_expired", message: "expired" } }, { status: 401, url: "https://yuance.example/api/v1/work-items/DEMO-1" });
  }) });
  await assert.rejects(transport.execute("workitem.update", {}), (error) => error.code === "device_access_expired");
  assert.equal(calls.length, 1);
  assert.equal(runtime.refreshCalls, 0);
  assert.equal(calls[0].options.body, '{"title":"Updated"}');
  assert.equal(calls[0].options.headers["Content-Type"], "application/json");
});

test("maps uncertain mutation transport outcomes without replay", async () => {
  const registry = { resolve: () => Object.freeze({ idempotent: false, method: "POST", path: "/api/v1/work-items/DEMO-1/comments", body: '{"body":"x"}', contentType: "application/json", parse: (value) => value }) };
  for (const delegate of [
    async () => { throw new Error("socket closed"); },
    async () => jsonResponse({ result: { unexpected: true } }, { url: "https://yuance.example/api/v1/work-items/DEMO-1/comments" }),
  ]) {
    let calls = 0;
    const transport = createRestTransport({ profile, credentialRuntime: runtimeFixture(), registry, fetchImpl: await trustedFetch(async (...args) => { calls += 1; return delegate(...args); }) });
    await assert.rejects(transport.execute("workitem.commentcreate", {}), (error) => error.code === "mutation_result_uncertain");
    assert.equal(calls, 1);
  }
});

test("preserves deterministic mutation authorization and not-found errors without replay", async () => {
  const registry = { resolve: () => Object.freeze({ idempotent: false, method: "PATCH", path: "/api/v1/work-items/DEMO-1", body: '{"title":"x"}', contentType: "application/json", parse: (value) => value }) };
  for (const [status, code] of [[403, "project_access_denied"], [404, "work_item_not_found"]]) {
    let calls = 0;
    const transport = createRestTransport({ profile, credentialRuntime: runtimeFixture(), registry, fetchImpl: await trustedFetch(async () => {
      calls += 1;
      return jsonResponse({ error: { code, message: "public failure" } }, { status, url: "https://yuance.example/api/v1/work-items/DEMO-1" });
    }) });
    await assert.rejects(transport.execute("workitem.update", {}), (error) => error.code === code && error.status === status);
    assert.equal(calls, 1);
  }
});

function runtimeFixture() {
  let epoch = 1;
  return {
    refreshCalls: 0,
    async withAccessLease(operation) {
      const leaseEpoch = epoch;
      const result = await operation(Object.freeze({ accessToken: `yuance_dat_lease-${leaseEpoch}`, epoch: leaseEpoch }));
      if (leaseEpoch !== epoch) throw new Error("stale network epoch");
      return result;
    },
    async refreshAccess(expectedEpoch) {
      if (expectedEpoch !== epoch) return false;
      this.refreshCalls += 1;
      this.refreshedEpoch = expectedEpoch;
      epoch += 1;
      return true;
    },
  };
}

async function waitUntil(predicate) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error("condition was not reached");
}

async function trustedFetch(delegate) {
  const network = await createTrustedNetworkSession({
    electronSession: { fromPartition: () => ({
      async clearStorageData() {}, async clearCache() {}, async clearAuthCache() {}, fetch: delegate,
    }) },
    mode: "production",
    allowedOrigin: profile.origin,
  });
  return network.fetch;
}

function jsonResponse(body, { status = 200, url = "https://yuance.example/api/v1/device-session" } = {}) {
  const response = new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  Object.defineProperty(response, "url", { value: url });
  return response;
}
