import assert from "node:assert/strict";
import test from "node:test";

import { createPreviewCapabilityVault } from "../src/files/preview-capability-vault.mjs";

const binding = Object.freeze({ profileEpoch: 3, authorizationVersion: 7, webContentsId: 9, frameRoutingId: 2 });

function snapshot() {
  let removed = 0;
  return {
    value: Object.freeze({ privatePath: "/private/preview.bin", contentType: "application/pdf", byteSize: 12, remove: async () => { removed += 1; } }),
    removed: () => removed,
  };
}

test("issues an opaque bound app preview source without leaking private paths", async () => {
  const entry = snapshot();
  const vault = createPreviewCapabilityVault({ randomBytes: () => Buffer.alloc(24, 7) });
  const issued = vault.issue(entry.value, binding);
  assert.match(issued.capability, /^ypv_[A-Za-z0-9_-]{32}$/u);
  assert.equal(issued.source, `app://yuance/.preview/${issued.capability}`);
  assert.equal(JSON.stringify(issued).includes("/private/"), false);
  assert.equal(vault.resolve(issued.capability, binding).privatePath, "/private/preview.bin");
  vault.release(issued.capability);
  await vault.invalidateAll();
  assert.equal(entry.removed(), 1);
});

test("binding mismatch and expiry invalidate and remove snapshots", async () => {
  let now = 1_000;
  const first = snapshot();
  const second = snapshot();
  const vault = createPreviewCapabilityVault({ now: () => now, ttlMs: 100, randomBytes: (() => { let value = 1; return () => Buffer.alloc(24, value++); })() });
  const one = vault.issue(first.value, binding);
  assert.throws(() => vault.resolve(one.capability, { ...binding, authorizationVersion: 8 }), (error) => error.code === "preview_capability_invalid");
  const two = vault.issue(second.value, binding);
  now = 1_101;
  assert.throws(() => vault.resolve(two.capability, binding), (error) => error.code === "preview_capability_invalid");
  await vault.invalidateAll();
  assert.equal(first.removed(), 1);
  assert.equal(second.removed(), 1);
});
