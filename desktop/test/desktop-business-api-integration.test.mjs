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

test("real API and Electron complete the D2 business read and mutation matrix", { timeout: 120_000 }, async (t) => {
  await buildRealApi();
  const fixture = await startRealApiFixture({ seedDemo: true });
  t.after(() => fixture.stop());
  const session = await fixture.loginDemoAdmin();
  await fixture.prepareDemoDesktopMember(session);
  await fixture.prepareDemoProjectResources(session);
  const report = await runElectronBusinessApi(fixture.origin, (userCode) => approveDeviceAuthorization({ origin: fixture.origin, userCode, session }));
  assert.equal(report.kind, "yuance-business-api-result");
  assert.equal(report.user, true);
  assert.equal(report.profile, true);
  assert.equal(report.search, true);
  assert.equal(report.topbar, true);
  assert.ok(report.projects >= 1);
  assert.equal(report.currentProject, true);
  assert.ok(report.notifications >= 0);
  assert.ok(report.workItems >= 1);
  assert.equal(report.detail, true);
  assert.ok(report.comments >= 1);
  assert.ok(report.attachments >= 0);
  assert.ok(report.commentAttachments >= 0);
  assert.equal(report.commentDraftLifecycle, true);
  assert.equal(report.projectSelected, true);
  assert.equal(report.projectCreated, true);
  assert.equal(report.projectManaged, true);
  assert.equal(report.projectCycleManaged, true);
  assert.equal(report.projectResourcesReadAndUnlocked, true);
  assert.equal(report.projectResourcesManaged, true);
  assert.equal(report.profileUpdated, true);
  assert.equal(report.accountSecurity, true);
  assert.equal(report.workItemUpdated, true);
  assert.equal(report.workItemHandedOff, true);
  assert.equal(report.commentCreated, true);
  assert.equal(report.commentUpdated, true);
  assert.equal(report.mutationsPersisted, true);
  assert.equal(report.notificationRead, true);
  assert.equal(report.notificationsReadAll, true);
  assert.equal(report.sseRefresh, true);
  assert.equal(report.releaseVersion, true);
  assert.equal(report.foregroundSuppressed, true);
  assert.equal(report.mutationsExecutedOnce, true);
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes("yuance_dat_"), false);
  assert.equal(serialized.includes("Desktop mutation integration"), false);
  assert.equal(serialized.includes("Desktop project integration"), false);
  assert.equal(serialized.includes("Desktop profile integration"), false);
  assert.equal(serialized.includes("Desktop integration token"), false);
  assert.equal(serialized.includes("yuance_pat_"), false);
  assert.equal(serialized.includes("Desktop comment integration"), false);
  assert.equal(serialized.includes(fixture.origin), false);
  assert.equal(serialized.includes(fixture.root), false);
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
