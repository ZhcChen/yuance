import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createDownloadTargetManager, sanitizeDownloadFilename } from "../src/files/download-target.mjs";

test("sanitizes traversal, reserved names, ADS, controls, and oversized suggestions", () => {
  assert.equal(sanitizeDownloadFilename("../report.txt"), "report.txt");
  assert.equal(sanitizeDownloadFilename("..\\report.txt"), "report.txt");
  for (const value of ["NUL", "con.txt", "report.txt:secret", "..", "\u0000"]) assert.equal(sanitizeDownloadFilename(value), "download");
  assert.ok(Buffer.byteLength(sanitizeDownloadFilename("测".repeat(200) + ".txt")) <= 240);
});

test("uses a fixed save dialog and cancellation creates no target", async () => {
  const calls = [];
  const manager = createDownloadTargetManager({ dialog: { showSaveDialog: async (...args) => { calls.push(args); return { canceled: true }; } } });
  assert.equal(await manager.choose({ window: {}, suggestedFilename: "../report.txt" }), null);
  assert.deepEqual(calls[0][1], { title: "保存文件", defaultPath: "report.txt", properties: ["dontAddToRecent", "showOverwriteConfirmation"] });
});

test("returns the sanitized final dialog filename instead of the suggestion", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-download-name-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const manager = createDownloadTargetManager({ dialog: { showSaveDialog: async () => ({ canceled: false, filePath: path.join(root, "chosen.txt") }) } });
  const target = await manager.choose({ suggestedFilename: "suggested.txt" });
  assert.equal(target.publicFilename, "chosen.txt");
  await target.cleanup();
});

test("atomically creates a new file and replaces an existing regular file", async (t) => {
  for (const existing of [false, true]) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-download-target-"));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const targetPath = path.join(root, "report.txt");
    if (existing) await fs.writeFile(targetPath, "original");
    const manager = createDownloadTargetManager({ dialog: { showSaveDialog: async () => ({ canceled: false, filePath: targetPath }) }, randomBytes: () => Buffer.alloc(16, existing ? 2 : 1), platform: "linux" });
    const target = await manager.choose({ suggestedFilename: "report.txt" });
    await target.handle.writeFile("replacement");
    await target.commit(11);
    await target.cleanup();
    assert.equal(await fs.readFile(targetPath, "utf8"), "replacement");
    assert.deepEqual(await fs.readdir(root), ["report.txt"]);
  }
});

test("rejects symlinks, directories, and target replacement without damaging replacement", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-download-target-race-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const targetPath = path.join(root, "report.txt");
  const other = path.join(root, "other.txt");
  await fs.writeFile(other, "other");
  const managerFor = (filePath) => createDownloadTargetManager({ dialog: { showSaveDialog: async () => ({ canceled: false, filePath }) }, randomBytes: () => Buffer.alloc(16, 3), platform: "linux" });
  await fs.symlink(other, targetPath);
  await assert.rejects(managerFor(targetPath).choose({ suggestedFilename: "report.txt" }), (error) => error.code === "file_download_target_invalid");
  await fs.unlink(targetPath);
  await fs.mkdir(targetPath);
  await assert.rejects(managerFor(targetPath).choose({ suggestedFilename: "report.txt" }), (error) => error.code === "file_download_target_invalid");
  await fs.rm(targetPath, { recursive: true });
  await fs.writeFile(targetPath, "original");
  const target = await managerFor(targetPath).choose({ suggestedFilename: "report.txt" });
  await target.handle.writeFile("downloaded");
  await fs.rename(targetPath, path.join(root, "original.txt"));
  await fs.writeFile(targetPath, "attacker replacement");
  await assert.rejects(target.commit(10), (error) => error.code === "file_download_target_changed");
  await target.cleanup();
  assert.equal(await fs.readFile(targetPath, "utf8"), "attacker replacement");
  assert.equal(await fs.readFile(path.join(root, "original.txt"), "utf8"), "original");
});

test("rejects non-absolute dialog output and Windows reserved path forms", async () => {
  const manager = createDownloadTargetManager({ dialog: { showSaveDialog: async () => ({ canceled: false, filePath: "relative.txt" }) } });
  await assert.rejects(manager.choose({ suggestedFilename: "report.txt" }), (error) => error.code === "file_download_target_invalid");
  assert.throws(() => createDownloadTargetManager({ dialog: { showSaveDialog() {} }, platform: "win32" }), (error) => error.code === "file_native_guard_required");
});
