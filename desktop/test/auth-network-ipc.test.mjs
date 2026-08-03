import assert from "node:assert/strict";
import test from "node:test";
import { AUTH_CHANNELS, registerAuthCommandHandlers } from "../src/ipc/auth-commands.mjs";
import { createNetworkStatePublisher } from "../src/ipc/network-state.mjs";

test("auth commands use fixed channels, reject payloads, and validate every sender", async () => {
  const handlers = new Map(); const removed = []; const senders = []; const calls = [];
  const runtime = runtimeFixture(calls);
  const dispose = registerAuthCommandHandlers({ ipcMain: { handle: (channel, handler) => handlers.set(channel, handler), removeHandler: (channel) => removed.push(channel) }, assertSender: (event) => { senders.push(event); if (!event.trusted) throw new Error("untrusted"); }, getRuntime: () => runtime, getNetworkCoordinator: () => ({ start: () => calls.push("network.start") }), openExternal: async () => {} });
  assert.deepEqual([...handlers.keys()].sort(), Object.values(AUTH_CHANNELS).sort());
  await assert.rejects(handlers.get(AUTH_CHANNELS.authorize)({ trusted: false }), /untrusted/);
  await assert.rejects(handlers.get(AUTH_CHANNELS.authorize)({ trusted: true }, {}), /do not accept payloads/);
  assert.deepEqual(await handlers.get(AUTH_CHANNELS.authorize)({ trusted: true }), { status: "authenticated" });
  assert.deepEqual(await handlers.get(AUTH_CHANNELS.logout)({ trusted: true }), { status: "unauthenticated" });
  assert.equal(senders.length, 4); dispose(); assert.deepEqual(removed.sort(), Object.values(AUTH_CHANNELS).sort());
});

test("retry selects network restart, locked recovery, or authorization", async () => {
  const handlers = new Map(); const calls = []; const runtime = runtimeFixture(calls);
  registerAuthCommandHandlers({ ipcMain: { handle: (channel, handler) => handlers.set(channel, handler), removeHandler() {} }, assertSender() {}, getRuntime: () => runtime, getNetworkCoordinator: () => ({ start: () => calls.push("network.start") }), openExternal: async () => {} });
  runtime.status = "authenticated"; await handlers.get(AUTH_CHANNELS.retry)({});
  runtime.status = "locked"; await handlers.get(AUTH_CHANNELS.retry)({});
  runtime.status = "unauthenticated"; await handlers.get(AUTH_CHANNELS.retry)({});
  assert.deepEqual(calls, ["network.start", "retry", "authorize"]);
});

test("duplicate auth commands are single-flight in the main process", async () => {
  const handlers = new Map(); let resolve; let calls = 0;
  const runtime = runtimeFixture([]);
  runtime.authorize = async () => { calls += 1; return new Promise((done) => { resolve = done; }); };
  registerAuthCommandHandlers({ ipcMain: { handle: (channel, handler) => handlers.set(channel, handler), removeHandler() {} }, assertSender() {}, getRuntime: () => runtime, getNetworkCoordinator: () => undefined, openExternal: async () => {} });
  const first = handlers.get(AUTH_CHANNELS.authorize)({}); const second = handlers.get(AUTH_CHANNELS.authorize)({});
  assert.equal(calls, 1); resolve({ status: "authenticated" });
  assert.deepEqual(await first, { status: "authenticated" }); assert.deepEqual(await second, { status: "authenticated" });
});

test("auth commands keep a main-only user-code observer outside renderer payloads", async () => {
  const handlers = new Map();
  const observer = () => {};
  let authorizationOptions;
  const runtime = runtimeFixture([]);
  runtime.authorize = async (options) => { authorizationOptions = options; return { status: "authenticated" }; };
  registerAuthCommandHandlers({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler), removeHandler() {} },
    assertSender() {}, getRuntime: () => runtime, getNetworkCoordinator: () => undefined,
    openExternal: async () => {}, onUserCode: observer,
  });
  assert.deepEqual(await handlers.get(AUTH_CHANNELS.authorize)({}, undefined), { status: "authenticated" });
  assert.equal(authorizationOptions.onUserCode, observer);
  assert.deepEqual(Object.keys(authorizationOptions).sort(), ["onUserCode", "openExternal"]);
  assert.throws(() => registerAuthCommandHandlers({ ipcMain: { handle() {}, removeHandler() {} }, assertSender() {}, getRuntime() {}, getNetworkCoordinator() {}, openExternal() {}, onUserCode: "renderer" }), /onUserCode/);
});

test("network publisher strips private fields and ignores destroyed windows", () => {
  const publisher = createNetworkStatePublisher();
  assert.deepEqual(publisher.update({ status: "online", token: "secret", endpoint: "https://secret" }), { status: "online" });
  const sent = []; const window = { isDestroyed: () => false, webContents: { isDestroyed: () => false, send: (...args) => sent.push(args) } };
  assert.equal(publisher.publishTo(window), true); assert.deepEqual(sent, [["yuance:network-state", { status: "online" }]]);
  assert.equal(publisher.publishTo({ ...window, isDestroyed: () => true }), false);
  assert.deepEqual(publisher.update({ status: "unknown" }), { status: "fatal" });
});

function runtimeFixture(calls) {
  return { status: "unauthenticated", snapshot() { return { status: this.status }; }, async authorize() { calls.push("authorize"); this.status = "authenticated"; return this.snapshot(); }, async logout() { calls.push("logout"); this.status = "unauthenticated"; return this.snapshot(); }, async retryPendingRevocation() { calls.push("retry"); return this.snapshot(); } };
}
