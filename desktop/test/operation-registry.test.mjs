import assert from "node:assert/strict";
import test from "node:test";

import { createOperationRegistry } from "../src/network/operation-registry.mjs";

test("registers only fixed parameter-free Device operations", () => {
  const registry = createOperationRegistry();
  assert.deepEqual(registry.resolve("session.probe", {}), {
    idempotent: true,
    method: "GET",
    path: "/api/v1/device-session",
    parse: registry.resolve("session.probe", {}).parse,
  });
  assert.deepEqual(Object.fromEntries(["upload", "download"].map((purpose) => {
    const operation = registry.resolve(`file.canary${purpose}`, {});
    return [purpose, { idempotent: operation.idempotent, method: operation.method, path: operation.path }];
  })), {
    upload: { idempotent: false, method: "POST", path: "/api/v1/device-file-transfer/canary/upload-request" },
    download: { idempotent: true, method: "GET", path: "/api/v1/device-file-transfer/canary/download-request" },
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

test("tracks only fixed file operations with a bounded abort lifecycle", () => {
  const registry = createOperationRegistry({ maxActiveOperations: 2 });
  const first = new AbortController();
  const second = new AbortController();
  const finish = registry.begin("file.upload", first);
  const finishSecond = registry.begin("file.download", second);
  assert.deepEqual(registry.snapshot(), { active: 2 });
  assert.throws(() => registry.begin("file.upload", new AbortController()), (error) => error.code === "file_transfer_concurrency_limit");
  assert.throws(() => registry.begin("network.generic", new AbortController()), /active operation/);
  registry.abortAll();
  assert.equal(first.signal.aborted, true);
  assert.equal(second.signal.aborted, true);
  assert.deepEqual(registry.snapshot(), { active: 2 });
  finish();
  finishSecond();
  assert.deepEqual(registry.snapshot(), { active: 0 });
  assert.throws(() => createOperationRegistry({ maxActiveOperations: 5 }), /fixed safety limit/);
});
