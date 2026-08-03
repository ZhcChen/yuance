import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import electron from "electron";

import { approveDeviceAuthorization } from "./support/browser-approval-driver.mjs";
import { buildRealApi, startRealApiFixture } from "./support/real-api-fixture.mjs";

test("real API and Electron complete the D2 read-only business matrix", { timeout: 60_000 }, async (t) => {
  await buildRealApi();
  const fixture = await startRealApiFixture({ seedDemo: true });
  t.after(() => fixture.stop());
  const session = await fixture.loginDemoAdmin();
  const report = await runElectronBusinessApi(fixture.origin, (userCode) => approveDeviceAuthorization({ origin: fixture.origin, userCode, session }));
  assert.equal(report.kind, "yuance-business-api-result");
  assert.equal(report.user, true);
  assert.equal(report.topbar, true);
  assert.ok(report.projects >= 1);
  assert.equal(report.currentProject, true);
  assert.ok(report.notifications >= 0);
  assert.ok(report.workItems >= 1);
  assert.equal(report.detail, true);
  assert.ok(report.comments >= 1);
  assert.ok(report.attachments >= 0);
  assert.ok(report.commentAttachments >= 0);
  assert.equal(JSON.stringify(report).includes("yuance_dat_"), false);
});

async function runElectronBusinessApi(origin, approve) {
  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-business-api-electron-"));
  try {
    const driverApp = fileURLToPath(new URL("./support/network-electron-app/", import.meta.url));
    const args = [driverApp, "--mode=development", `--origin=${origin}`, `--user-data-path=${userDataPath}`, "--business-api", ...(process.platform === "linux" ? ["--no-sandbox", "--password-store=gnome-libsecret"] : [])];
    return await spawnAndApprove(electron, args, approve);
  } finally {
    await fs.rm(userDataPath, { recursive: true, force: true });
  }
}

function spawnAndApprove(command, args, approve) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: new URL("..", import.meta.url), stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = ""; let report; let lastValue; const stages = []; let sideEffect = Promise.resolve(); let settled = false;
    const finish = (callback) => { if (settled) return; settled = true; clearTimeout(timer); callback(); };
    child.stdout.setEncoding("utf8").on("data", (chunk) => {
      stdout += chunk;
      const lines = stdout.split(/\r?\n/u); stdout = lines.pop() || "";
      for (const line of lines) {
        try {
          const value = JSON.parse(line);
          lastValue = value;
          if (value.kind === "yuance-business-stage") stages.push(value.stage);
          if (value.kind === "yuance-business-user-code") sideEffect = sideEffect.then(() => approve(value.userCode));
          if (value.kind === "yuance-business-api-result") report = value;
        } catch {}
      }
    });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => child.kill("SIGKILL"), 45_000);
    child.once("error", (error) => finish(() => reject(error)));
    child.once("exit", async (code, signal) => {
      await sideEffect.catch((error) => finish(() => reject(error)));
      finish(() => code === 0 && !signal && report ? resolve(report) : reject(new Error(`Electron business API failed (${signal || code}, stages=${stages.join(",")}): ${JSON.stringify(lastValue) || stderr || stdout}`)));
    });
  });
}
