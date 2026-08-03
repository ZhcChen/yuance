import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { smokeDesktopNetwork } from "./smoke-desktop-network.mjs";
import { smokeDesktopFileTransfer } from "./smoke-desktop-file-transfer.mjs";
import { smokeDesktopBusinessFile } from "./smoke-desktop-business-file.mjs";
import { findUnpackedExecutable } from "./smoke-app-protocol.mjs";
import { approveDeviceAuthorization } from "../test/support/browser-approval-driver.mjs";
import { buildRealApi, startRealApiFixture } from "../test/support/real-api-fixture.mjs";

export async function smokeDesktopFeatureParity(inputPath, { platform = process.platform } = {}) {
  const startedAt = performance.now();
  const network = await smokeDesktopNetwork(inputPath, { platform });
  const file = await smokeDesktopFileTransfer(inputPath, { platform });
  const businessFile = await smokeDesktopBusinessFile(inputPath, { platform });
  const ui = await smokeDesktopUiParity(inputPath, { platform });
  const outputDirectory = path.join(path.dirname(file.outputPath), "");
  const reportBytes = await supportingReportBytes(outputDirectory);
  const report = Object.freeze({
    kind: "yuance-desktop-feature-parity-smoke",
    network: true,
    files: true,
    businessFiles: true,
    sharedUi: ui.report.sharedApp && ui.report.restrictedBridge && ui.report.semanticMain && ui.report.semanticNavigation,
    keyboardFocus: ui.report.keyboardFocus,
    liveRegions: ui.report.liveRegions,
    messageRefresh: network.report.messageRefresh === true,
    releaseVersion: network.report.releaseVersion === true,
    foregroundSuppressed: network.report.foregroundSuppressed === true,
    activeOperations: Math.max(file.report.activeOperations, businessFile.report.activeOperations),
    spoolFiles: Math.max(file.report.spoolFiles, businessFile.report.spoolFiles),
    durationMs: Math.round(performance.now() - startedAt),
    reportBytes,
  });
  const outputPath = path.join(outputDirectory, "desktop-feature-parity-smoke.json");
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  return Object.freeze({ report, outputPath });
}

async function smokeDesktopUiParity(inputPath, { platform }) {
  await buildRealApi();
  const fixture = await startRealApiFixture({ seedDemo: true });
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-packaged-feature-ui-"));
  const outputDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist", "verification");
  await fs.mkdir(outputDirectory, { recursive: true });
  const outputPath = path.join(outputDirectory, "desktop-feature-parity-ui-smoke.json");
  const cleanupPath = path.join(outputDirectory, "desktop-feature-parity-ui-cleanup.json");
  await Promise.all([fs.rm(outputPath, { force: true }), fs.rm(cleanupPath, { force: true })]);
  try {
    const session = await fixture.loginDemoAdmin();
    const executable = await findUnpackedExecutable(inputPath, platform);
    const report = await runUiSmoke(executable, fixture.origin, profile, platform, (value) => {
      if (value.kind === "yuance-desktop-feature-parity-ui-user-code") return approveDeviceAuthorization({ origin: fixture.origin, userCode: value.userCode, session });
    });
    assertUiReport(report);
    await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    return Object.freeze({ report, outputPath });
  } finally {
    try { await fixture.stop(); }
    finally {
      await fs.rm(profile, { recursive: true, force: true });
      await fs.writeFile(cleanupPath, `${JSON.stringify({ kind: "yuance-desktop-feature-parity-ui-cleanup", apiProcess: "stopped", profile: "removed" }, null, 2)}\n`, { mode: 0o600 });
    }
  }
}

function runUiSmoke(executable, origin, profile, platform, onValue) {
  return new Promise((resolve, reject) => {
    const args = [`--desktop-feature-parity-ui-smoke-origin=${origin}`, `--desktop-feature-parity-ui-smoke-profile=${profile}`, ...(platform === "linux" ? ["--no-sandbox", "--password-store=gnome-libsecret"] : [])];
    const child = spawn(executable, args, { cwd: path.dirname(executable), stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = ""; let report; let sideEffect = Promise.resolve(); let settled = false;
    const finish = (callback) => { if (settled) return; settled = true; clearTimeout(timer); callback(); };
    child.stdout.setEncoding("utf8").on("data", (chunk) => {
      stdout += chunk;
      const lines = stdout.split(/\r?\n/u); stdout = lines.pop() || "";
      for (const line of lines) {
        try {
          const value = JSON.parse(line);
          if (value.kind === "yuance-desktop-feature-parity-ui-smoke") report = value;
          sideEffect = sideEffect.then(() => onValue(value));
        } catch {}
      }
    });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => child.kill("SIGKILL"), 60_000);
    child.once("error", (error) => finish(() => reject(error)));
    child.once("exit", async (code, signal) => {
      try { await sideEffect; } catch (error) { finish(() => reject(error)); return; }
      finish(() => code === 0 && !signal && report ? resolve(report) : reject(new Error(`packaged feature parity UI smoke failed (${signal || code}): ${stderr || stdout}`)));
    });
  });
}

function assertUiReport(report) {
  const checks = {
    kind: report?.kind === "yuance-desktop-feature-parity-ui-smoke",
    sharedApp: report?.sharedApp === true,
    restrictedBridge: report?.restrictedBridge === true,
    semanticMain: report?.semanticMain === true,
    semanticNavigation: report?.semanticNavigation === true,
    keyboardFocus: report?.keyboardFocus === true,
    liveRegions: Number.isSafeInteger(report?.liveRegions) && report.liveRegions >= 1,
    genericBridgeMethods: report?.genericBridgeMethods === 0,
    shape: report && Object.keys(report).sort().join(",") === "genericBridgeMethods,keyboardFocus,kind,liveRegions,restrictedBridge,semanticMain,semanticNavigation,sharedApp",
  };
  const failed = Object.entries(checks).filter(([, valid]) => !valid).map(([name]) => name);
  if (failed.length > 0) throw new Error(`desktop feature parity UI report failed public checks: ${failed.join(", ")}`);
  return report;
}

async function supportingReportBytes(root) {
  const names = [
    "desktop-network-smoke.json", "desktop-network-cleanup.json", "desktop-network-api.log",
    "desktop-file-transfer-smoke.json", "desktop-file-transfer-cleanup.json",
    "desktop-business-file-smoke.json", "desktop-business-file-cleanup.json",
    "desktop-feature-parity-ui-smoke.json", "desktop-feature-parity-ui-cleanup.json",
  ];
  const stats = await Promise.all(names.map((name) => fs.stat(path.join(root, name))));
  return stats.reduce((total, stat) => total + stat.size, 0);
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const inputPath = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist"));
  smokeDesktopFeatureParity(inputPath)
    .then(() => console.log("Verified packaged desktop feature parity."))
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}
