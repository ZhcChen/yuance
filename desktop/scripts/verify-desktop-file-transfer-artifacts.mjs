import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertDesktopFileSmokeReport } from "./smoke-desktop-file-transfer.mjs";

export async function verifyDesktopFileTransferArtifacts(root) {
  const smoke = JSON.parse(await fs.readFile(path.join(root, "desktop-file-transfer-smoke.json"), "utf8"));
  const cleanup = JSON.parse(await fs.readFile(path.join(root, "desktop-file-transfer-cleanup.json"), "utf8"));
  assertDesktopFileSmokeReport(smoke);
  if (cleanup?.kind !== "yuance-desktop-file-cleanup" || cleanup.apiProcess !== "stopped" || cleanup.profile !== "removed") throw new Error("desktop file cleanup evidence is incomplete");
  return Object.freeze({ smoke, cleanup });
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist", "verification"));
  verifyDesktopFileTransferArtifacts(root).then(() => console.log(`Verified desktop file transfer artifacts in ${root}.`)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
