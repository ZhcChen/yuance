import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { verifyDesktopNetworkArtifacts } from "./verify-desktop-network-artifacts.mjs";
import { verifyDesktopFileTransferArtifacts } from "./verify-desktop-file-transfer-artifacts.mjs";
import { verifyDesktopBusinessFileArtifacts } from "./verify-desktop-business-file-artifacts.mjs";

const MAX_REPORT_BYTES = 128 * 1024;
const MAX_DURATION_MS = 3 * 60 * 1_000;

export async function verifyDesktopFeatureParityArtifacts(root) {
  const [network, file, businessFile] = await Promise.all([
    verifyDesktopNetworkArtifacts(root),
    verifyDesktopFileTransferArtifacts(root),
    verifyDesktopBusinessFileArtifacts(root),
  ]);
  const reportPath = path.join(root, "desktop-feature-parity-smoke.json");
  const bytes = await fs.readFile(reportPath);
  if (bytes.length > MAX_REPORT_BYTES) throw new Error("desktop feature parity report exceeds its size budget");
  const report = JSON.parse(bytes.toString("utf8"));
  assertFeatureParityReport(report);
  const ui = JSON.parse(await fs.readFile(path.join(root, "desktop-feature-parity-ui-smoke.json"), "utf8"));
  const uiCleanup = JSON.parse(await fs.readFile(path.join(root, "desktop-feature-parity-ui-cleanup.json"), "utf8"));
  if (ui?.kind !== "yuance-desktop-feature-parity-ui-smoke" || !ui.sharedApp || !ui.restrictedBridge || !ui.semanticMain || !ui.semanticNavigation || !ui.workItemDetail || !ui.workItemEdited || !ui.workItemHandedOff || !ui.commentCreated || !ui.commentEdited || !ui.workItemAttachmentUploaded || !ui.workItemAttachmentDownloaded || !ui.workItemAttachmentRevealed || !ui.commentAttachmentUploaded || !ui.commentAttachmentDownloaded || !ui.commentAttachmentRevealed || !ui.keyboardFocus || !Number.isSafeInteger(ui.liveRegions) || ui.liveRegions < 1 || ui.genericBridgeMethods !== 0) throw new Error("desktop feature parity UI evidence is incomplete");
  if (uiCleanup?.kind !== "yuance-desktop-feature-parity-ui-cleanup" || uiCleanup.apiProcess !== "stopped" || uiCleanup.profile !== "removed") throw new Error("desktop feature parity UI cleanup evidence is incomplete");
  if (report.reportBytes !== await supportingReportBytes(root)) throw new Error("desktop feature parity report byte count drifted");
  return Object.freeze({ report, network, file, businessFile, ui, uiCleanup });
}

export function assertFeatureParityReport(report) {
  if (report?.kind !== "yuance-desktop-feature-parity-smoke"
    || !report.network || !report.files || !report.businessFiles
    || !report.sharedUi || !report.keyboardFocus || !Number.isSafeInteger(report.liveRegions) || report.liveRegions < 1
    || !report.messageRefresh || !report.releaseVersion || !report.foregroundSuppressed
    || report.activeOperations !== 0 || report.spoolFiles !== 0
    || !Number.isSafeInteger(report.durationMs) || report.durationMs < 0 || report.durationMs > MAX_DURATION_MS
    || !Number.isSafeInteger(report.reportBytes) || report.reportBytes < 1 || report.reportBytes > MAX_REPORT_BYTES
    || Object.keys(report).sort().join(",") !== "activeOperations,businessFiles,durationMs,files,foregroundSuppressed,keyboardFocus,kind,liveRegions,messageRefresh,network,releaseVersion,reportBytes,sharedUi,spoolFiles") {
    throw new Error("desktop feature parity report is invalid");
  }
  return report;
}

async function supportingReportBytes(root) {
  const names = [
    "desktop-network-smoke.json",
    "desktop-network-cleanup.json",
    "desktop-network-api.log",
    "desktop-file-transfer-smoke.json",
    "desktop-file-transfer-cleanup.json",
    "desktop-business-file-smoke.json",
    "desktop-business-file-cleanup.json",
    "desktop-feature-parity-ui-smoke.json",
    "desktop-feature-parity-ui-cleanup.json",
  ];
  const stats = await Promise.all(names.map((name) => fs.stat(path.join(root, name))));
  return stats.reduce((total, stat) => total + stat.size, 0);
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist", "verification"));
  verifyDesktopFeatureParityArtifacts(root)
    .then(() => console.log(`Verified desktop feature parity artifacts in ${root}.`))
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}
