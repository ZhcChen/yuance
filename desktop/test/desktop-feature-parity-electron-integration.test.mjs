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
    { network: false }, { files: false }, { businessFiles: false }, { messageRefresh: false },
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

function validReport() {
  return { kind: "yuance-desktop-feature-parity-smoke", network: true, files: true, businessFiles: true, messageRefresh: true, releaseVersion: true, foregroundSuppressed: true, activeOperations: 0, spoolFiles: 0, durationMs: 10_000, reportBytes: 1024 };
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
  };
}
