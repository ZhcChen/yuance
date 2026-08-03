import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertDesktopBusinessFileSmokeReport } from "./smoke-desktop-business-file.mjs";

export async function verifyDesktopBusinessFileArtifacts(root) {
  const smoke = JSON.parse(await fs.readFile(path.join(root, "desktop-business-file-smoke.json"), "utf8"));
  const cleanup = JSON.parse(await fs.readFile(path.join(root, "desktop-business-file-cleanup.json"), "utf8"));
  assertDesktopBusinessFileSmokeReport(smoke);
  if (cleanup?.kind !== "yuance-desktop-business-file-cleanup" || cleanup.apiProcess !== "stopped" || cleanup.profile !== "removed") throw new Error("desktop business file cleanup evidence is incomplete");
  return Object.freeze({ smoke, cleanup });
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist", "verification"));
  verifyDesktopBusinessFileArtifacts(root).then(() => console.log(`Verified desktop business file artifacts in ${root}.`)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
