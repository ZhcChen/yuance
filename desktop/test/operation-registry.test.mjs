import assert from "node:assert/strict";
import test from "node:test";

import { createOperationRegistry } from "../src/network/operation-registry.mjs";

test("registers only the fixed parameter-free session probe", () => {
  const registry = createOperationRegistry();
  assert.deepEqual(registry.resolve("session.probe", {}), {
    idempotent: true,
    method: "GET",
    path: "/api/v1/device-session",
    parse: registry.resolve("session.probe", {}).parse,
  });
  for (const [name, input] of [
    ["session.unknown", {}],
    ["session.probe", { url: "https://evil.example" }],
    ["session.probe", { method: "POST" }],
    ["session.probe", { headers: { Authorization: "Bearer forged" } }],
    ["session.probe", JSON.parse('{"__proto__":{"polluted":true}}')],
    ["session.probe/../logout", {}],
  ]) assert.throws(() => registry.resolve(name, input), /operation|input/i);
});

test("normalizes a probe response without credentials", () => {
  const operation = createOperationRegistry().resolve("session.probe", {});
  const value = operation.parse({
    user_id: 7,
    username: "alice",
    display_name: "Alice",
    device_id: "device-1",
    family_id: "family-1",
    generation: 2,
    authorization_version: 3,
    access_expires_at: "2026-08-02T12:00:00Z",
    server_instance_id: "server-1",
  }, { serverInstanceId: "server-1" });
  assert.equal(value.username, "alice");
  assert.equal(Object.isFrozen(value), true);
  assert.equal("access_token" in value, false);
  assert.throws(() => operation.parse({
    user_id: 7, username: "alice", display_name: "Alice", device_id: "device-1", family_id: "family-1",
    generation: 2, authorization_version: 3, access_expires_at: "2026-08-02T12:00:00Z",
    server_instance_id: "server-1", access_token: "yuance_dat_leak",
  }, { serverInstanceId: "server-1" }), /identity/i);
});
