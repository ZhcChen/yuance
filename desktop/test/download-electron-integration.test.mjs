import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import electron from "electron";

import { startNetworkFixture } from "./support/network-fixture.mjs";

test("real Electron session downloads new and replacement files without ambient credentials", { timeout: 30_000 }, async (t) => {
  const fixture = await startNetworkFixture();
  t.after(() => fixture.close());
  const result = await runElectronDownload(fixture.targetOrigin);
  const content = Buffer.from("yuance-electron-download-canary");
  const sha256 = crypto.createHash("sha256").update(content).digest("hex");

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.results, [
    { status: "completed", byteSize: content.length, filename: "new-download.bin" },
    { status: "completed", byteSize: content.length, filename: "existing-download.bin" },
  ]);
  assert.deepEqual(result.hashes, [sha256, sha256]);
  assert.deepEqual(result.temporaryFiles, []);
  assert.deepEqual(result.observations, [
    { method: "GET", phase: "transfer", status: 200 },
    { method: "GET", phase: "transfer", status: 200 },
  ]);
  assert.deepEqual(fixture.state.downloadHeaders, [
    { authorization: "", cookie: "" },
    { authorization: "", cookie: "" },
  ]);
});

async function runElectronDownload(origin) {
  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-download-electron-"));
  try {
    const driverApp = fileURLToPath(new URL("./support/network-electron-app/", import.meta.url));
    const args = [driverApp, "--mode=development", `--origin=${origin}`, `--user-data-path=${userDataPath}`, "--seed-cookie", "--download", ...(process.platform === "linux" ? ["--no-sandbox"] : [])];
    const output = await spawnAndCollect(electron, args);
    return JSON.parse(output.stdout.trim().split("\n").at(-1));
  } finally {
    await fs.rm(userDataPath, { recursive: true, force: true });
  }
}

function spawnAndCollect(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: new URL("..", import.meta.url), stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    const timeout = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Electron download scenario timed out")); }, 20_000);
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`Electron download exited with ${signal || code}: ${stderr || stdout}`));
    });
  });
}
