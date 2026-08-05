import path from "node:path";
import { fileURLToPath } from "node:url";

import { DESKTOP_RELEASE_TARGETS, canonicalReleaseAssetName } from "../src/release-assets.mjs";
import { bindCycloneDxSbom, sha256File } from "../src/release-evidence.mjs";
import { releaseAssetEvidenceNames } from "../src/release-manifest.mjs";
import { generateSyftCycloneDx, verifySyftVersion } from "../src/release-tools.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDir, "..");
const directory = path.resolve(process.argv[2] || path.join(desktopRoot, ".artifacts", "release-assets"));
const version = process.env.YUANCE_DESKTOP_VERSION;
const syftBinary = process.env.SYFT_BIN || "syft";

async function main() {
  if (!version) throw new Error("YUANCE_DESKTOP_VERSION is required.");
  await verifySyftVersion(syftBinary);
  for (const target of DESKTOP_RELEASE_TARGETS) {
    const filename = canonicalReleaseAssetName({ version, ...target });
    const assetPath = path.join(directory, filename);
    const { sha256 } = await sha256File(assetPath);
    const sbomPath = path.join(directory, releaseAssetEvidenceNames(filename).sbom);
    await generateSyftCycloneDx(assetPath, sbomPath, syftBinary);
    await bindCycloneDxSbom(sbomPath, filename, sha256);
  }
  console.log(`Generated ${DESKTOP_RELEASE_TARGETS.length} digest-bound CycloneDX SBOMs.`);
}

main().catch((error) => {
  console.error(`::error title=generate-release-sboms::${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
