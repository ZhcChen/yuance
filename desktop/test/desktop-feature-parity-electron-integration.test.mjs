import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { assertFeatureParityReport, verifyDesktopFeatureParityArtifacts } from "../scripts/verify-desktop-feature-parity-artifacts.mjs";

test("feature parity report accepts only bounded public metrics", () => {
  const report = validReport();
  assert.equal(assertFeatureParityReport(report), report);
  for (const mutation of [
    { network: false }, { files: false }, { businessFiles: false }, { sharedUi: false }, { keyboardFocus: false }, { liveRegions: 0 }, { messageRefresh: false },
    { releaseVersion: false }, { foregroundSuppressed: false }, { activeOperations: 1 },
    { spoolFiles: 1 }, { durationMs: 180_001 }, { reportBytes: 131_073 }, { url: "https://secret" },
  ]) assert.throws(() => assertFeatureParityReport({ ...report, ...mutation }), /invalid/);
});

test("feature parity verifier requires every child report, cleanup and exact byte count", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-feature-parity-artifacts-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const files = childArtifacts();
  await Promise.all(Object.entries(files).map(([name, value]) => fs.writeFile(path.join(root, name), typeof value === "string" ? value : JSON.stringify(value))));
  const reportBytes = (await Promise.all(Object.keys(files).map((name) => fs.stat(path.join(root, name))))).reduce((total, stat) => total + stat.size, 0);
  await fs.writeFile(path.join(root, "desktop-feature-parity-smoke.json"), JSON.stringify({ ...validReport(), reportBytes }));
  assert.equal((await verifyDesktopFeatureParityArtifacts(root)).report.reportBytes, reportBytes);
  await fs.rm(path.join(root, "desktop-business-file-cleanup.json"));
  await assert.rejects(verifyDesktopFeatureParityArtifacts(root));
});

test("desktop security workflow runs the same feature parity gate on every runner", async () => {
  const workflow = await fs.readFile(new URL("../../.github/workflows/desktop-security.yml", import.meta.url), "utf8");
  assert.match(workflow, /--test device_business_parity_flow/u);
  assert.equal((workflow.match(/smoke:desktop-feature-parity -- dist/gu) || []).length, 2);
  assert.match(workflow, /runner\.os != 'Linux'[\s\S]*smoke:desktop-feature-parity -- dist/u);
  assert.match(workflow, /runner\.os == 'Linux'[\s\S]*xvfb-run -a npm --prefix desktop run smoke:desktop-feature-parity -- dist/u);
  assert.match(workflow, /verify:desktop-feature-parity-artifacts/u);
});

test("packaged UI smoke requires an explicit loopback port", async () => {
  const main = await fs.readFile(new URL("../src/main.mjs", import.meta.url), "utf8");
  assert.match(main, /origin\.hostname !== "127\.0\.0\.1" \|\| !origin\.port/u);
});

function validReport() {
  return { kind: "yuance-desktop-feature-parity-smoke", network: true, files: true, businessFiles: true, sharedUi: true, keyboardFocus: true, liveRegions: 1, messageRefresh: true, releaseVersion: true, foregroundSuppressed: true, activeOperations: 0, spoolFiles: 0, durationMs: 10_000, reportBytes: 1024 };
}

function childArtifacts() {
  return {
    "desktop-network-smoke.json": { kind: "yuance-desktop-network-smoke", credentialRestart: process.platform === "darwin" ? "reauthorized" : "recovered", probe: true, firstStream: true, rotated: true, secondStream: true, loggedOut: true, messageRefresh: true, releaseVersion: true, foregroundSuppressed: true, revokeResponseToEofMs: 10, publicAuthStates: [] },
    "desktop-network-cleanup.json": { kind: "yuance-desktop-network-cleanup", apiProcess: "stopped", profile: "removed" },
    "desktop-network-api.log": "",
    "desktop-file-transfer-smoke.json": { kind: "yuance-desktop-file-smoke", upload: true, download: true, hashMatch: true, staleCapabilityRejected: true, byteSize: 34, activeOperations: 0, spoolFiles: 0 },
    "desktop-file-transfer-cleanup.json": { kind: "yuance-desktop-file-cleanup", apiProcess: "stopped", profile: "removed" },
    "desktop-business-file-smoke.json": { kind: "yuance-desktop-business-file-smoke", itemUploaded: true, commentUploaded: true, downloadsMatch: true, revealCount: 2, cancelled: true, stageCount: 8, activeOperations: 0, spoolFiles: 0 },
    "desktop-business-file-cleanup.json": { kind: "yuance-desktop-business-file-cleanup", apiProcess: "stopped", profile: "removed" },
    "desktop-feature-parity-ui-smoke.json": { kind: "yuance-desktop-feature-parity-ui-smoke", sharedApp: true, restrictedBridge: true, semanticMain: true, semanticNavigation: true, workItemDetail: true, workItemEdited: true, workItemHandedOff: true, commentCreated: true, commentEdited: true, workItemAttachmentUploaded: true, workItemAttachmentDownloaded: true, workItemAttachmentRevealed: true, commentAttachmentUploaded: true, commentAttachmentDownloaded: true, commentAttachmentRevealed: true, messageTargetOpened: true, messageTargetFocused: true, permissionDenied: true, permissionInputPreserved: true, validationError: true, validationFocused: true, notFoundVisible: true, offlineStateVisible: true, offlineRecoveryVisible: true, interruptionRecovered: true, interruptionCycles: 3, hiddenWindow: true, lifecycleCycles: 3, networkRecovered: true, postResumeRefresh: true, processCount: 4, workingSetKb: 200_000, cpuPercent: 100, profileBytes: 2_000_000, liveRegions: 1, accessibilityViolations: 0, keyboardFocus: true, genericBridgeMethods: 0 },
    "desktop-feature-parity-ui-cleanup.json": { kind: "yuance-desktop-feature-parity-ui-cleanup", apiProcess: "stopped", profile: "removed" },
  };
}
