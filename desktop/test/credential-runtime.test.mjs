import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { createCredentialRuntime } from "../src/auth/credential-runtime.mjs";

const profile = Object.freeze({
  version: 1,
  mode: "production",
  origin: "https://yuance.example",
  serverInstanceId: "server-1",
  key: `yuance-desktop-profile-v1:${"a".repeat(64)}`,
});

test("assembles one coordinator with an injected Electron session fetch", async () => {
  const fetchImpl = async () => new Response("{}");
  const captured = {};
  const coordinator = fakeCoordinator();
  const runtime = createCredentialRuntime({
    profile,
    fetchImpl,
    userDataPath: "/tmp/yuance-runtime-test",
    fs: fakeFs(),
    safeStorage: {},
    platform: "darwin",
    createClient: (options) => {
      captured.clientOptions = options;
      return { kind: "client" };
    },
    createCoordinator: (options) => {
      captured.coordinatorOptions = options;
      return coordinator;
    },
    createCredentialStore: () => ({ kind: "credential-store" }),
    createAuthorizationStore: () => ({ kind: "authorization-store" }),
    createRevocationStore: () => ({ kind: "revocation-store" }),
  });

  assert.equal(captured.clientOptions.fetchImpl, fetchImpl);
  assert.equal(captured.coordinatorOptions.client.kind, "client");
  assert.equal(captured.coordinatorOptions.credentialStore.kind, "credential-store");
  assert.equal("getAccessToken" in runtime, false);
  assert.equal(Object.isFrozen(runtime), true);
  assert.equal((await runtime.initialize()).status, "unauthenticated");
  assert.equal(coordinator.initializeCalls, 1);
});

test("requires fetch injection and never falls back to global fetch", () => {
  assert.throws(
    () => createCredentialRuntime({ profile, userDataPath: "/tmp", fs: fakeFs(), safeStorage: {} }),
    /fetchImpl is required/,
  );
});

test("invalidates network epoch before publishing locked or revoked state", async () => {
  const order = [];
  const coordinator = fakeCoordinator();
  const runtime = runtimeFixture({
    coordinator,
    onNetworkInvalidated: (value) => order.push(["invalidate", value.reason]),
    onPublicState: (value) => order.push(["publish", value.status]),
  });
  await runtime.initialize();
  order.length = 0;

  coordinator.emit({ status: "locked", reason: "refresh_failed", accessToken: "secret" });
  assert.deepEqual(order, [
    ["invalidate", "refresh_failed"],
    ["publish", "locked"],
  ]);
  const lockedEpoch = runtime.networkEpoch();
  coordinator.emit({ status: "revoked", reason: "device_revoked" });
  assert.ok(runtime.networkEpoch() > lockedEpoch);
  assert.deepEqual(order.slice(-2), [
    ["invalidate", "device_revoked"],
    ["publish", "reauthorization_required"],
  ]);
});

test("access lease stays inside a callback and rejects stale results", async () => {
  const coordinator = fakeCoordinator({ status: "authenticated" });
  const runtime = runtimeFixture({ coordinator });
  await runtime.initialize();
  let leaseKeys;
  const result = await runtime.withAccessLease(async (lease) => {
    leaseKeys = Object.keys(lease).sort();
    assert.equal(lease.accessToken, "yuance_dat_runtime-secret");
    assert.equal(lease.accessExpiresAt, "2026-08-02T12:00:00Z");
    assert.equal(Object.isFrozen(lease), true);
    return "ok";
  });
  assert.equal(result, "ok");
  assert.deepEqual(leaseKeys, ["accessExpiresAt", "accessToken", "epoch"]);

  await assert.rejects(
    runtime.withAccessLease(async () => {
      coordinator.emit({ status: "locked", reason: "cancelled" });
      return "late";
    }),
    /stale network epoch/,
  );
});

test("profile evidence mismatch locks until an explicit local discard", async () => {
  const coordinator = fakeCoordinator();
  const fs = fakeFs({
    entries: [`${"b".repeat(64)}.enc.json`],
  });
  const states = [];
  const runtime = runtimeFixture({ coordinator, fs, onPublicState: (state) => states.push(state) });

  assert.deepEqual(await runtime.initialize(), { status: "locked" });
  assert.equal(coordinator.initializeCalls, 0);
  assert.deepEqual(fs.removed, []);
  assert.deepEqual(await runtime.discardMismatchedProfile(), { status: "unauthenticated" });
  assert.equal(coordinator.initializeCalls, 1);
  assert.deepEqual(fs.removed, [path.join("/tmp/yuance-runtime-test", "Device Credentials", `${"b".repeat(64)}.enc.json`)]);
  assert.deepEqual(states, [{ status: "locked" }, { status: "unauthenticated" }]);
});

