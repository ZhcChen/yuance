import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createCredentialCoordinator,
  createPendingAuthorizationStore,
} from "../src/auth/credential-coordinator.mjs";

const profile = Object.freeze({
  origin: "https://yuance.example",
  serverInstanceId: "server-1",
  key: `yuance-desktop-profile-v1:${"a".repeat(64)}`,
});
const storedCredential = {
  userId: "user-1",
  deviceId: "device-1",
  familyId: "family-1",
  generation: 0,
  authorizationVersion: 1,
  refreshToken: "yuance_drt_refresh-0",
  accessExpiresAt: "2026-08-01T00:05:00.000Z",
  refreshExpiresAt: "2026-08-01T01:00:00.000Z",
  pendingRotation: null,
  lastConfirmedServerGeneration: 0,
};

function exchanged(generation = 0) {
  return {
    accessToken: `yuance_dat_access-${generation}`,
    refreshToken: `yuance_drt_refresh-${generation}`,
    accessExpiresAt: new Date(Date.UTC(2026, 7, 1, 0, 5 + generation)).toISOString(),
    refreshExpiresAt: new Date(Date.UTC(2026, 7, 1, 1 + generation)).toISOString(),
    userId: "user-1",
    deviceId: "device-1",
    familyId: "family-1",
    generation,
    authorizationVersion: 1,
  };
}

function memoryStore(initial = { status: "empty" }) {
  let loaded = structuredClone(initial);
  const saves = [];
  return {
    saves,
    load: async () => structuredClone(loaded),
    save: async (credential) => {
      saves.push(structuredClone(credential));
      loaded = { status: "available", credential: structuredClone(credential) };
      return { status: "saved" };
    },
    remove: async () => {
      loaded = { status: "empty" };
      return { status: "removed" };
    },
  };
}

function fixture({ store = memoryStore(), client = {}, now = Date.UTC(2026, 7, 1) } = {}) {
  const revocations = new Set();
  let authorizationState = null;
  return {
    store,
    revocations,
    coordinator: createCredentialCoordinator({
      profile,
      credentialStore: store,
      pendingRevocationStore: {
        has: async () => revocations.has(profile.key),
        mark: async () => { revocations.add(profile.key); return { status: "saved" }; },
        clear: async () => { revocations.delete(profile.key); return { status: "removed" }; },
      },
      pendingAuthorizationStore: {
        load: async () => authorizationState ? { status: "available", authorization: structuredClone(authorizationState) } : { status: "empty" },
        save: async (value) => { authorizationState = structuredClone(value); return { status: "saved" }; },
        remove: async () => { authorizationState = null; return { status: "removed" }; },
      },
      client,
      now: () => now,
      randomUUID: () => "550e8400-e29b-41d4-a716-446655440000",
      createPkce: () => ({ verifier: "verifier", challenge: "challenge" }),
    }),
  };
}

test("exposes every required state and starts unauthenticated", async () => {
  const { coordinator } = fixture();
  assert.deepEqual(coordinator.states, [
    "unauthenticated", "authorizing", "authenticated", "refreshing", "locked", "revoked", "error",
  ]);
  assert.equal(coordinator.snapshot().status, "unauthenticated");
  await coordinator.initialize();
  assert.equal(coordinator.snapshot().status, "unauthenticated");
  assert.equal("accessToken" in coordinator.snapshot(), false);
  assert.equal("refreshToken" in coordinator.snapshot(), false);
});

test("lock cancels initialization before pending rotation recovery can start", async () => {
  let releaseLoad;
  let refreshCalls = 0;
  const store = memoryStore();
  store.load = () => new Promise((resolve) => {
    releaseLoad = () => resolve({
      status: "available",
      credential: { ...storedCredential, pendingRotation: { sourceGeneration: 0, transactionId: "pending" } },
    });
  });
  const { coordinator } = fixture({
    store,
    client: { refresh: async () => { refreshCalls += 1; return exchanged(1); } },
  });

  const initializing = coordinator.initialize();
  await Promise.resolve();
  await coordinator.lock("runtime_disposed");
  releaseLoad();
  await assert.rejects(initializing, (error) => error.code === "stale_operation");
  assert.equal(refreshCalls, 0);
  assert.equal(coordinator.snapshot().status, "locked");
});

