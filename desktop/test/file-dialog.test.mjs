import assert from "node:assert/strict";
import test from "node:test";

import { createFileDialog } from "../src/files/file-dialog.mjs";

const binding = { profileEpoch: 1, webContentsId: 2, frameRoutingId: 3, purpose: "upload" };

test("uses a fixed single-file dialog and returns only vault metadata", async () => {
  const calls = [];
  const privatePath = "/Users/private/计划.txt";
  const snapshot = { privatePath: "/spool/private", filename: "计划.txt", contentType: "text/plain; charset=utf-8", byteSize: 4, sha256: "a".repeat(64), remove: async () => {} };
  const adapter = createFileDialog({
    dialog: { showOpenDialog: async (...args) => { calls.push(args); return { canceled: false, filePaths: [privatePath] }; } },
    spool: { capture: async (...args) => { calls.push(args); return snapshot; } },
    vault: { issue: (value, valueBinding) => { assert.equal(value, snapshot); assert.deepEqual(valueBinding, binding); return { capability: "yfc_public", filename: value.filename, contentType: value.contentType, byteSize: value.byteSize }; } },
  });
  const window = {};
  const result = await adapter.choose({ window, binding });
  assert.deepEqual(result, { capability: "yfc_public", filename: "计划.txt", contentType: "text/plain; charset=utf-8", byteSize: 4 });
  assert.equal(JSON.stringify(result).includes("/Users/"), false);
  assert.deepEqual(calls[0], [window, { title: "选择文件", properties: ["openFile", "dontAddToRecent"] }]);
  assert.deepEqual(calls[1], [privatePath, { filename: "计划.txt", contentType: "text/plain; charset=utf-8" }]);
});

test("cancel does not touch spool or vault", async () => {
  let touched = false;
  const adapter = createFileDialog({
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    spool: { capture: async () => { touched = true; } },
    vault: { issue: () => { touched = true; } },
  });
  assert.equal(await adapter.choose({ window: {}, binding }), null);
  assert.equal(touched, false);
});

test("removes the snapshot when capability issuance fails", async () => {
  let removed = 0;
  const adapter = createFileDialog({
    dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: ["/tmp/a.bin"] }) },
    spool: { capture: async () => ({ privatePath: "/spool/a", filename: "a.bin", contentType: "application/octet-stream", byteSize: 1, sha256: "a".repeat(64), remove: async () => { removed += 1; } }) },
    vault: { issue: () => { throw Object.assign(new Error("quota"), { code: "file_capability_quota" }); } },
  });
  await assert.rejects(adapter.choose({ window: {}, binding }), (error) => error.code === "file_capability_quota");
  assert.equal(removed, 1);
});

test("maps native failures to stable errors without exposing paths", async () => {
  const adapter = createFileDialog({
    dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: ["/private/accounting.txt"] }) },
    spool: { capture: async () => { throw Object.assign(new Error("ENOENT: /private/accounting.txt"), { code: "ENOENT" }); } },
    vault: { issue: () => assert.fail("vault must not be reached") },
  });
  await assert.rejects(adapter.choose({ window: {}, binding }), (error) => {
    assert.equal(error.code, "file_unavailable");
    assert.equal(error.message.includes("/private/"), false);
    return true;
  });
});
