import assert from "node:assert/strict";
import test from "node:test";

import { createFileCapabilityVault } from "../src/files/file-capability-vault.mjs";

function snapshot(name = "report.txt", size = 12) {
  let removed = 0;
  return {
    value: Object.freeze({ privatePath: `/private/${name}`, filename: name, contentType: "text/plain", byteSize: size, sha256: "a".repeat(64), remove: async () => { removed += 1; } }),
    removed: () => removed,
  };
}

test("issues opaque public metadata and consumes once with exact bindings", async () => {
  let now = 1_000;
  const vault = createFileCapabilityVault({ now: () => now, randomBytes: () => Buffer.alloc(24, 7) });
  const entry = snapshot();
  const publicValue = vault.issue(entry.value, { profileEpoch: 3, webContentsId: 9, frameRoutingId: 2, purpose: "upload" });
  assert.deepEqual(Object.keys(publicValue).sort(), ["byteSize", "capability", "contentType", "filename"]);
  assert.equal(publicValue.capability.startsWith("yfc_"), true);
  assert.equal(JSON.stringify(publicValue).includes("/private/"), false);
  const consumed = vault.consume(publicValue.capability, { profileEpoch: 3, webContentsId: 9, frameRoutingId: 2, purpose: "upload" });
  assert.equal(consumed.privatePath, "/private/report.txt");
  assert.throws(() => vault.consume(publicValue.capability, { profileEpoch: 3, webContentsId: 9, frameRoutingId: 2, purpose: "upload" }), (error) => error.code === "file_capability_invalid");
});

test("describes private integrity metadata without consuming a valid capability", () => {
  const vault = createFileCapabilityVault({ randomBytes: () => Buffer.alloc(24, 8) });
  const binding = { profileEpoch: 3, webContentsId: 9, frameRoutingId: 2, purpose: "upload" };
  const issued = vault.issue(snapshot().value, binding);
  assert.deepEqual(vault.describe(issued.capability, binding), {
    filename: "report.txt",
    contentType: "text/plain",
    byteSize: 12,
    sha256: "a".repeat(64),
  });
  assert.equal(vault.consume(issued.capability, binding).filename, "report.txt");
});

test("description binding mismatch destroys the capability and snapshot", async () => {
  const vault = createFileCapabilityVault({ randomBytes: () => Buffer.alloc(24, 9) });
  const entry = snapshot();
  const binding = { profileEpoch: 3, webContentsId: 9, frameRoutingId: 2, purpose: "upload" };
  const issued = vault.issue(entry.value, binding);
  assert.throws(() => vault.describe(issued.capability, { ...binding, webContentsId: 10 }), (error) => error.code === "file_capability_invalid");
  await vault.drainCleanup();
  assert.equal(entry.removed(), 1);
  assert.throws(() => vault.consume(issued.capability, binding), (error) => error.code === "file_capability_invalid");
});

test("wrong sender, profile, or purpose consumes the capability and removes its snapshot", async () => {
  for (const mismatch of [{ profileEpoch: 4 }, { webContentsId: 10 }, { frameRoutingId: 3 }, { purpose: "download" }]) {
    const vault = createFileCapabilityVault({ randomBytes: () => Buffer.from(String(Math.random()).padEnd(24, "0")) });
    const entry = snapshot();
    const binding = { profileEpoch: 3, webContentsId: 9, frameRoutingId: 2, purpose: "upload" };
    const issued = vault.issue(entry.value, binding);
    assert.throws(() => vault.consume(issued.capability, { ...binding, ...mismatch }), (error) => error.code === "file_capability_invalid");
    await vault.drainCleanup();
    assert.equal(entry.removed(), 1);
  }
});

