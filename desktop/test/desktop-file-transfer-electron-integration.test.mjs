import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { assertDesktopFileSmokeReport } from "../scripts/smoke-desktop-file-transfer.mjs";
import { verifyDesktopFileTransferArtifacts } from "../scripts/verify-desktop-file-transfer-artifacts.mjs";

const valid = Object.freeze({ kind: "yuance-desktop-file-smoke", upload: true, download: true, byteSize: 34, hashMatch: true, staleCapabilityRejected: true, activeOperations: 0, spoolFiles: 0 });

test("accepts only redacted complete packaged file reports", () => {
  assert.deepEqual(assertDesktopFileSmokeReport(valid), valid);
  assert.throws(() => assertDesktopFileSmokeReport({ ...valid, path: "/Users/private/canary.txt" }), /invariant failed/);
  assert.throws(() => assertDesktopFileSmokeReport({ ...valid, activeOperations: 1 }), /invariant failed/);
});

test("verifies packaged file smoke and cleanup artifacts", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-file-artifacts-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, "desktop-file-transfer-smoke.json"), JSON.stringify(valid));
  await fs.writeFile(path.join(root, "desktop-file-transfer-cleanup.json"), JSON.stringify({ kind: "yuance-desktop-file-cleanup", apiProcess: "stopped", profile: "removed" }));
  const result = await verifyDesktopFileTransferArtifacts(root);
  assert.deepEqual(result.smoke, valid);
});

test("production file smoke exposes no renderer or preload channel", async () => {
  const [main, preload, commands] = await Promise.all([
    fs.readFile(new URL("../src/main.mjs", import.meta.url), "utf8"),
    fs.readFile(new URL("../src/preload.cjs", import.meta.url), "utf8"),
    fs.readFile(new URL("../src/ipc/file-commands.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(main, /desktop-file-smoke-phase/u);
  assert.doesNotMatch(preload, /desktop-file-smoke/u);
  assert.doesNotMatch(commands, /desktop-file-smoke/u);
});
