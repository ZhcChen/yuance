import assert from "node:assert/strict";
import test from "node:test";
import { createNetworkCoordinator } from "../src/network/network-coordinator.mjs";

test("runs one stream, publishes online, probes EOF and reconnects with bounded retry", async () => {
  const streams = []; const states = []; let probes = 0;
  const coordinator = createNetworkCoordinator({ credentialRuntime: runtime(), sseClient: client(streams), probe: async () => { probes += 1; }, onState: (value) => states.push(value.status), minRetryMs: 1, maxRetryMs: 2, random: () => 1 });
  coordinator.start(); coordinator.start();
  await until(() => streams.length === 1); streams[0].connect(); streams[0].end();
  await until(() => streams.length === 2);
  assert.equal(probes, 1); assert.deepEqual(states.slice(0, 4), ["connecting", "online", "offline", "connecting"]);
  coordinator.stop();
});

test("security failure stops reconnecting and requires reauthorization", async () => {
  const streams = []; const invalidations = []; const coordinator = createNetworkCoordinator({ credentialRuntime: runtime(), sseClient: client(streams), probe: async () => {}, onReauthorizationRequired: async (code) => invalidations.push(code), minRetryMs: 1, maxRetryMs: 2 });
  coordinator.start(); await until(() => streams.length === 1); streams[0].fail(Object.assign(new Error("revoked"), { code: "device_revoked" }));
  await until(() => coordinator.snapshot().status === "reauthorization_required");
  await new Promise((resolve) => setTimeout(resolve, 5)); assert.equal(streams.length, 1);
  assert.deepEqual(invalidations, ["device_revoked"]);
});

test("an unauthorized handshake is probed before it is classified as revocation", async () => {
  const streams = []; let probes = 0;
  const coordinator = createNetworkCoordinator({ credentialRuntime: runtime(), sseClient: client(streams), probe: async () => { probes += 1; }, minRetryMs: 1, maxRetryMs: 2, random: () => 1 });
  coordinator.start(); await until(() => streams.length === 1); streams[0].fail(Object.assign(new Error("expired"), { code: "unauthorized" }));
  await until(() => streams.length === 2); assert.equal(probes, 1); assert.notEqual(coordinator.snapshot().status, "reauthorization_required"); coordinator.stop();
});

test("an unauthorized handshake becomes reauthorization-required when probe proves revocation", async () => {
  const streams = [];
  const coordinator = createNetworkCoordinator({ credentialRuntime: runtime(), sseClient: client(streams), probe: async () => { throw Object.assign(new Error("revoked"), { code: "family_revoked" }); }, minRetryMs: 1, maxRetryMs: 2 });
  coordinator.start(); await until(() => streams.length === 1); streams[0].fail(Object.assign(new Error("unauthorized"), { code: "unauthorized" }));
  await until(() => coordinator.snapshot().status === "reauthorization_required"); assert.equal(streams.length, 1);
});

test("access expiry refreshes, probes and obtains a fresh lease", async () => {
  const streams = []; const runtimeValue = runtime({ expiresAt: new Date(Date.now() + 5).toISOString() }); let probes = 0;
  const coordinator = createNetworkCoordinator({ credentialRuntime: runtimeValue, sseClient: client(streams), probe: async () => { probes += 1; }, expirySkewMs: 0, minRetryMs: 1, maxRetryMs: 2 });
  coordinator.start(); await until(() => streams.length === 2);
  assert.equal(runtimeValue.refreshCalls, 1); assert.equal(probes, 1); assert.equal(runtimeValue.leaseCalls, 2); coordinator.stop();
});

test("invalidate, suspend and stop abort active work; resume creates a fresh epoch", async () => {
  const streams = []; const coordinator = createNetworkCoordinator({ credentialRuntime: runtime(), sseClient: client(streams), probe: async () => {}, minRetryMs: 1, maxRetryMs: 2 });
  coordinator.start(); await until(() => streams.length === 1); coordinator.suspend(); assert.equal(streams[0].signal.aborted, true); assert.equal(coordinator.snapshot().status, "suspended");
  coordinator.resume(); await until(() => streams.length === 2); coordinator.invalidate(); assert.equal(streams[1].signal.aborted, true); assert.equal(coordinator.snapshot().status, "idle"); coordinator.stop();
});

test("clamps server retry hints and treats probe timeout as an offline retry", async () => {
  const streams = []; const waits = []; let probes = 0;
  const coordinator = createNetworkCoordinator({ credentialRuntime: runtime(), sseClient: client(streams), probe: async () => { probes += 1; throw Object.assign(new Error("timeout"), { code: "request_timeout" }); }, minRetryMs: 10, maxRetryMs: 20, random: () => 1, sleep: async (ms, signal) => {
    if (ms > 100) return new Promise((_resolve, reject) => signal.addEventListener("abort", reject, { once: true }));
    waits.push(ms);
  } });
  coordinator.start(); await until(() => streams.length === 1); streams[0].retry(1_000_000); streams[0].end();
  await until(() => streams.length === 2); assert.equal(probes, 1); assert.deepEqual(waits, [20]); coordinator.stop();
});

test("late control events after invalidation are never published", async () => {
  const streams = []; const states = [];
  const coordinator = createNetworkCoordinator({ credentialRuntime: runtime(), sseClient: client(streams), probe: async () => {}, onState: (value) => states.push(value.status), minRetryMs: 1, maxRetryMs: 2 });
  coordinator.start(); await until(() => streams.length === 1); coordinator.invalidate(); streams[0].connect();
  await new Promise((resolve) => setImmediate(resolve)); assert.equal(states.at(-1), "idle"); assert.equal(states.includes("online"), false);
});

test("forwards allowlisted facts with the current credential epoch and drops late facts", async () => {
  const streams = [];
  const facts = [];
  const coordinator = createNetworkCoordinator({ credentialRuntime: runtime(), sseClient: client(streams), probe: async () => {}, onFact: (value) => facts.push(value), minRetryMs: 1, maxRetryMs: 2 });
  const running = coordinator.start();
  await until(() => streams.length === 1);
  streams[0].onControl({ type: "connected" });
  streams[0].onControl({ type: "topbar", reason: "refresh" });
  streams[0].onControl({ type: "release-version", version: "0.1.0" });
  assert.deepEqual(facts, [
    { type: "topbar", reason: "refresh", epoch: 1 },
    { type: "release-version", version: "0.1.0", epoch: 1 },
  ]);
  coordinator.invalidate();
  streams[0].onControl({ type: "topbar", reason: "refresh" });
  assert.equal(facts.length, 2);
  await running;
});

function runtime({ expiresAt = new Date(Date.now() + 60_000).toISOString() } = {}) {
  return { epoch: 1, leaseCalls: 0, refreshCalls: 0, async withAccessLease(operation) { this.leaseCalls += 1; return operation({ accessToken: `yuance_dat_${this.epoch}`, accessExpiresAt: expiresAt, epoch: this.epoch }); }, async refreshAccess(epoch) { if (epoch !== this.epoch) return false; this.refreshCalls += 1; this.epoch += 1; return true; } };
}
function client(streams) { return { subscribe({ signal, onControl, onRetry }) { return new Promise((resolve, reject) => streams.push({ signal, onControl, connect: () => onControl({ type: "connected" }), retry: onRetry, end: () => resolve({ reason: "eof" }), fail: reject })); } }; }
async function until(predicate) { for (let index = 0; index < 100; index += 1) { if (predicate()) return; await new Promise((resolve) => setTimeout(resolve, 1)); } throw new Error("condition not reached"); }
