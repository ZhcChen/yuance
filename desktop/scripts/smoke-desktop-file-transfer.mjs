import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { findUnpackedExecutable } from "./smoke-app-protocol.mjs";
import { approveDeviceAuthorization } from "../test/support/browser-approval-driver.mjs";
import { buildRealApi, startRealApiFixture } from "../test/support/real-api-fixture.mjs";

const FORBIDDEN = /(?:https?:\/\/|[/\\](?:Users|home|tmp)[/\\]|Authorization|Bearer\s|Cookie|yuance_(?:dat|drt|dc)_)/iu;

export function assertDesktopFileSmokeReport(report) {
  if (report?.kind !== "yuance-desktop-file-smoke" || !report.upload || !report.download || !report.hashMatch || !report.staleCapabilityRejected || report.byteSize !== 34 || report.activeOperations !== 0 || report.spoolFiles !== 0 || FORBIDDEN.test(JSON.stringify(report))) throw new Error(`packaged file smoke invariant failed: ${JSON.stringify(report)}`);
  return report;
}

export async function smokeDesktopFileTransfer(inputPath, { platform = process.platform } = {}) {
  await buildRealApi();
  const fixture = await startRealApiFixture();
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-packaged-file-"));
  const outputDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist", "verification");
  await fs.mkdir(outputDirectory, { recursive: true });
  try {
    const session = await fixture.bootstrapAdmin();
    await fixture.activateTestStorage(session);
    const executable = await findUnpackedExecutable(inputPath, platform);
    await runPhase(executable, "authorize", fixture.origin, profile, platform, async (value) => {
      if (value.kind === "yuance-desktop-file-user-code") await approveDeviceAuthorization({ origin: fixture.origin, userCode: value.userCode, session });
    });
    const report = await runPhase(executable, "verify", fixture.origin, profile, platform, async (value) => {
      if (value.kind === "yuance-desktop-file-user-code") await approveDeviceAuthorization({ origin: fixture.origin, userCode: value.userCode, session });
    });
    assertDesktopFileSmokeReport(report);
    const outputPath = path.join(outputDirectory, "desktop-file-transfer-smoke.json");
    await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    return Object.freeze({ executable, report, outputPath });
  } finally {
    try { await fixture.stop(); }
    finally {
      await fs.rm(profile, { recursive: true, force: true });
      await fs.writeFile(path.join(outputDirectory, "desktop-file-transfer-cleanup.json"), `${JSON.stringify({ kind: "yuance-desktop-file-cleanup", apiProcess: "stopped", profile: "removed" }, null, 2)}\n`, { mode: 0o600 });
    }
  }
}

function runPhase(executable, phase, origin, profile, platform, onValue = async () => {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [`--desktop-file-smoke-phase=${phase}`, `--desktop-file-smoke-origin=${origin}`, `--desktop-file-smoke-profile=${profile}`, ...(platform === "linux" ? ["--no-sandbox", "--password-store=gnome-libsecret"] : [])], { cwd: path.dirname(executable), stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = ""; let report; let sideEffect = Promise.resolve(); let settled = false;
    const finish = (callback) => { if (settled) return; settled = true; clearTimeout(timer); callback(); };
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; const lines = stdout.split(/\r?\n/u); stdout = lines.pop() || ""; for (const line of lines) { try { const value = JSON.parse(line); report = value; sideEffect = sideEffect.then(() => onValue(value)); } catch {} } });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => child.kill("SIGKILL"), 45_000);
    child.once("error", (error) => finish(() => reject(error)));
    child.once("exit", async (code, signal) => { try { await sideEffect; } catch (error) { finish(() => reject(error)); return; } finish(() => code === 0 && !signal && report ? resolve(report) : reject(new Error(`packaged file ${phase} failed (${signal || code}): ${stderr || stdout}`))); });
  });
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const inputPath = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist"));
  smokeDesktopFileTransfer(inputPath).then(({ executable }) => console.log(`Verified desktop file transfer smoke with ${executable}.`)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
