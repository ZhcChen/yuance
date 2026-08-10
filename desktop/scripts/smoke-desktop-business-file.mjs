import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { findUnpackedExecutable } from "./smoke-app-protocol.mjs";
import { approveDeviceAuthorization } from "../test/support/browser-approval-driver.mjs";
import { buildRealApi, startRealApiFixture } from "../test/support/real-api-fixture.mjs";

const FORBIDDEN = /(?:https?:\/\/|[/\\](?:Users|home|tmp)[/\\]|Authorization|Bearer\s|Cookie|object_key|test-storage|yuance_(?:dat|drt|dc)_)/iu;

export function assertDesktopBusinessFileSmokeReport(report) {
  if (report?.kind !== "yuance-desktop-business-file-smoke" || !report.itemUploaded || !report.commentUploaded || !report.downloadsMatch || report.revealCount !== 2 || !report.cancelled || report.stageCount !== 8 || report.activeOperations !== 0 || report.spoolFiles !== 0 || FORBIDDEN.test(JSON.stringify(report))) throw new Error(`packaged business file smoke invariant failed: ${JSON.stringify(report)}`);
  return report;
}

export async function smokeDesktopBusinessFile(inputPath, { platform = process.platform } = {}) {
  await buildRealApi();
  const fixture = await startRealApiFixture({ seedDemo: true });
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-packaged-business-file-"));
  const outputDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist", "verification");
  await fs.mkdir(outputDirectory, { recursive: true });
  try {
    const session = await fixture.loginDemoAdmin();
    await fixture.activateTestStorage(session);
    const executable = await findUnpackedExecutable(inputPath, platform);
    const report = await runSmoke(executable, fixture.origin, profile, platform, async (value) => {
      if (value.kind === "yuance-desktop-business-file-user-code") await approveDeviceAuthorization({ origin: fixture.origin, userCode: value.userCode, session });
    });
    assertDesktopBusinessFileSmokeReport(report);
    const outputPath = path.join(outputDirectory, "desktop-business-file-smoke.json");
    await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    return Object.freeze({ executable, report, outputPath });
  } finally {
    try { await fixture.stop(); }
    finally {
      await fs.rm(profile, { recursive: true, force: true });
      await fs.writeFile(path.join(outputDirectory, "desktop-business-file-cleanup.json"), `${JSON.stringify({ kind: "yuance-desktop-business-file-cleanup", apiProcess: "stopped", profile: "removed" }, null, 2)}\n`, { mode: 0o600 });
    }
  }
}

function runSmoke(executable, origin, profile, platform, onValue) {
  return new Promise((resolve, reject) => {
    const args = [`--desktop-business-file-smoke-origin=${origin}`, `--desktop-business-file-smoke-profile=${profile}`, ...(platform === "linux" ? ["--no-sandbox", "--password-store=gnome-libsecret"] : [])];
    const child = spawn(executable, args, { cwd: path.dirname(executable), stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = ""; let report; let sideEffect = Promise.resolve(); let settled = false;
    const finish = (callback) => { if (settled) return; settled = true; clearTimeout(timer); callback(); };
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; const lines = stdout.split(/\r?\n/u); stdout = lines.pop() || ""; for (const line of lines) { try { const value = JSON.parse(line); if (value.kind === "yuance-desktop-business-file-smoke") report = value; sideEffect = sideEffect.then(() => onValue(value)); } catch {} } });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => child.kill("SIGKILL"), 75_000);
    child.once("error", (error) => finish(() => reject(error)));
    child.once("exit", async (code, signal) => { try { await sideEffect; } catch (error) { finish(() => reject(error)); return; } finish(() => code === 0 && !signal && report ? resolve(report) : reject(new Error(`packaged business file smoke failed (${signal || code}): ${stderr || stdout}`))); });
  });
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const inputPath = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist"));
  smokeDesktopBusinessFile(inputPath).then(({ executable }) => console.log(`Verified packaged business file flow with ${executable}.`)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
