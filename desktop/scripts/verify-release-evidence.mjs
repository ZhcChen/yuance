import path from "node:path";
import { fileURLToPath } from "node:url";

import { verifyReleaseEvidence } from "../src/release-evidence.mjs";
import { verifyMinisignSignature, verifyMinisignVersion } from "../src/release-tools.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDir, "..");
const directory = path.resolve(process.argv[2] || path.join(desktopRoot, ".artifacts", "release-evidence"));
const publicKeyPath = path.resolve(
  process.env.YUANCE_MINISIGN_PUBLIC_KEY_FILE || path.join(desktopRoot, "release", "minisign.pub"),
);
const minisignBinary = process.env.MINISIGN_BIN || "minisign";

async function main() {
  await verifyMinisignVersion(minisignBinary);
  const manifest = await verifyReleaseEvidence({
    directory,
    publicKeyPath,
    expectedVersion: process.env.YUANCE_DESKTOP_VERSION,
    verifySignature: (messagePath, signaturePath, keyPath) => verifyMinisignSignature(
      messagePath,
      signaturePath,
      keyPath,
      minisignBinary,
    ),
  });
  console.log(`Verified ${manifest.assets.length} signed desktop release assets for ${manifest.tag}.`);
}

main().catch((error) => {
  console.error(`::error title=verify-release-evidence::${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
