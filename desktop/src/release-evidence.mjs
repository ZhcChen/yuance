import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";

import {
  DESKTOP_RELEASE_TARGETS,
  canonicalReleaseAssetName,
  releaseAssetContentType,
  releaseAssetKey,
} from "./release-assets.mjs";
import {
  createDesktopReleaseManifest,
  releaseAssetEvidenceNames,
  releaseAssetOsSignature,
} from "./release-manifest.mjs";

export const CYCLONEDX_ASSET_DIGEST_PROPERTY = "yuance:release:asset:sha256";

export async function sha256File(filePath) {
  const before = await assertRegularEvidenceFile(filePath);
  const hash = createHash("sha256");
  let byteSize = 0;
  const stream = createReadStream(filePath);
  for await (const chunk of stream) {
    byteSize += chunk.length;
    hash.update(chunk);
  }
  if (!Number.isSafeInteger(byteSize) || byteSize <= 0) {
    throw new Error(`Release evidence file must not be empty: ${path.basename(filePath)}.`);
  }
  const after = await assertRegularEvidenceFile(filePath);
  if (BigInt(byteSize) !== before.size || !sameFileIdentity(before, after)) {
    throw new Error(`Release evidence changed while hashing: ${path.basename(filePath)}.`);
  }
  return Object.freeze({ byteSize, sha256: hash.digest("hex") });
}

export async function createReleaseEvidenceManifest({
  directory,
  version,
  tag,
  source,
  signing,
  provenanceByTarget,
}) {
  if (!(provenanceByTarget instanceof Map)) {
    throw new Error("Release provenance must be provided as a target map.");
  }
  const assets = [];
  for (const target of DESKTOP_RELEASE_TARGETS) {
    const key = releaseAssetKey(target.platform, target.architecture);
    const filename = canonicalReleaseAssetName({ version, ...target });
    const evidenceNames = releaseAssetEvidenceNames(filename);
    const assetPath = safeEvidencePath(directory, filename);
    const sbomPath = safeEvidencePath(directory, evidenceNames.sbom);
    const asset = await sha256File(assetPath);
    const sbomDocument = await readCycloneDxSbom(sbomPath, asset.sha256);
    const sbom = await sha256File(sbomPath);
    const provenanceReference = provenanceByTarget.get(key);
    if (typeof provenanceReference !== "string") {
      throw new Error(`Missing release provenance for ${key}.`);
    }
    assets.push({
      filename,
      platform: target.platform,
      architecture: target.architecture,
      byte_size: asset.byteSize,
      sha256: asset.sha256,
      content_type: releaseAssetContentType(filename),
      os_signature: releaseAssetOsSignature(target.platform),
      integrity_signature: evidenceNames.integritySignature,
      sbom: { filename: evidenceNames.sbom, sha256: sbom.sha256 },
      provenance: {
        reference: provenanceReference,
        subject_sha256: asset.sha256,
      },
    });
    if (sbomDocument.metadata?.component?.name !== filename) {
      throw new Error(`CycloneDX SBOM component does not identify ${filename}.`);
    }
  }
  return createDesktopReleaseManifest({ version, tag, source, signing, assets });
}

export function createSha256Sums(manifest) {
  const lines = [];
  for (const asset of manifest.assets) {
    lines.push(`${asset.sha256}  ${asset.filename}`);
    lines.push(`${asset.sbom.sha256}  ${asset.sbom.filename}`);
  }
  return `${lines.join("\n")}\n`;
}

export async function readCycloneDxSbom(filePath, expectedAssetDigest) {
  let document;
  try {
    document = JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    throw new Error(`CycloneDX SBOM is not valid JSON: ${path.basename(filePath)}.`);
  }
  if (!isPlainObject(document) || document.bomFormat !== "CycloneDX"
    || typeof document.specVersion !== "string" || !Array.isArray(document.components)) {
    throw new Error(`CycloneDX SBOM contract is invalid: ${path.basename(filePath)}.`);
  }
  const metadata = document.metadata;
  if (!isPlainObject(metadata) || !isPlainObject(metadata.component)
    || !Array.isArray(metadata.properties)) {
    throw new Error(`CycloneDX SBOM metadata is invalid: ${path.basename(filePath)}.`);
  }
  const digestProperties = metadata.properties.filter(
    (property) => isPlainObject(property) && property.name === CYCLONEDX_ASSET_DIGEST_PROPERTY,
  );
  if (digestProperties.length !== 1 || digestProperties[0].value !== expectedAssetDigest) {
    throw new Error(`CycloneDX SBOM is not bound to its release asset: ${path.basename(filePath)}.`);
  }
  return document;
}

export async function assertRegularEvidenceFile(filePath) {
  const details = await lstat(filePath, { bigint: true });
  if (!details.isFile() || details.isSymbolicLink()) {
    throw new Error(`Release evidence must be a regular file: ${path.basename(filePath)}.`);
  }
  return details;
}

function safeEvidencePath(directory, filename) {
  const root = path.resolve(directory);
  const resolved = path.resolve(root, filename);
  if (path.dirname(resolved) !== root) throw new Error("Release evidence path escapes its directory.");
  return resolved;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size
    && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}
