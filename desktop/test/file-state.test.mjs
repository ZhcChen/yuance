import assert from "node:assert/strict";
import test from "node:test";

import { createFileStateController } from "../src/ipc/file-state.mjs";

test("file state aborts operations before invalidating grants and snapshots", async () => {
  const calls = [];
  const state = createFileStateController({
    registry: { abortAll: () => calls.push("abort") },
    grantVault: { invalidateAll: () => calls.push("grant") },
    revealVault: { invalidateAll: () => calls.push("reveal") },
    fileVault: { invalidateAll: async () => calls.push("file") },
  });
  await state.invalidateAll();
  assert.deepEqual(calls, ["abort", "grant", "reveal", "file"]);
});

test("file state serializes asynchronous snapshot cleanup", async () => {
  let release;
  const calls = [];
  const state = createFileStateController({
    registry: { abortAll() {} }, grantVault: { invalidateAll() {} }, revealVault: { invalidateAll() {} },
    fileVault: { invalidateAll: async () => { calls.push("start"); await new Promise((resolve) => { release = resolve; }); calls.push("end"); } },
  });
  const first = state.invalidateAll();
  const second = state.invalidateAll();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ["start"]);
  release(); await first;
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ["start", "end", "start"]);
  release(); await second;
});
