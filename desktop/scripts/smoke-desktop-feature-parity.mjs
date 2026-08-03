import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { smokeDesktopNetwork } from "./smoke-desktop-network.mjs";
import { smokeDesktopFileTransfer } from "./smoke-desktop-file-transfer.mjs";
import { smokeDesktopBusinessFile } from "./smoke-desktop-business-file.mjs";

export async function smokeDesktopFeatureParity(inputPath, { platform = process.platform } = {}) {
  const startedAt = performance.now();
  const network = await smokeDesktopNetwork(inputPath, { platform });
  const file = await smokeDesktopFileTransfer(inputPath, { platform });
  const businessFile = await smokeDesktopBusinessFile(inputPath, { platform });
  const outputDirectory = path.join(path.dirname(file.outputPath), "");
  const reportBytes = await supportingReportBytes(outputDirectory);
  const report = Object.freeze({
    kind: "yuance-desktop-feature-parity-smoke",
    network: true,
    files: true,
    businessFiles: true,
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

async function supportingReportBytes(root) {
  const names = [
    "desktop-network-smoke.json", "desktop-network-cleanup.json", "desktop-network-api.log",
    "desktop-file-transfer-smoke.json", "desktop-file-transfer-cleanup.json",
    "desktop-business-file-smoke.json", "desktop-business-file-cleanup.json",
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
