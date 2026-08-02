import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadWindowsFileGuard } from "../src/files/windows-file-guard.mjs";
import { createDownloadTargetManager } from "../src/files/download-target.mjs";

function trace(stage) {
  if (process.env.YUANCE_WINDOWS_FILE_GUARD_TRACE === "1") process.stderr.write(`[windows-file-guard] ${stage}\n`);
}

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
  trace("spool-secured");
  const captured = await guard.captureFile({
    sourcePath: source,
    spoolRoot,
    nonce: "0123456789abcdef0123456789abcdef",
    maxBytes: 1024,
  });
  trace("capture-resolved");
  assert.equal(captured.byteSize, content.length);
  assert.equal(captured.sha256, crypto.createHash("sha256").update(content).digest("hex"));
  assert.deepEqual(await fs.readFile(captured.privatePath), content);
  trace("snapshot-read");
  const opened = await guard.openSnapshot({ spoolRoot, privatePath: captured.privatePath });
  trace("snapshot-opened");
  assert.equal(opened.identity.size, content.length);
  await opened.handle.close();
  trace("snapshot-handle-closed");
  await guard.removeSnapshot(spoolRoot, captured.privatePath);
  trace("snapshot-removed");
  await assert.rejects(fs.access(captured.privatePath), { code: "ENOENT" });
  assert.equal(await guard.cleanupSpool(spoolRoot), 0);
  trace("spool-cleaned");

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

test("real Windows native guard atomically creates and replaces downloads", { skip: process.platform !== "win32" && "Windows runner only" }, async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-native-download-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const targets = [path.join(root, "new.bin"), path.join(root, "existing.bin")];
  await fs.writeFile(targets[1], "existing-content");
  let index = 0;
  const manager = createDownloadTargetManager({
    dialog: { showSaveDialog: async () => ({ canceled: false, filePath: targets[index++] }) },
    windowsGuard: loadWindowsFileGuard(),
  });
  const content = Buffer.from("yuance-native-download-canary");

  for (const suggestedFilename of ["new.bin", "existing.bin"]) {
    const target = await manager.choose({ suggestedFilename });
    await target.handle.writeFile(content);
    await target.commit(content.length);
    await target.cleanup();
  }

  assert.deepEqual(await Promise.all(targets.map((target) => fs.readFile(target))), [content, content]);
  assert.deepEqual((await fs.readdir(root)).filter((name) => name.startsWith(".yuance-download-")), []);
});
