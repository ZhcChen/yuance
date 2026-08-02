import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadWindowsFileGuard } from "../src/files/windows-file-guard.mjs";

test("real Windows native guard captures, protects, and cleans snapshots", { skip: process.platform !== "win32" && "Windows runner only" }, async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-native-file-guard-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const sourceRoot = path.join(root, "source");
  const spoolRoot = path.join(root, "spool");
  await fs.mkdir(sourceRoot);
  const source = path.join(sourceRoot, "canary.txt");
  const content = Buffer.from("yuance-native-file-guard-canary");
  await fs.writeFile(source, content);
  const guard = loadWindowsFileGuard();

  await guard.secureSpoolRoot(spoolRoot);
  const captured = await guard.captureFile({
    sourcePath: source,
    spoolRoot,
    nonce: "0123456789abcdef0123456789abcdef",
    maxBytes: 1024,
  });
  assert.equal(captured.byteSize, content.length);
  assert.equal(captured.sha256, crypto.createHash("sha256").update(content).digest("hex"));
  assert.deepEqual(await fs.readFile(captured.privatePath), content);
  await guard.removeSnapshot(spoolRoot, captured.privatePath);
  await assert.rejects(fs.access(captured.privatePath), { code: "ENOENT" });
  assert.equal(await guard.cleanupSpool(spoolRoot), 0);

  const junction = path.join(root, "source-junction");
  await fs.symlink(sourceRoot, junction, "junction");
  await assert.rejects(guard.captureFile({
    sourcePath: path.join(junction, "canary.txt"),
    spoolRoot,
    nonce: "abcdef0123456789abcdef0123456789",
    maxBytes: 1024,
  }), (error) => error.code === "file_link_not_allowed");
});

test("real Windows native guard refuses an existing unmarked spool", { skip: process.platform !== "win32" && "Windows runner only" }, async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-native-file-unmarked-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const guard = loadWindowsFileGuard();
  await assert.rejects(guard.secureSpoolRoot(root), (error) => error.code === "file_spool_unavailable");
});
