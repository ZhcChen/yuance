import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import electron from "electron";

const directory = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-single-instance-smoke-"));
const firstMarker = path.join(directory, "first.lock");
const secondMarker = path.join(directory, "second.lock");
const thirdMarker = path.join(directory, "third.lock");
let first;

try {
  first = launch(firstMarker, true);
  await waitForFile(firstMarker);

  const second = launch(secondMarker, false);
  assert.equal(await exitCode(second), 2);
  await assert.rejects(fs.access(secondMarker), { code: "ENOENT" });

  first.kill("SIGKILL");
  await exitCode(first);
  first = undefined;

  const third = launch(thirdMarker, false);
  assert.equal(await exitCode(third), 0);
  assert.equal(await fs.readFile(thirdMarker, "utf8"), "acquired");
  process.stdout.write(`${JSON.stringify({ singleInstanceLock: "released-after-termination" })}\n`);
} finally {
  if (first && first.exitCode === null) first.kill("SIGKILL");
  await fs.rm(directory, { recursive: true, force: true });
}

function launch(markerPath, hold) {
  const args = [".", `--single-instance-lock-probe=${markerPath}`];
  if (hold) args.push("--hold-lock-probe");
  if (process.platform === "linux") args.push("--no-sandbox");
  return spawn(electron, args, {
    cwd: new URL("..", import.meta.url),
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function exitCode(child) {
  if (child.exitCode !== null) return Promise.resolve(child.exitCode);
  if (child.signalCode !== null) return Promise.resolve(-1);
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve(code ?? (signal ? -1 : 0)));
  });
}

async function waitForFile(filePath) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      await fs.access(filePath);
      return;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error("timed out waiting for the first Electron instance lock");
}
