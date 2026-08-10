import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import electron from "electron";

import { bindNetworkPowerLifecycle } from "../src/network/power-lifecycle.mjs";

test("injected lifecycle events suspend, resume, and detach the active coordinator", () => {
  const powerEvents = new EventEmitter();
  const calls = [];
  let coordinator = { suspend: () => calls.push("first:suspend"), resume: () => calls.push("first:resume") };
  const dispose = bindNetworkPowerLifecycle({ powerEvents, getCoordinator: () => coordinator, onSuspend: () => calls.push("notifications:invalidate") });
  powerEvents.emit("suspend");
  coordinator = { suspend: () => calls.push("second:suspend"), resume: () => calls.push("second:resume") };
  powerEvents.emit("resume");
  dispose();
  powerEvents.emit("suspend");
  assert.deepEqual(calls, ["notifications:invalidate", "first:suspend", "second:resume"]);
});

test("real Electron powerMonitor drives the production lifecycle binding", { timeout: 15_000 }, async () => {
  const result = await runElectronFixture();
  const reportLine = result.stdout.split(/\r?\n/u).find((line) => line.includes('"kind":"yuance-power-lifecycle"'));
  assert.ok(reportLine, result.stderr || result.stdout);
  assert.deepEqual(JSON.parse(reportLine).calls, ["suspend", "resume"]);
});

test("production bundle configuration excludes lifecycle fixtures and test channels", async () => {
  const builder = await fs.readFile(new URL("../electron-builder.yml", import.meta.url), "utf8");
  const main = await fs.readFile(new URL("../src/main.mjs", import.meta.url), "utf8");
  assert.match(builder, /files:\s*\n(?:\s+-\s+[^\n]+\n)*\s+- src\/\*\*/u);
  assert.doesNotMatch(builder, /test\/\*\*/u);
  assert.doesNotMatch(main, /power-lifecycle-electron|yuance-power-lifecycle/u);
});

function runElectronFixture() {
  return new Promise((resolve, reject) => {
    const fixture = fileURLToPath(new URL("./fixtures/power-lifecycle-app", import.meta.url));
    const args = [fixture, ...(process.platform === "linux" ? ["--no-sandbox"] : [])];
    const child = spawn(electron, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Electron lifecycle fixture timed out: ${stderr || stdout}`));
    }, 10_000);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`Electron lifecycle fixture exited with ${signal || code}: ${stderr || stdout}`));
    });
  });
}
