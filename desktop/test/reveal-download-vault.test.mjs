import assert from "node:assert/strict";
import test from "node:test";

import { createRevealDownloadVault } from "../src/files/reveal-download-vault.mjs";

const locator = Object.freeze({ privatePath: "/private/report.txt", identity: Object.freeze({ dev: "1", ino: "2", size: "3", mtimeNs: "4", ctimeNs: "5" }) });
const binding = Object.freeze({ profileEpoch: 3, authorizationVersion: 7, webContentsId: 9, frameRoutingId: 2, purpose: "reveal-download" });

test("issues opaque single-use reveal capabilities with exact binding", () => {
  const vault = createRevealDownloadVault({ now: () => 1_000, randomBytes: () => Buffer.alloc(24, 1) });
  const issued = vault.issue(locator, binding);
  assert.deepEqual(Object.keys(issued), ["capability"]);
  assert.equal(JSON.stringify(issued).includes("private"), false);
  assert.equal(vault.consume(issued.capability, binding), locator);
  assert.throws(() => vault.consume(issued.capability, binding), invalidReveal);
});

test("binding mismatch consumes capability and lifecycle invalidation clears state", () => {
  const vault = createRevealDownloadVault({ randomBytes: () => Buffer.alloc(24, 2) });
  const issued = vault.issue(locator, binding);
  assert.throws(() => vault.consume(issued.capability, { ...binding, webContentsId: 10 }), invalidReveal);
  assert.throws(() => vault.consume(issued.capability, binding), invalidReveal);
  vault.issue(locator, binding);
  vault.invalidateAll();
  assert.deepEqual(vault.snapshot(), { entries: 0 });
});

test("expires at the boundary and rejects extensible bindings and locators", () => {
  let now = 1_000;
  const vault = createRevealDownloadVault({ now: () => now, ttlMs: 100, randomBytes: () => Buffer.alloc(24, 3) });
  const issued = vault.issue(locator, binding);
  now += 100;
  assert.throws(() => vault.consume(issued.capability, binding), invalidReveal);
  assert.throws(() => vault.issue(locator, { ...binding, extra: true }), /binding/);
  assert.throws(() => vault.issue(Object.freeze({ ...locator, extra: true }), binding), /locator/);
});

function invalidReveal(error) { return error.code === "file_reveal_invalid"; }
