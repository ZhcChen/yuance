import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

import { openRegularFile, sameFileIdentity } from "../src/files/file-identity.mjs";

const execFileAsync = promisify(execFile);

test("opens a regular file and captures stable private identity", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-file-identity-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, "report.txt");
  await fs.writeFile(source, "stable");

  const opened = await openRegularFile({ filePath: source });
  t.after(() => opened.handle.close());
  assert.equal(opened.identity.size, 6);
  assert.equal(sameFileIdentity(opened.identity, await opened.currentIdentity()), true);
  assert.deepEqual(Object.keys(opened).sort(), ["currentIdentity", "handle", "identity"]);
});

test("rejects directories and symbolic links without following them", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-file-identity-link-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, "source.txt");
  const link = path.join(root, "link.txt");
  await fs.writeFile(source, "secret");
  await fs.symlink(source, link);

  await assert.rejects(openRegularFile({ filePath: root }), (error) => error.code === "file_not_regular");
  await assert.rejects(openRegularFile({ filePath: link }), (error) => error.code === "file_link_not_allowed");
});

test("detects size or identity changes after opening", () => {
  const baseline = { dev: "1", ino: "2", size: 4, mtimeNs: "3", ctimeNs: "4" };
  assert.equal(sameFileIdentity(baseline, baseline), true);
  assert.equal(sameFileIdentity(baseline, { ...baseline, size: 5 }), false);
  assert.equal(sameFileIdentity(baseline, { ...baseline, ino: "9" }), false);
});

test("fails closed when no-follow support requires the native guard", async () => {
  await assert.rejects(openRegularFile({ filePath: "/not-opened", platform: "win32" }), (error) => error.code === "file_native_guard_required");
  await assert.rejects(openRegularFile({ filePath: "/not-opened", platform: "linux", constants: { O_RDONLY: 0 } }), (error) => error.code === "file_native_guard_required");
});

test("rejects POSIX device and FIFO inputs", { skip: process.platform === "win32" && "POSIX runner only" }, async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-file-special-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const fifo = path.join(root, "pipe");
  await execFileAsync("mkfifo", [fifo]);
  await assert.rejects(openRegularFile({ filePath: fifo }), (error) => error.code === "file_not_regular");
  await assert.rejects(openRegularFile({ filePath: "/dev/null" }), (error) => error.code === "file_not_regular");
});