test("state subscriptions are immediate, ordered, and removable", async () => {
  const { coordinator } = fixture();
  const states = [];
  const unsubscribe = coordinator.subscribe((snapshot) => states.push(snapshot.status));
  await coordinator.initialize();
  coordinator.lock("manual_lock");
  unsubscribe();
  await coordinator.discardLocalSession();
  assert.deepEqual(states, ["unauthenticated", "unauthenticated", "locked"]);
});

test("authorization persists credentials without access token and restart recovers authenticated", async () => {
  const store = memoryStore();
  const client = {
    startAuthorization: async () => ({
      deviceCode: "code", userCode: "ABCD-EFGH", intervalSeconds: 5,
      expiresAt: Date.UTC(2026, 7, 1, 0, 10), verificationUrl: "https://yuance.example/web/device-authorization?user_code=ABCD-EFGH",
    }),
    pollAuthorization: async () => exchanged(0),
  };
  const { coordinator } = fixture({ store, client });
  const authorization = await coordinator.authorize({
    installationId: "install", deviceName: "Desktop", platform: "darwin", clientVersion: "0.1.0",
    openExternal: async () => {},
  });
  assert.equal(authorization.status, "authenticated");
  assert.equal(store.saves.some((value) => "accessToken" in value), false);
  assert.equal(coordinator.snapshot().status, "authenticated");

  const restarted = fixture({ store, client }).coordinator;
  await restarted.initialize();
  assert.equal(restarted.snapshot().status, "authenticated");
  assert.equal(restarted.snapshot().hasAccessToken, false);
});

