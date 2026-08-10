import assert from "node:assert/strict";
import test from "node:test";

import { createTransferGrantVault } from "../src/files/transfer-grant-vault.mjs";

const binding = Object.freeze({ profileEpoch: 3, authorizationVersion: 7, webContentsId: 9, frameRoutingId: 2, purpose: "upload" });
function contract(expiresAt) {
  return Object.freeze({
    version: 1,
    purpose: "upload",
    method: "PUT",
    url: "https://private.invalid/file",
    origin: "https://private.invalid",
    headers: Object.freeze([]),
    expectedBytes: 1,
    contentType: "application/octet-stream",
    sha256: "a".repeat(64),
    expiresAt,
  });
}

test("issues only an opaque grant and consumes it once with exact binding", () => {
  const now = 1_000;
  const vault = createTransferGrantVault({ now: () => now, randomBytes: () => Buffer.alloc(24, 3) });
  const privateContract = contract(now + 30_000);
  const publicGrant = vault.issue(privateContract, binding);
  assert.deepEqual(Object.keys(publicGrant), ["grant"]);
  assert.equal(publicGrant.grant.startsWith("ytg_"), true);
  assert.equal(JSON.stringify(publicGrant).includes("private.invalid"), false);
  assert.equal(vault.consume(publicGrant.grant, binding), privateContract);
  assert.throws(() => vault.consume(publicGrant.grant, binding), invalidGrant);
});

test("binding mismatch consumes grants across profile, authorization, sender, and purpose", () => {
  const mismatches = [{ profileEpoch: 4 }, { authorizationVersion: 8 }, { webContentsId: 10 }, { frameRoutingId: 3 }, { purpose: "download" }];
  for (let index = 0; index < mismatches.length; index += 1) {
    const vault = createTransferGrantVault({ now: () => 1_000, randomBytes: () => Buffer.alloc(24, index + 1) });
    const issued = vault.issue(contract(20_000), binding);
    assert.throws(() => vault.consume(issued.grant, { ...binding, ...mismatches[index] }), invalidGrant);
    assert.throws(() => vault.consume(issued.grant, binding), invalidGrant);
  }
});

test("expires at the exact boundary, prunes entries, and invalidates lifecycle state", () => {
  let now = 1_000;
  let nonce = 0;
  const vault = createTransferGrantVault({ now: () => now, randomBytes: () => Buffer.alloc(24, ++nonce), maxEntries: 2 });
  const first = vault.issue(contract(now + 100), binding);
  now += 100;
  assert.throws(() => vault.consume(first.grant, binding), invalidGrant);
  vault.issue(contract(now + 1_000), binding);
  vault.issue(contract(now + 1_000), binding);
  assert.throws(() => vault.issue(contract(now + 1_000), binding), (error) => error.code === "file_transfer_grant_quota");
  vault.invalidateAll();
  assert.deepEqual(vault.snapshot(), { entries: 0 });
});

test("caps local lifetime and rejects collisions, stale contracts, and extensible bindings", () => {
  let now = 1_000;
  const vault = createTransferGrantVault({ now: () => now, randomBytes: () => Buffer.alloc(24, 1) });
  const issued = vault.issue(contract(now + 120_000), binding);
  assert.throws(() => vault.issue(contract(now + 1_000), binding), (error) => error.code === "file_transfer_grant_quota");
  now += 60_000;
  assert.throws(() => vault.consume(issued.grant, binding), invalidGrant);
  assert.throws(() => vault.issue(contract(now), binding), invalidGrant);
  assert.throws(() => vault.issue(contract(now + 1_000), { ...binding, extra: true }), /Invalid transfer grant binding/);
  assert.throws(() => createTransferGrantVault({ maxEntries: 33 }), /fixed safety limit/);
});

function invalidGrant(error) { return error.code === "file_transfer_grant_invalid"; }
