import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { findUnpackedExecutable } from "../scripts/smoke-app-protocol.mjs";

test("finds only the platform-native unpacked executable", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-unpacked-executable-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const fixtures = [
    ["mac-arm64/元策.app/Contents/MacOS/元策", "darwin"],
    ["win-unpacked/元策.exe", "win32"],
    ["linux-unpacked/yuance", "linux"],
  ];
  for (const [relativePath] of fixtures) {
    const filePath = path.join(root, relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, "executable");
  }
  for (const [relativePath, platform] of fixtures) {
    assert.equal(await findUnpackedExecutable(root, platform), path.join(root, relativePath));
  }
});

test("rejects missing and ambiguous unpacked executables", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-unpacked-executable-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  await assert.rejects(findUnpackedExecutable(root, "linux"), /found 0/);
  for (const directory of ["linux-unpacked", "linux-arm64-unpacked"]) {
    await fs.mkdir(path.join(root, directory), { recursive: true });
    await fs.writeFile(path.join(root, directory, "yuance"), "executable");
  }
  await assert.rejects(findUnpackedExecutable(root, "linux"), /found 2/);
});