test("persists exchange transaction before start and resumes the same ID after a crash", async () => {
  const store = memoryStore();
  let pending = null;
  const pendingAuthorizationStore = {
    load: async () => pending ? { status: "available", authorization: structuredClone(pending) } : { status: "empty" },
    save: async (value) => { pending = structuredClone(value); return { status: "saved" }; },
    remove: async () => { pending = null; return { status: "removed" }; },
  };
  let rejectFirstPoll;
  const firstPoll = new Promise((_resolve, reject) => { rejectFirstPoll = reject; });
  const started = {
    deviceCode: "device-code", userCode: "ABCD-EFGH", intervalSeconds: 5,
    expiresAt: Date.UTC(2026, 7, 1, 0, 10), verificationUrl: "https://yuance.example/web/device-authorization?user_code=ABCD-EFGH",
  };
  const first = createCredentialCoordinator({
    profile, credentialStore: store, pendingAuthorizationStore,
    pendingRevocationStore: { has: async () => false, mark: async () => ({ status: "saved" }), clear: async () => ({ status: "removed" }) },
    client: { startAuthorization: async () => started, pollAuthorization: async () => firstPoll },
    now: () => Date.UTC(2026, 7, 1),
    randomUUID: () => "550e8400-e29b-41d4-a716-446655440000",
    createPkce: () => ({ verifier: "verifier", challenge: "challenge" }),
  });
  const interrupted = first.authorize({
    installationId: "install", deviceName: "Desktop", platform: "darwin", clientVersion: "0.1.0",
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(pending.exchangeTransactionId, "550e8400-e29b-41d4-a716-446655440000");
  assert.equal(pending.codeVerifier, "verifier");
  assert.equal(pending.deviceCode, "device-code");
  rejectFirstPoll(new Error("process terminated"));
  await assert.rejects(interrupted);

  const replayed = [];
  const restarted = createCredentialCoordinator({
    profile, credentialStore: store, pendingAuthorizationStore,
    pendingRevocationStore: { has: async () => false, mark: async () => ({ status: "saved" }), clear: async () => ({ status: "removed" }) },
    client: {
      pollAuthorization: async (input) => { replayed.push(input); return exchanged(0); },
      probe: async () => ({ ...exchanged(0), accessToken: undefined }),
    },
    now: () => Date.UTC(2026, 7, 1),
    randomUUID: () => "different-id-must-not-be-used",
  });
  await restarted.initialize();
  assert.equal(replayed[0].exchangeTransactionId, "550e8400-e29b-41d4-a716-446655440000");
  assert.equal(replayed[0].codeVerifier, "verifier");
  assert.equal(restarted.snapshot().status, "authenticated");
  assert.equal(pending, null);
});

test("refresh is single-flight and saves pending transaction before network", async () => {
  const store = memoryStore({ status: "available", credential: storedCredential });
  let refreshCalls = 0;
  let resolveRefresh;
  const refreshResult = new Promise((resolve) => { resolveRefresh = resolve; });
  const client = {
    refresh: async () => { refreshCalls += 1; return refreshResult; },
  };
  const { coordinator } = fixture({ store, client, now: Date.UTC(2026, 7, 1, 0, 6) });
  await coordinator.initialize();
  const first = coordinator.getAccessToken();
  const second = coordinator.getAccessToken();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(refreshCalls, 1);
  assert.deepEqual(store.saves[0].pendingRotation, {
    sourceGeneration: 0,
    transactionId: "550e8400-e29b-41d4-a716-446655440000",
  });
  resolveRefresh(exchanged(1));
  assert.equal(await first, "yuance_dat_access-1");
  assert.equal(await second, "yuance_dat_access-1");
  assert.equal(store.saves.at(-1).pendingRotation, null);
  assert.equal(store.saves.at(-1).generation, 1);
});

test("startup replays a pending rotation with the same transaction ID", async () => {
  const pending = {
    ...storedCredential,
    pendingRotation: { sourceGeneration: 0, transactionId: "550e8400-e29b-41d4-a716-446655440000" },
  };
  const store = memoryStore({ status: "available", credential: pending });
  const requests = [];
  const { coordinator } = fixture({
    store,
    client: { refresh: async (input) => { requests.push(input); return exchanged(1); } },
  });
  await coordinator.initialize();
  assert.equal(requests[0].transactionId, pending.pendingRotation.transactionId);
  assert.equal(requests[0].generation, 0);
  assert.equal(coordinator.snapshot().status, "authenticated");
});

test("startup removes stale pending authorization after credential commit", async () => {
  const store = memoryStore({ status: "available", credential: storedCredential });
  let removes = 0;
  const coordinator = createCredentialCoordinator({
    profile, credentialStore: store,
    pendingAuthorizationStore: {
      load: async () => ({ status: "available", authorization: {} }),
      save: async () => ({ status: "saved" }),
      remove: async () => { removes += 1; return { status: "removed" }; },
    },
    pendingRevocationStore: { has: async () => false, mark: async () => ({ status: "saved" }), clear: async () => ({ status: "removed" }) },
    client: {},
  });
  await coordinator.initialize();
  assert.equal(removes, 1);
  assert.equal(coordinator.snapshot().status, "authenticated");
});

test("late generation or transaction responses cannot overwrite current state", async () => {
  const store = memoryStore({ status: "available", credential: storedCredential });
  let resolveRefresh;
  const { coordinator } = fixture({
    store,
    now: Date.UTC(2026, 7, 1, 0, 6),
    client: { refresh: async () => new Promise((resolve) => { resolveRefresh = resolve; }) },
  });
  await coordinator.initialize();
  const pending = coordinator.getAccessToken();
  await new Promise((resolve) => setImmediate(resolve));
  await coordinator.lock("superseded");
  resolveRefresh(exchanged(1));
  await assert.rejects(pending, /stale/i);
  assert.equal(coordinator.snapshot().status, "locked");
  assert.equal(store.saves.at(-1).generation, 0);
});

test("write failure after successful rotation locks instead of using uncommitted access", async () => {
  let saves = 0;
  const store = memoryStore({ status: "available", credential: storedCredential });
  const originalSave = store.save;
  store.save = async (value) => {
    saves += 1;
    if (saves === 2) return { status: "locked", reason: "write_failed" };
    return originalSave(value);
  };
  const { coordinator } = fixture({
    store,
    now: Date.UTC(2026, 7, 1, 0, 6),
    client: { refresh: async () => exchanged(1) },
  });
  await coordinator.initialize();
  await assert.rejects(coordinator.getAccessToken(), /persist/i);
  assert.equal(coordinator.snapshot().status, "locked");
  assert.equal(coordinator.snapshot().hasAccessToken, false);
});

test("security refresh errors become revoked while transient failures become locked", async () => {
  for (const [code, expected] of [["device_session_revoked", "revoked"], ["request_timeout", "locked"]]) {
    const store = memoryStore({ status: "available", credential: storedCredential });
    const error = Object.assign(new Error(code), { code });
    const { coordinator } = fixture({
      store,
      client: { refresh: async () => { throw error; } },
    });
    await coordinator.initialize();
    await assert.rejects(coordinator.refresh());
    assert.equal(coordinator.snapshot().status, expected);
  }
});

test("logout freezes immediately, clears memory, and records token-free pending revocation on failure", async () => {
  const store = memoryStore({ status: "available", credential: storedCredential });
  let rejectLogout;
  const logoutResult = new Promise((_resolve, reject) => { rejectLogout = reject; });
  const { coordinator, revocations } = fixture({
    store,
    client: {
      refresh: async () => exchanged(1),
      logout: async () => logoutResult,
    },
  });
  await coordinator.initialize();
  await coordinator.acceptAccess(exchanged(0));
  const logout = coordinator.logout();
  assert.equal(coordinator.snapshot().status, "locked");
  assert.equal(coordinator.snapshot().hasAccessToken, false);
  await assert.rejects(coordinator.getAccessToken(), /locked/);
  rejectLogout(new Error("offline"));
  await assert.rejects(logout, /offline/);
  assert.equal(revocations.has(profile.key), true);
  assert.equal(JSON.stringify([...revocations]).includes("yuance_drt_"), false);
});

test("successful logout revokes remotely then removes local record", async () => {
  const store = memoryStore({ status: "available", credential: storedCredential });
  const order = [];
  const originalRemove = store.remove;
  store.remove = async () => { order.push("remove"); return originalRemove(); };
  const { coordinator, revocations } = fixture({
    store,
    client: { logout: async () => { order.push("logout"); return { revoked: true, familyId: "family-1" }; } },
  });
  await coordinator.initialize();
  await coordinator.acceptAccess(exchanged(0));
  await coordinator.logout();
  assert.deepEqual(order, ["logout", "remove"]);
  assert.equal(revocations.size, 0);
  assert.equal(coordinator.snapshot().status, "unauthenticated");
});

test("marker persistence failure destroys local credentials instead of allowing revival", async () => {
  const store = memoryStore({ status: "available", credential: storedCredential });
  let removed = false;
  const originalRemove = store.remove;
  store.remove = async () => { removed = true; return originalRemove(); };
  const coordinator = createCredentialCoordinator({
    profile, credentialStore: store,
    pendingAuthorizationStore: { load: async () => ({ status: "empty" }), save: async () => ({ status: "saved" }), remove: async () => ({ status: "removed" }) },
    pendingRevocationStore: {
      has: async () => false,
      mark: async () => ({ status: "locked", reason: "disk_full" }),
      clear: async () => ({ status: "removed" }),
    },
    client: {},
  });
  await coordinator.initialize();
  await assert.rejects(coordinator.logout(), /revocation/i);
  assert.equal(removed, true);
  assert.deepEqual(await store.load(), { status: "empty" });
  assert.equal(coordinator.snapshot().status, "locked");
});

test("logout removal is ordered after an in-flight credential write", async () => {
  const store = memoryStore({ status: "available", credential: storedCredential });
  const originalSave = store.save;
  let releaseSave;
  const saveGate = new Promise((resolve) => { releaseSave = resolve; });
  store.save = async (value) => {
    await saveGate;
    return originalSave(value);
  };
  let resolveRefresh;
  const coordinator = createCredentialCoordinator({
    profile,
    credentialStore: store,
    pendingAuthorizationStore: { load: async () => ({ status: "empty" }), save: async () => ({ status: "saved" }), remove: async () => ({ status: "removed" }) },
    pendingRevocationStore: {
      has: async () => false,
      mark: async () => ({ status: "locked", reason: "disk_full" }),
      clear: async () => ({ status: "removed" }),
    },
    client: { refresh: async () => new Promise((resolve) => { resolveRefresh = resolve; }) },
    randomUUID: () => "550e8400-e29b-41d4-a716-446655440000",
  });
  await coordinator.initialize();
  const refresh = coordinator.refresh();
  await Promise.resolve();
  const logout = coordinator.logout();
  releaseSave();
  await assert.rejects(logout, /revocation/i);
  await new Promise((resolve) => setImmediate(resolve));
  resolveRefresh(exchanged(1));
  await assert.rejects(refresh, /stale/i);

  assert.deepEqual(await store.load(), { status: "empty" });
  assert.equal(coordinator.snapshot().status, "locked");
});

test("logout removes an in-flight pending authorization before restart", async () => {
  const store = memoryStore();
  let pendingAuthorization = null;
  const pendingAuthorizationStore = {
    load: async () => pendingAuthorization
      ? { status: "available", authorization: structuredClone(pendingAuthorization) }
      : { status: "empty" },
    save: async (value) => { pendingAuthorization = structuredClone(value); return { status: "saved" }; },
    remove: async () => { pendingAuthorization = null; return { status: "removed" }; },
  };
  let resolvePoll;
  const coordinator = createCredentialCoordinator({
    profile,
    credentialStore: store,
    pendingAuthorizationStore,
    pendingRevocationStore: {
      has: async () => false,
      mark: async () => ({ status: "locked", reason: "disk_full" }),
      clear: async () => ({ status: "removed" }),
    },
    client: {
      startAuthorization: async () => ({
        deviceCode: "device-code", userCode: "ABCD-EFGH", intervalSeconds: 5,
        expiresAt: Date.UTC(2026, 7, 1, 0, 10), verificationUrl: "https://yuance.example/web/device-authorization?user_code=ABCD-EFGH",
      }),
      pollAuthorization: async () => new Promise((resolve) => { resolvePoll = resolve; }),
    },
    randomUUID: () => "550e8400-e29b-41d4-a716-446655440000",
    createPkce: () => ({ verifier: "verifier", challenge: "challenge" }),
  });
  await coordinator.initialize();
  const authorization = coordinator.authorize({
    installationId: "install", deviceName: "Desktop", platform: "darwin", clientVersion: "0.1.0",
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(pendingAuthorization.phase, "started");

  await assert.rejects(coordinator.logout(), /revocation/i);
  assert.equal(pendingAuthorization, null);
  resolvePoll(exchanged(0));
  await assert.rejects(authorization, /stale/i);
  assert.deepEqual(await store.load(), { status: "empty" });

  const restarted = createCredentialCoordinator({
    profile,
    credentialStore: store,
    pendingAuthorizationStore,
    pendingRevocationStore: { has: async () => false, mark: async () => ({ status: "saved" }), clear: async () => ({ status: "removed" }) },
    client: { pollAuthorization: async () => assert.fail("authorization must not resume") },
  });
  assert.equal((await restarted.initialize()).status, "unauthenticated");
});

test("pending revocation restart stays locked and can only retry revocation or cleanup", async () => {
  const store = memoryStore({ status: "available", credential: storedCredential });
  const revocations = new Set([profile.key]);
  const calls = [];
  const coordinator = createCredentialCoordinator({
    profile,
    credentialStore: store,
    pendingAuthorizationStore: { load: async () => ({ status: "empty" }), save: async () => ({ status: "saved" }), remove: async () => ({ status: "removed" }) },
    pendingRevocationStore: {
      has: async () => revocations.has(profile.key),
      mark: async () => ({ status: "saved" }),
      clear: async () => { revocations.delete(profile.key); return { status: "removed" }; },
    },
    client: {
      refresh: async (input) => { calls.push("refresh"); return exchanged(input.generation + 1); },
      logout: async () => { calls.push("logout"); return { revoked: true, familyId: "family-1" }; },
    },
    randomUUID: () => "550e8400-e29b-41d4-a716-446655440000",
  });
  await coordinator.initialize();
  assert.equal(coordinator.snapshot().status, "locked");
  await assert.rejects(coordinator.getAccessToken(), /locked/);
  await coordinator.retryPendingRevocation();
  assert.deepEqual(calls, ["refresh", "logout"]);
  assert.equal(coordinator.snapshot().status, "unauthenticated");
  assert.equal(revocations.size, 0);
});

test("pending revocation discards local credentials when refresh proves the family is revoked", async () => {
  const store = memoryStore({ status: "available", credential: storedCredential });
  const revocations = new Set([profile.key]);
  const coordinator = createCredentialCoordinator({
    profile,
    credentialStore: store,
    pendingAuthorizationStore: { load: async () => ({ status: "empty" }), save: async () => ({ status: "saved" }), remove: async () => ({ status: "removed" }) },
    pendingRevocationStore: {
      has: async () => revocations.has(profile.key),
      mark: async () => ({ status: "saved" }),
      clear: async () => { revocations.delete(profile.key); return { status: "removed" }; },
    },
    client: {
      refresh: async () => { throw Object.assign(new Error("revoked"), { code: "family_revoked" }); },
    },
  });
  await coordinator.initialize();

  assert.equal((await coordinator.retryPendingRevocation()).status, "unauthenticated");
  assert.deepEqual(await store.load(), { status: "empty" });
  assert.equal(revocations.size, 0);
});

test("pending revocation cannot be overwritten by a new authorization", async () => {
  const store = memoryStore({ status: "available", credential: storedCredential });
  const revocations = new Set([profile.key]);
  const coordinator = createCredentialCoordinator({
    profile,
    credentialStore: store,
    pendingAuthorizationStore: { load: async () => ({ status: "empty" }), save: async () => ({ status: "saved" }), remove: async () => ({ status: "removed" }) },
    pendingRevocationStore: {
      has: async () => revocations.has(profile.key),
      mark: async () => ({ status: "saved" }),
      clear: async () => ({ status: "removed" }),
    },
    client: { startAuthorization: async () => assert.fail("authorization must not start") },
  });
  await coordinator.initialize();

  await assert.rejects(coordinator.authorize({}), /locked|pending/i);
  assert.deepEqual(await store.load(), { status: "available", credential: storedCredential });
  assert.equal(revocations.has(profile.key), true);
});

test("transient pending revocation refresh failure remains retryable", async () => {
  const store = memoryStore({ status: "available", credential: storedCredential });
  const revocations = new Set([profile.key]);
  let refreshCalls = 0;
  const coordinator = createCredentialCoordinator({
    profile,
    credentialStore: store,
    pendingAuthorizationStore: { load: async () => ({ status: "empty" }), save: async () => ({ status: "saved" }), remove: async () => ({ status: "removed" }) },
    pendingRevocationStore: {
      has: async () => revocations.has(profile.key),
      mark: async () => ({ status: "saved" }),
      clear: async () => { revocations.delete(profile.key); return { status: "removed" }; },
    },
    client: {
      refresh: async (input) => {
        refreshCalls += 1;
        if (refreshCalls === 1) throw Object.assign(new Error("offline"), { code: "network_error" });
        return exchanged(input.generation + 1);
      },
      logout: async () => ({ revoked: true, familyId: "family-1" }),
    },
    randomUUID: () => "550e8400-e29b-41d4-a716-446655440000",
  });
  await coordinator.initialize();

  await assert.rejects(coordinator.retryPendingRevocation(), /offline/);
  assert.deepEqual(coordinator.snapshot(), {
    status: "locked", reason: "pending_revocation", hasAccessToken: false,
    deviceId: "device-1", familyId: "family-1", generation: 0, authorizationVersion: 1,
  });
  await coordinator.retryPendingRevocation();
  assert.equal(coordinator.snapshot().status, "unauthenticated");
  assert.equal(refreshCalls, 2);
});

test("concurrent pending revocation retries are single-flight", async () => {
  const store = memoryStore({ status: "available", credential: storedCredential });
  const revocations = new Set([profile.key]);
  let refreshCalls = 0;
  let logoutCalls = 0;
  let resolveRefresh;
  const coordinator = createCredentialCoordinator({
    profile,
    credentialStore: store,
    pendingAuthorizationStore: { load: async () => ({ status: "empty" }), save: async () => ({ status: "saved" }), remove: async () => ({ status: "removed" }) },
    pendingRevocationStore: {
      has: async () => revocations.has(profile.key),
      mark: async () => ({ status: "saved" }),
      clear: async () => { revocations.delete(profile.key); return { status: "removed" }; },
    },
    client: {
      refresh: async () => { refreshCalls += 1; return new Promise((resolve) => { resolveRefresh = resolve; }); },
      logout: async () => { logoutCalls += 1; return { revoked: true, familyId: "family-1" }; },
    },
    randomUUID: () => "550e8400-e29b-41d4-a716-446655440000",
  });
  await coordinator.initialize();
  const first = coordinator.retryPendingRevocation();
  const second = coordinator.retryPendingRevocation();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(refreshCalls, 1);
  resolveRefresh(exchanged(1));
  assert.deepEqual(await first, await second);
  assert.equal(logoutCalls, 1);
});

test("late access cannot unlock a coordinator after logout starts", async () => {
  const store = memoryStore({ status: "available", credential: storedCredential });
  let rejectLogout;
  const { coordinator } = fixture({
    store,
    client: { logout: async () => new Promise((_resolve, reject) => { rejectLogout = reject; }) },
  });
  await coordinator.initialize();
  await coordinator.acceptAccess(exchanged(0));
  const logout = coordinator.logout();

  await assert.rejects(coordinator.acceptAccess(exchanged(0)), /locked/i);
  assert.equal(coordinator.snapshot().hasAccessToken, false);
  await new Promise((resolve) => setImmediate(resolve));
  rejectLogout(new Error("offline"));
  await assert.rejects(logout, /offline/);
});

test("revoked pending session automatically discards local credentials and marker", async () => {
  const store = memoryStore({ status: "available", credential: storedCredential });
  const revocations = new Set([profile.key]);
  const coordinator = createCredentialCoordinator({
    profile, credentialStore: store,
    pendingAuthorizationStore: { load: async () => ({ status: "empty" }), save: async () => ({ status: "saved" }), remove: async () => ({ status: "removed" }) },
    pendingRevocationStore: {
      has: async () => revocations.has(profile.key),
      mark: async () => ({ status: "saved" }),
      clear: async () => { revocations.delete(profile.key); return { status: "removed" }; },
    },
    client: { refresh: async () => { throw Object.assign(new Error("revoked"), { code: "device_session_revoked" }); } },
    randomUUID: () => "550e8400-e29b-41d4-a716-446655440000",
  });
  await coordinator.initialize();
  await coordinator.retryPendingRevocation();
  assert.deepEqual(await store.load(), { status: "empty" });
  assert.equal(revocations.size, 0);
  assert.equal(coordinator.snapshot().status, "unauthenticated");
});

test("pending authorization store encrypts secrets and binds them to the profile", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-pending-auth-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "pending.enc.json");
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`encrypted:${value}`),
    decryptString: (value) => value.toString().slice("encrypted:".length),
  };
  const platform = process.platform === "win32" ? "win32" : "darwin";
  const store = createPendingAuthorizationStore({ safeStorage, fs, filePath, profile, platform });
  const authorization = {
    phase: "started", codeVerifier: "secret-verifier", codeChallenge: "challenge",
    exchangeTransactionId: "550e8400-e29b-41d4-a716-446655440000",
    installationId: "install", deviceName: "Desktop", platform: "darwin", clientVersion: "0.1.0",
    deviceCode: "secret-device-code", userCode: "ABCD-EFGH",
    verificationUrl: "https://yuance.example/web/device-authorization?user_code=ABCD-EFGH",
    intervalSeconds: 5, expiresAt: Date.UTC(2026, 7, 1, 0, 10),
  };
  assert.deepEqual(await store.save(authorization), { status: "saved" });
  assert.deepEqual(await store.load(), { status: "available", authorization });
  const disk = await fs.readFile(filePath, "utf8");
  assert.equal(disk.includes("secret-verifier"), false);
  assert.equal(disk.includes("secret-device-code"), false);

  const wrongProfile = createPendingAuthorizationStore({
    safeStorage, fs, filePath, profile: { ...profile, serverInstanceId: "other-server" }, platform,
  });
  assert.deepEqual(await wrongProfile.load(), { status: "locked", reason: "profile_mismatch" });
  assert.deepEqual(await store.remove(), { status: "removed" });
  assert.deepEqual(await store.load(), { status: "empty" });
});

