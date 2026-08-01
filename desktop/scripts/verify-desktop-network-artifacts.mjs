import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertDesktopNetworkSmokeReport } from "./smoke-desktop-network.mjs";

export async function verifyDesktopNetworkArtifacts(root) {
  const smoke = JSON.parse(await fs.readFile(path.join(root, "desktop-network-smoke.json"), "utf8"));
  const cleanup = JSON.parse(await fs.readFile(path.join(root, "desktop-network-cleanup.json"), "utf8"));
  assertDesktopNetworkSmokeReport(smoke);
  if (cleanup?.kind !== "yuance-desktop-network-cleanup" || cleanup.apiProcess !== "stopped" || cleanup.profile !== "removed") {
    throw new Error("desktop network cleanup evidence is incomplete");
  }
  await fs.access(path.join(root, "desktop-network-api.log"));
  return Object.freeze({ smoke, cleanup });
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist", "verification"));
  verifyDesktopNetworkArtifacts(root)
    .then(() => console.log(`Verified desktop network artifacts in ${root}.`))
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}