test("expires, invalidates by lifecycle, enforces quotas, and removes snapshots", async () => {
  let now = 1_000;
  let nonce = 0;
  const vault = createFileCapabilityVault({ now: () => now, ttlMs: 100, maxEntries: 2, maxTotalBytes: 20, randomBytes: () => Buffer.alloc(24, ++nonce) });
  const first = snapshot("one", 8);
  const second = snapshot("two", 8);
  const third = snapshot("three", 8);
  const binding = { profileEpoch: 1, webContentsId: 2, frameRoutingId: 3, purpose: "upload" };
  const issued = vault.issue(first.value, binding);
  vault.issue(second.value, binding);
  assert.throws(() => vault.issue(third.value, binding), (error) => error.code === "file_capability_quota");
  now += 101;
  assert.throws(() => vault.consume(issued.capability, binding), (error) => error.code === "file_capability_invalid");
  await vault.invalidateAll();
  assert.equal(first.removed(), 1);
  assert.equal(second.removed(), 1);
  assert.equal(third.removed(), 0);
  assert.deepEqual(vault.snapshot(), { entries: 0, totalBytes: 0 });
});

test("fixed limits can only be tightened", () => {
  for (const options of [
    { ttlMs: 300_001 },
    { maxEntries: 17 },
    { maxTotalBytes: 200 * 1024 * 1024 + 1 },
    { ttlMs: Infinity },
    { maxEntries: 0 },
  ]) assert.throws(() => createFileCapabilityVault(options), /fixed safety limit/);
});

test("capability collision never adopts or leaks the second snapshot", async () => {
  const vault = createFileCapabilityVault({ randomBytes: () => Buffer.alloc(24, 5) });
  const binding = { profileEpoch: 1, webContentsId: 2, frameRoutingId: 3, purpose: "upload" };
  const first = snapshot("first");
  const second = snapshot("second");
  vault.issue(first.value, binding);
  assert.throws(() => vault.issue(second.value, binding), (error) => error.code === "file_capability_quota");
  assert.equal(second.removed(), 0);
  await vault.invalidateAll();
  assert.equal(first.removed(), 1);
});

test("TTL accepts the last millisecond and rejects the exact expiry boundary", async () => {
  let now = 500;
  let nonce = 0;
  const binding = { profileEpoch: 1, webContentsId: 2, frameRoutingId: 3, purpose: "upload" };
  const vault = createFileCapabilityVault({ now: () => now, ttlMs: 100, randomBytes: () => Buffer.alloc(24, ++nonce) });
  const before = vault.issue(snapshot("before").value, binding);
  now = 599;
  assert.equal(vault.consume(before.capability, binding).filename, "before");
  const exact = vault.issue(snapshot("exact").value, binding);
  now = 699;
  assert.throws(() => vault.consume(exact.capability, binding), (error) => error.code === "file_capability_invalid");
  await vault.drainCleanup();
});

test("retries failed snapshot cleanup and reports persistent failures", async () => {
  const binding = { profileEpoch: 1, webContentsId: 2, frameRoutingId: 3, purpose: "upload" };
  let transientAttempts = 0;
  const transient = snapshot("transient");
  transient.value = Object.freeze({
    ...transient.value,
    remove: async () => {
      transientAttempts += 1;
      if (transientAttempts === 1) throw new Error("transient cleanup failure");
    },
  });
  const retryingVault = createFileCapabilityVault({ randomBytes: () => Buffer.alloc(24, 1) });
  retryingVault.issue(transient.value, binding);
  await retryingVault.invalidateAll();
  assert.equal(transientAttempts, 2);

  let persistentAttempts = 0;
  const persistent = snapshot("persistent");
  persistent.value = Object.freeze({
    ...persistent.value,
    remove: async () => {
      persistentAttempts += 1;
      throw new Error("persistent cleanup failure");
    },
  });
  const failingVault = createFileCapabilityVault({ randomBytes: () => Buffer.alloc(24, 2) });
  failingVault.issue(persistent.value, binding);
  await assert.rejects(failingVault.invalidateAll(), (error) => error.code === "file_snapshot_cleanup_failed");
  await assert.rejects(failingVault.drainCleanup(), (error) => error.code === "file_snapshot_cleanup_failed");
  assert.equal(persistentAttempts, 3);
});
