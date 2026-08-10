import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createReleaseEvidenceManifest,
  createSha256Sums,
  readMinisignPublicKeyId,
  verifyReleaseEvidence,
} from "../src/release-evidence.mjs";
import { serializeDesktopReleaseManifest } from "../src/release-manifest.mjs";
import {
  signWithMinisign,
  verifyMinisignSignature,
  verifyMinisignVersion,
} from "../src/release-tools.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDir, "..");
const directory = path.resolve(process.argv[2] || path.join(desktopRoot, ".artifacts", "release-evidence"));
const publicKeyPath = path.resolve(
  process.env.YUANCE_MINISIGN_PUBLIC_KEY_FILE || path.join(desktopRoot, "release", "minisign.pub"),
);
const secretKeyPath = process.env.YUANCE_MINISIGN_SECRET_KEY_FILE
  ? path.resolve(process.env.YUANCE_MINISIGN_SECRET_KEY_FILE)
  : undefined;
const provenancePath = process.env.YUANCE_RELEASE_PROVENANCE_FILE
  ? path.resolve(process.env.YUANCE_RELEASE_PROVENANCE_FILE)
  : undefined;
const minisignBinary = process.env.MINISIGN_BIN || "minisign";

async function main() {
  const version = required("YUANCE_DESKTOP_VERSION");
  const tag = required("RELEASE_TAG");
  if (!secretKeyPath) throw new Error("YUANCE_MINISIGN_SECRET_KEY_FILE is required.");
  if (!provenancePath) throw new Error("YUANCE_RELEASE_PROVENANCE_FILE is required.");
  await verifyMinisignVersion(minisignBinary);
  const keyId = await readMinisignPublicKeyId(publicKeyPath);
  const provenanceByTarget = await readProvenance(provenancePath);
  const manifest = await createReleaseEvidenceManifest({
    directory,
    version,
    tag,
    source: {
      commit: required("GITHUB_SHA"),
      repository: required("GITHUB_REPOSITORY"),
      workflow_run: required("GITHUB_RUN_ID"),
    },
    signing: { algorithm: "minisign", key_id: keyId },
    provenanceByTarget,
  });

  const manifestPath = path.join(directory, "release-manifest.json");
  const sumsPath = path.join(directory, "SHA256SUMS");
  await writeFile(manifestPath, serializeDesktopReleaseManifest(manifest), { flag: "wx" });
  await writeFile(sumsPath, createSha256Sums(manifest), { flag: "wx" });
  for (const asset of manifest.assets) {
    await signWithMinisign(
      path.join(directory, asset.filename),
      path.join(directory, asset.integrity_signature),
      secretKeyPath,
      minisignBinary,
    );
  }
  await signWithMinisign(manifestPath, `${manifestPath}.minisig`, secretKeyPath, minisignBinary);
  await signWithMinisign(sumsPath, `${sumsPath}.minisig`, secretKeyPath, minisignBinary);
  await verifyReleaseEvidence({
    directory,
    publicKeyPath,
    expectedVersion: version,
    verifySignature: (messagePath, signaturePath, keyPath) => verifyMinisignSignature(
      messagePath,
      signaturePath,
      keyPath,
      minisignBinary,
    ),
  });
  console.log(`Assembled and verified signed release evidence for ${tag}.`);
}

async function readProvenance(filePath) {
  let value;
  try {
    value = JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    throw new Error("Release provenance file is invalid JSON.");
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Release provenance file must be an object.");
  }
  return new Map(Object.entries(value));
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

main().catch((error) => {
  console.error(`::error title=assemble-release-evidence::${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