test("pending authorization store recovers a backup left between atomic renames", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-pending-auth-recovery-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "pending.enc.json");
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`encrypted:${value}`),
    decryptString: (value) => value.toString().slice("encrypted:".length),
  };
  const platform = process.platform === "win32" ? "win32" : "darwin";
  const store = createPendingAuthorizationStore({ safeStorage, fs, filePath, profile, platform });
  const authorization = {
    phase: "prepared", codeVerifier: "verifier", codeChallenge: "challenge",
    exchangeTransactionId: "550e8400-e29b-41d4-a716-446655440000",
    installationId: "install", deviceName: "Desktop", platform: "darwin", clientVersion: "0.1.0",
  };
  await store.save(authorization);
  await fs.rename(filePath, `${filePath}.previous`);
  assert.deepEqual(await store.load(), { status: "available", authorization });
  assert.deepEqual(await fs.readdir(directory), [path.basename(filePath)]);
});

test("pending authorization store rejects Linux basic_text encryption", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-pending-auth-linux-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = createPendingAuthorizationStore({
    safeStorage: {
      isEncryptionAvailable: () => true,
      getSelectedStorageBackend: () => "basic_text",
      encryptString: (value) => Buffer.from(value),
      decryptString: (value) => value.toString(),
    },
    fs,
    filePath: path.join(directory, "pending.enc.json"),
    profile,
    platform: "linux",
  });

  assert.deepEqual(await store.load(), { status: "locked", reason: "encryption_unavailable" });
});

test("pending authorization removal tombstone prevents backup revival", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-pending-auth-delete-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "pending.enc.json");
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`encrypted:${value}`),
    decryptString: (value) => value.toString().slice("encrypted:".length),
  };
  const platform = process.platform === "win32" ? "win32" : "darwin";
  const store = createPendingAuthorizationStore({ safeStorage, fs, filePath, profile, platform });
  const authorization = {
    phase: "prepared", codeVerifier: "verifier", codeChallenge: "challenge",
    exchangeTransactionId: "550e8400-e29b-41d4-a716-446655440000",
    installationId: "install", deviceName: "Desktop", platform: "darwin", clientVersion: "0.1.0",
  };
  await store.save(authorization);
  await fs.rename(filePath, `${filePath}.previous`);
  await fs.writeFile(`${filePath}.delete`, "delete\n", { mode: 0o600 });

  assert.deepEqual(await store.load(), { status: "empty" });
  assert.deepEqual(await fs.readdir(directory), []);
});
