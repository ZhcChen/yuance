import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import electron from "electron";

import { startNetworkFixture } from "./support/network-fixture.mjs";

test("real Electron session streams upload without ambient credentials", { timeout: 30_000 }, async (t) => {
  const fixture = await startNetworkFixture();
  t.after(() => fixture.close());
  const result = await runElectronUpload(fixture.targetOrigin);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.result, { status: "completed", byteSize: 29 });
  assert.equal(result.removed, true);
  assert.deepEqual(result.observations, [{ method: "PUT", phase: "transfer", status: 204 }]);
  assert.equal(fixture.state.uploadBodies.length, 1);
  assert.equal(fixture.state.uploadBodies[0].toString(), "yuance-electron-upload-canary");
  assert.deepEqual(fixture.state.uploadHeaders[0], { authorization: "", cookie: "", contentType: "application/octet-stream" });
});

async function runElectronUpload(origin) {
  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-upload-electron-"));
  try {
    const driverApp = fileURLToPath(new URL("./support/network-electron-app/", import.meta.url));
    const args = [driverApp, "--mode=development", `--origin=${origin}`, `--user-data-path=${userDataPath}`, "--upload", ...(process.platform === "linux" ? ["--no-sandbox"] : [])];
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
    const timeout = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Electron upload scenario timed out")); }, 20_000);
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`Electron upload exited with ${signal || code}: ${stderr || stdout}`));
    });
  });
}
