import assert from "node:assert/strict";
import test from "node:test";

import { createFileSpool } from "../src/files/file-spool.mjs";
import { loadWindowsFileGuard } from "../src/files/windows-file-guard.mjs";

test("loads only the exact Windows native binding and sanitizes native errors", async () => {
  const calls = [];
  const native = {
    secureWindowsPrivateDirectory: async (...args) => calls.push(["private", ...args]),
    secureWindowsSpoolRoot: async (...args) => calls.push(["secure", ...args]),
    cleanupWindowsSpool: async () => 2,
    captureWindowsFile: async () => { throw new Error("ERR_FILE_GUARD_REPARSE_POINT: C:\\private"); },
    removeWindowsSnapshot: async () => {},
    verifyWindowsSnapshotHandle: async () => {},
    commitWindowsDownload: async (...args) => calls.push(["commit", ...args]),
  };
  const guard = loadWindowsFileGuard({ platform: "win32", arch: "x64", nativeDirectory: "C:\\native", requireImpl: (candidate) => {
    assert.equal(candidate, "C:\\native\\index.win32-x64-msvc.node");
    return native;
  } });
  await guard.securePrivateDirectory("C:\\credentials");
  await guard.secureSpoolRoot("C:\\spool");
  await guard.commitDownload({ targetPath: "C:\\target" });
  await assert.rejects(guard.captureFile({}), (error) => {
    assert.equal(error.code, "file_link_not_allowed");
    assert.equal(error.message.includes("C:\\private"), false);
    return true;
  });
  assert.deepEqual(calls, [["private", "C:\\credentials"], ["secure", "C:\\spool"], ["commit", { targetPath: "C:\\target" }]]);
});

test("Windows spool fails closed without native guard", () => {
  assert.throws(() => createFileSpool({ rootDirectory: "C:\\spool", platform: "win32" }), (error) => error.code === "file_native_guard_required");
});

test("Windows spool delegates capture, cleanup, and removal to native guard", async () => {
  const calls = [];
  const guard = {
    secureSpoolRoot: async (root) => calls.push(["secure", root]),
    cleanupSpool: async (root) => { calls.push(["cleanup", root]); return 1; },
    captureFile: async (input) => { calls.push(["capture", input]); return { privatePath: "C:\\spool\\yuance-snapshot-fixed.bin", byteSize: 4, sha256: "a".repeat(64) }; },
    removeSnapshot: async (...args) => calls.push(["remove", ...args]),
  };
  const spool = createFileSpool({ rootDirectory: "C:\\spool", platform: "win32", windowsGuard: guard, randomBytes: () => Buffer.alloc(16, 1), maxFileBytes: 8, maxTotalBytes: 8 });
  assert.deepEqual(await spool.cleanupOrphans(), { removed: 1 });
  const snapshot = await spool.capture("C:\\source\\file.bin", { filename: "file.bin" });
  assert.equal(snapshot.byteSize, 4);
  await snapshot.remove();
  assert.deepEqual(calls, [
    ["secure", "C:\\spool"],
    ["cleanup", "C:\\spool"],
    ["capture", { sourcePath: "C:\\source\\file.bin", spoolRoot: "C:\\spool", nonce: "01010101010101010101010101010101", maxBytes: 8 }],
    ["remove", "C:\\spool", "C:\\spool\\yuance-snapshot-fixed.bin"],
  ]);
});

test("Windows spool removes a native snapshot returned with invalid metadata", async () => {
  const removals = [];
  const guard = {
    secureSpoolRoot: async () => {},
    cleanupSpool: async () => 0,
    captureFile: async () => ({ privatePath: "C:\\spool\\yuance-snapshot-invalid.bin", byteSize: 9, sha256: "invalid" }),
    removeSnapshot: async (...args) => removals.push(args),
  };
  const spool = createFileSpool({ rootDirectory: "C:\\spool", platform: "win32", windowsGuard: guard, randomBytes: () => Buffer.alloc(16, 1), maxFileBytes: 8, maxTotalBytes: 8 });
  await assert.rejects(spool.capture("C:\\source\\file.bin"), (error) => error.code === "file_spool_write_failed");
  assert.deepEqual(removals, [["C:\\spool", "C:\\spool\\yuance-snapshot-invalid.bin"]]);
});
