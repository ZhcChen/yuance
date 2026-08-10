import assert from "node:assert/strict";
import test from "node:test";

import { BUSINESS_EXECUTE_CHANNEL, registerBusinessCommandHandlers } from "../src/ipc/business-commands.mjs";

function fixture() {
  const handlers = new Map();
  const calls = [];
  const trustedEvent = { trusted: true };
  const dispose = registerBusinessCommandHandlers({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler), removeHandler: (channel) => handlers.delete(channel) },
    assertSender: (event) => { calls.push(["sender", event]); if (event !== trustedEvent) throw new Error("untrusted secret"); },
    execute: async (operation, input) => { calls.push(["execute", operation, input]); return Object.freeze({ value: 7 }); },
  });
  return { calls, dispose, handler: handlers.get(BUSINESS_EXECUTE_CHANNEL), handlers, trustedEvent };
}

test("business command executes one fixed envelope after sender validation", async () => {
  const value = fixture();
  assert.deepEqual(await value.handler(value.trustedEvent, { operation: "identity.current", input: {} }), {
    ok: true, data: { value: 7 },
  });
  assert.deepEqual(value.calls.map(([name]) => name), ["sender", "execute"]);
  value.dispose();
  assert.equal(value.handlers.size, 0);
});

test("business command rejects stale senders before inspecting payload", async () => {
  const value = fixture();
  await assert.rejects(value.handler({}, { operation: "identity.current", input: { token: "secret" } }), /untrusted secret/);
  assert.deepEqual(value.calls.map(([name]) => name), ["sender"]);
});

test("business command rejects extensible envelopes without executing", async () => {
  const value = fixture();
  for (const payload of [
    null,
    { operation: "identity.current", input: {}, url: "https://evil.example" },
    { operation: "identity.current", input: {}, method: "POST" },
    { operation: "identity.current", input: {}, headers: { Authorization: "Bearer forged" } },
    JSON.parse('{"operation":"identity.current","input":{},"__proto__":{"polluted":true}}'),
  ]) assert.deepEqual(await value.handler(value.trustedEvent, payload), { ok: false, error: { code: "invalid_request" } });
  assert.equal(value.calls.some(([name]) => name === "execute"), false);
});

test("business command returns only stable public error fields", async () => {
  const handlers = new Map();
  registerBusinessCommandHandlers({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler), removeHandler() {} },
    assertSender() {},
    execute: async (operation) => {
      if (operation === "known") throw Object.assign(new Error("server secret"), { code: "project_access_denied", status: 403, body: { token: "secret" } });
      throw Object.assign(new Error("private path /tmp/secret"), { code: "INVALID SECRET", status: 200 });
    },
  });
  const handler = handlers.get(BUSINESS_EXECUTE_CHANNEL);
  assert.deepEqual(await handler({}, { operation: "known", input: {} }), { ok: false, error: { code: "project_access_denied", status: 403 } });
  assert.deepEqual(await handler({}, { operation: "unknown", input: {} }), { ok: false, error: { code: "business_unavailable" } });
});
