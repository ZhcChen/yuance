import assert from "node:assert/strict";
import test from "node:test";

import { createCredentialCoordinator } from "../src/auth/credential-coordinator.mjs";
import { createDeviceAuthClient } from "../src/auth/device-auth-client.mjs";
import { createDesktopProfile } from "../src/auth/profile.mjs";

const profile = createDesktopProfile({
  endpoint: "https://yuance.example",
  serverInstanceId: "server-integration",
  mode: "production",
});

test("client and coordinator integration authorizes, refreshes, and logs out", async () => {
  let now = Date.UTC(2026, 7, 1);
  let exchangeAttempts = 0;
  const requests = [];
  const client = createDeviceAuthClient({
    profile,
    now: () => now,
    sleep: async () => {},
    fetchImpl: async (url, options) => {
      const path = new URL(url).pathname;
      const body = options.body ? JSON.parse(options.body) : undefined;
      requests.push({ path, body, authorization: options.headers.Authorization });
      if (path === "/api/v1/device-authorizations") {
        return json({ data: {
          device_code: "yuance_dc_integration-device-code",
          user_code: "ABCD-EFGH",
          verification_path: "/web/device-authorization",
          expires_in: 600,
          interval: 2,
          server_instance_id: profile.serverInstanceId,
        } }, 201);
      }
      if (path === "/api/v1/device-authorizations/exchange") {
        exchangeAttempts += 1;
        if (exchangeAttempts === 1) {
          return json({ error: { code: "authorization_pending", message: "pending", retry_after: 2 } }, 400);
        }
        return json({ data: credentials(0) });
      }
      if (path === "/api/v1/device-session") {
        return json({ data: {
          user_id: 7,
          username: "integration-user",
          display_name: "Integration User",
          device_id: "device-1",
          family_id: "family-1",
          generation: 0,
          authorization_version: 1,
          access_expires_at: new Date(now + 1_000).toISOString(),
          server_instance_id: profile.serverInstanceId,
        } });
      }
      if (path === "/api/v1/device-sessions/refresh") {
        return json({ data: credentials(1) });
      }
      if (path === "/api/v1/device-session/logout") {
        return json({ data: { revoked: true, family_id: "family-1" } });
      }
      throw new Error(`unexpected request: ${path}`);
    },
  });
  const credentialStore = memoryCredentialStore();
  const pendingAuthorizationStore = memoryValueStore();
  const pendingRevocations = new Set();
  const coordinator = createCredentialCoordinator({
    profile,
    credentialStore,
    pendingAuthorizationStore,
    pendingRevocationStore: {
      has: async (key) => pendingRevocations.has(key),
      mark: async (key) => { pendingRevocations.add(key); return { status: "saved" }; },
      clear: async (key) => { pendingRevocations.delete(key); return { status: "removed" }; },
    },
    client,
    now: () => now,
    randomUUID: () => "550e8400-e29b-41d4-a716-446655440000",
    createPkce: () => ({ verifier: "v".repeat(43), challenge: "c".repeat(43) }),
  });

  await coordinator.initialize();
  const opened = [];
  assert.equal((await coordinator.authorize({
    installationId: "installation-1",
    deviceName: "Integration Desktop",
    platform: "test",
    clientVersion: "0.1.0",
    openExternal: async (url) => opened.push(url),
  })).status, "authenticated");
  assert.equal(opened[0], "https://yuance.example/web/device-authorization?user_code=ABCD-EFGH");
  assert.equal(await coordinator.getAccessToken(), "yuance_dat_access-0");
  assert.equal("accessToken" in credentialStore.value, false);

  now += 2_000;
  assert.equal(await coordinator.getAccessToken(), "yuance_dat_access-1");
  assert.equal(credentialStore.value.generation, 1);
  assert.equal(credentialStore.value.pendingRotation, null);

  assert.equal((await coordinator.logout()).status, "unauthenticated");
  assert.equal(credentialStore.value, null);
  assert.equal(pendingRevocations.size, 0);
  assert.deepEqual(requests.map(({ path }) => path), [
    "/api/v1/device-authorizations",
    "/api/v1/device-authorizations/exchange",
    "/api/v1/device-authorizations/exchange",
    "/api/v1/device-session",
    "/api/v1/device-sessions/refresh",
    "/api/v1/device-session/logout",
  ]);
});

function credentials(generation) {
  const metadata = (audience) => ({
    token_type: "Bearer",
    issuer: "yuance-device-session",
    audience,
    device_id: "device-1",
    family_id: "family-1",
    generation,
    authorization_version: 1,
  });
  return {
    access_token: `yuance_dat_access-${generation}`,
    refresh_token: `yuance_drt_refresh-${generation}`,
    access_expires_in: 1,
    refresh_expires_in: 3600,
    access: metadata("yuance-api"),
    refresh: metadata("yuance-device-refresh"),
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "private, no-store" },
  });
}

function memoryCredentialStore() {
  return {
    value: null,
    async load() {
      return this.value ? { status: "available", credential: structuredClone(this.value) } : { status: "empty" };
    },
    async save(value) {
      this.value = structuredClone(value);
      return { status: "saved" };
    },
    async remove() {
      this.value = null;
      return { status: "removed" };
    },
  };
}

function memoryValueStore() {
  return {
    value: null,
    async load() {
      return this.value ? { status: "available", authorization: structuredClone(this.value) } : { status: "empty" };
    },
    async save(value) {
      this.value = structuredClone(value);
      return { status: "saved" };
    },
    async remove() {
      this.value = null;
      return { status: "removed" };
    },
  };
}
