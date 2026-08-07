import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createPreviewSpool } from "../src/files/preview-spool.mjs";

const posixTest = process.platform === "win32" ? test.skip : test;

posixTest("streams verified preview bytes into a private durable snapshot", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-preview-spool-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const spool = createPreviewSpool({ rootDirectory: path.join(root, "private") });
  const bytes = Buffer.from("preview bytes");
  const snapshot = await spool.capture(new Blob([bytes]).stream(), { contentType: "application/pdf", expectedBytes: bytes.length, expectedSha256: createHash("sha256").update(bytes).digest("hex") });
  assert.equal(await fs.readFile(snapshot.privatePath, "utf8"), "preview bytes");
  assert.equal((await fs.stat(snapshot.privatePath)).mode & 0o777, 0o600);
  assert.deepEqual(spool.snapshot(), { totalBytes: bytes.length });
  await snapshot.remove();
  assert.deepEqual(spool.snapshot(), { totalBytes: 0 });
});

posixTest("rejects truncated and oversized streams without publishing partial files", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-preview-spool-invalid-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const spool = createPreviewSpool({ rootDirectory: path.join(root, "private"), maxFileBytes: 4, maxTotalBytes: 8 });
  await assert.rejects(spool.capture(new Blob(["123"]).stream(), { contentType: "text/plain", expectedBytes: 4 }), (error) => error.code === "preview_size_mismatch");
  await assert.rejects(spool.capture(new Blob(["12345"]).stream(), { contentType: "text/plain", expectedBytes: 4 }), (error) => error.code === "preview_size_mismatch");
  assert.deepEqual((await fs.readdir(spool.rootDirectory)).sort(), [".yuance-preview-spool-v1"]);
});

posixTest("refuses to claim an existing unmarked directory", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-preview-spool-unowned-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const privateRoot = path.join(root, "private");
  await fs.mkdir(privateRoot);
  await fs.writeFile(path.join(privateRoot, "keep.txt"), "foreign");
  const spool = createPreviewSpool({ rootDirectory: privateRoot });
  await assert.rejects(spool.initialize(), (error) => error.code === "preview_spool_unavailable");
  assert.equal(await fs.readFile(path.join(privateRoot, "keep.txt"), "utf8"), "foreign");
});
