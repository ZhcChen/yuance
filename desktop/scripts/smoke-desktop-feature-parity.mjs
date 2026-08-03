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
  await fs.mkdir(path.join(profile, "Downloads"), { recursive: true });
  await fs.writeFile(path.join(profile, "fixture-upload.txt"), Buffer.alloc(1024 * 1024, 0x61), { mode: 0o600 });
  const outputDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist", "verification");
  await fs.mkdir(outputDirectory, { recursive: true });
  const outputPath = path.join(outputDirectory, "desktop-feature-parity-ui-smoke.json");
  const cleanupPath = path.join(outputDirectory, "desktop-feature-parity-ui-cleanup.json");
  await Promise.all([fs.rm(outputPath, { force: true }), fs.rm(cleanupPath, { force: true })]);
  try {
    const adminSession = await fixture.loginDemoAdmin();
    await fixture.activateTestStorage(adminSession);
    const memberSession = await fixture.prepareDemoDesktopMember(adminSession);
    const approvalSessions = [adminSession, memberSession];
    const executable = await findUnpackedExecutable(inputPath, platform);
    const appReport = await runUiSmoke(executable, fixture.origin, profile, platform, (value) => {
      if (value.kind === "yuance-desktop-feature-parity-ui-user-code") {
        const session = approvalSessions.shift();
        if (!session) throw new Error("packaged UI smoke requested an unexpected authorization");
        return approveDeviceAuthorization({ origin: fixture.origin, userCode: value.userCode, session });
      }
      if (value.kind === "yuance-desktop-feature-parity-ui-api-stop") return fixture.stopApi();
      if (value.kind === "yuance-desktop-feature-parity-ui-api-start") return fixture.startApi();
    });
    const report = Object.freeze({ ...appReport, profileBytes: await directoryBytes(profile) });
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
    workItemDetail: report?.workItemDetail === true,
    workItemEdited: report?.workItemEdited === true,
    workItemHandedOff: report?.workItemHandedOff === true,
    commentCreated: report?.commentCreated === true,
    commentEdited: report?.commentEdited === true,
    workItemAttachmentUploaded: report?.workItemAttachmentUploaded === true,
    workItemAttachmentDownloaded: report?.workItemAttachmentDownloaded === true,
    workItemAttachmentRevealed: report?.workItemAttachmentRevealed === true,
    commentAttachmentUploaded: report?.commentAttachmentUploaded === true,
    commentAttachmentDownloaded: report?.commentAttachmentDownloaded === true,
    commentAttachmentRevealed: report?.commentAttachmentRevealed === true,
    messageTargetOpened: report?.messageTargetOpened === true,
    messageTargetFocused: report?.messageTargetFocused === true,
    processCount: Number.isSafeInteger(report?.processCount) && report.processCount >= 1 && report.processCount <= 32,
    workingSetKb: Number.isSafeInteger(report?.workingSetKb) && report.workingSetKb >= 1 && report.workingSetKb <= 1_048_576,
    cpuPercent: Number.isSafeInteger(report?.cpuPercent) && report.cpuPercent >= 0 && report.cpuPercent <= 3_200,
    profileBytes: Number.isSafeInteger(report?.profileBytes) && report.profileBytes >= 1 && report.profileBytes <= 268_435_456,
    hiddenWindow: report?.hiddenWindow === true,
    lifecycleCycles: report?.lifecycleCycles === 3,
    networkRecovered: report?.networkRecovered === true,
    postResumeRefresh: report?.postResumeRefresh === true,
    permissionDenied: report?.permissionDenied === true,
    permissionInputPreserved: report?.permissionInputPreserved === true,
    validationError: report?.validationError === true,
    validationFocused: report?.validationFocused === true,
    notFoundVisible: report?.notFoundVisible === true,
    offlineStateVisible: report?.offlineStateVisible === true,
    offlineRecoveryVisible: report?.offlineRecoveryVisible === true,
    interruptionRecovered: report?.interruptionRecovered === true,
    interruptionCycles: report?.interruptionCycles === 3,
    keyboardFocus: report?.keyboardFocus === true,
    liveRegions: Number.isSafeInteger(report?.liveRegions) && report.liveRegions >= 1,
    accessibilityViolations: report?.accessibilityViolations === 0,
    genericBridgeMethods: report?.genericBridgeMethods === 0,
    shape: report && Object.keys(report).sort().join(",") === "accessibilityViolations,commentAttachmentDownloaded,commentAttachmentRevealed,commentAttachmentUploaded,commentCreated,commentEdited,cpuPercent,genericBridgeMethods,hiddenWindow,interruptionCycles,interruptionRecovered,keyboardFocus,kind,lifecycleCycles,liveRegions,messageTargetFocused,messageTargetOpened,networkRecovered,notFoundVisible,offlineRecoveryVisible,offlineStateVisible,permissionDenied,permissionInputPreserved,postResumeRefresh,processCount,profileBytes,restrictedBridge,semanticMain,semanticNavigation,sharedApp,validationError,validationFocused,workItemAttachmentDownloaded,workItemAttachmentRevealed,workItemAttachmentUploaded,workItemDetail,workItemEdited,workItemHandedOff,workingSetKb",
  };
  const failed = Object.entries(checks).filter(([, valid]) => !valid).map(([name]) => name);
  if (failed.length > 0) throw new Error(`desktop feature parity UI report failed public checks: ${failed.join(", ")}`);
  return report;
}

async function directoryBytes(root) {
  let total = 0;
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error("packaged UI smoke profile contains a symbolic link");
      if (entry.isDirectory()) pending.push(target);
      else if (entry.isFile()) total += (await fs.stat(target)).size;
      if (total > 268_435_456) return total;
    }
  }
  return total;
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