test("does not publish the coordinator placeholder before initialization completes", async () => {
  const coordinator = fakeCoordinator({ status: "unauthenticated" });
  const states = [];
  coordinator.initialize = async function initialize() {
    this.initializeCalls += 1;
    this.emit({ status: "authenticated" });
    return this.snapshot();
  };
  const runtime = runtimeFixture({ coordinator, onPublicState: (state) => states.push(state) });
  await runtime.initialize();
  assert.deepEqual(states, [{ status: "authenticated" }]);
});

test("authorization, logout, retry, and disposal are semantic and single-runtime", async () => {
  const coordinator = fakeCoordinator();
  const runtime = runtimeFixture({
    coordinator,
    installationId: async () => "installation-1",
    deviceName: "Yuance Desktop",
    clientVersion: "0.1.0",
    platform: "darwin",
  });
  await runtime.initialize();
  await runtime.authorize({ openExternal: async () => {}, onUserCode: () => {} });
  assert.deepEqual(coordinator.authorizeInputs[0], {
    installationId: "installation-1",
    deviceName: "Yuance Desktop",
    platform: "darwin",
    clientVersion: "0.1.0",
    openExternal: coordinator.authorizeInputs[0].openExternal,
    onUserCode: coordinator.authorizeInputs[0].onUserCode,
  });
  const preRefreshEpoch = runtime.networkEpoch();
  assert.equal(await runtime.refreshAccess(preRefreshEpoch), true);
  assert.ok(runtime.networkEpoch() > preRefreshEpoch);
  assert.equal(await runtime.refreshAccess(preRefreshEpoch), false);
  assert.equal(coordinator.refreshCalls, 1);
  await runtime.logout();
  await runtime.retryPendingRevocation();
  runtime.dispose();
  runtime.dispose();
  assert.equal(coordinator.unsubscribeCalls, 1);
  assert.deepEqual(coordinator.lockReasons, ["runtime_disposed"]);
});

function runtimeFixture({ coordinator = fakeCoordinator(), fs = fakeFs(), ...overrides } = {}) {
  return createCredentialRuntime({
    profile,
    fetchImpl: async () => new Response("{}"),
    userDataPath: "/tmp/yuance-runtime-test",
    fs,
    safeStorage: {},
    platform: "darwin",
    installationId: async () => "installation-1",
    deviceName: "Yuance Desktop",
    clientVersion: "0.1.0",
    createClient: () => ({}),
    createCoordinator: () => coordinator,
    createCredentialStore: () => ({}),
    createAuthorizationStore: () => ({}),
    createRevocationStore: () => ({}),
    ...overrides,
  });
}

function fakeCoordinator({ status = "unauthenticated" } = {}) {
  let snapshot = { status };
  let listener;
  return {
    initializeCalls: 0,
    unsubscribeCalls: 0,
    authorizeInputs: [],
    lockReasons: [],
    refreshCalls: 0,
    snapshot: () => snapshot,
    subscribe(callback) {
      listener = callback;
      callback(snapshot);
      return () => { this.unsubscribeCalls += 1; };
    },
    async initialize() { this.initializeCalls += 1; return snapshot; },
    async getAccessToken() { return "yuance_dat_runtime-secret"; },
    async getAccessLease() {
      return Object.freeze({ token: "yuance_dat_runtime-secret", expiresAt: "2026-08-02T12:00:00Z" });
    },
    async refresh() { this.refreshCalls += 1; return "yuance_dat_rotated-secret"; },
    async authorize(input) { this.authorizeInputs.push(input); return snapshot; },
    async logout() { return snapshot; },
    async retryPendingRevocation() { return snapshot; },
    async discardLocalSession() { return snapshot; },
    async lock(reason) { this.lockReasons.push(reason); snapshot = { status: "locked", reason }; return snapshot; },
    emit(next) { snapshot = next; listener?.(next); },
  };
}

function fakeFs({ entries = [] } = {}) {
  let currentEntries = [...entries];
  const adapter = {
    removed: [],
    async readdir() { return currentEntries; },
    async rm(filePath) {
      this.removed.push(filePath);
      currentEntries = currentEntries.filter((entry) => entry !== path.basename(filePath));
    },
  };
  return adapter;
}
