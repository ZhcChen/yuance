import { writeFile } from "node:fs/promises";
import path from "node:path";

import { DESKTOP_RELEASE_TARGETS, releaseAssetKey } from "../src/release-assets.mjs";

const reference = process.env.YUANCE_RELEASE_ATTESTATION_URL;
const outputPath = path.resolve(process.argv[2] || ".artifacts/release-provenance.json");

if (!reference) throw new Error("YUANCE_RELEASE_ATTESTATION_URL is required.");
if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/attestations\/[1-9][0-9]*$/u.test(reference)) {
  throw new Error("YUANCE_RELEASE_ATTESTATION_URL is invalid.");
}

const provenance = Object.fromEntries(
  DESKTOP_RELEASE_TARGETS.map((target) => [releaseAssetKey(target.platform, target.architecture), reference]),
);
await writeFile(outputPath, `${JSON.stringify(provenance, null, 2)}\n`, { flag: "wx" });
console.log(`Recorded provenance references for ${DESKTOP_RELEASE_TARGETS.length} desktop targets.`);
