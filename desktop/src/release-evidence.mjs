import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  DESKTOP_RELEASE_TARGETS,
  canonicalReleaseAssetName,
  releaseAssetContentType,
  releaseAssetKey,
} from "./release-assets.mjs";
import {
  createDesktopReleaseManifest,
  parseDesktopReleaseManifest,
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
  const expectedProvenanceKeys = new Set(
    DESKTOP_RELEASE_TARGETS.map((target) => releaseAssetKey(target.platform, target.architecture)),
  );
  const missingProvenance = [...expectedProvenanceKeys].filter((key) => !provenanceByTarget.has(key));
  if (missingProvenance.length > 0) {
    throw new Error(`Missing release provenance for ${missingProvenance.join(", ")}.`);
  }
  const unexpectedProvenance = [...provenanceByTarget.keys()].filter((key) => !expectedProvenanceKeys.has(key));
  if (unexpectedProvenance.length > 0) {
    throw new Error(`Release provenance must contain exactly the six desktop targets; unexpected: ${unexpectedProvenance.join(", ") || "none"}.`);
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

export async function verifyReleaseEvidence({
  directory,
  publicKeyPath,
  verifySignature,
  expectedVersion,
}) {
  if (typeof verifySignature !== "function") throw new Error("Release signature verifier is required.");
  const keyId = await readMinisignPublicKeyId(publicKeyPath);
  const manifestPath = safeEvidencePath(directory, "release-manifest.json");
  const manifestSignaturePath = safeEvidencePath(directory, "release-manifest.json.minisig");
  await verifySignature(manifestPath, manifestSignaturePath, publicKeyPath);

  let manifest;
  try {
    manifest = parseDesktopReleaseManifest(JSON.parse(await readFile(manifestPath, "utf8")));
  } catch (error) {
    throw new Error(`Desktop release manifest is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (manifest.signing.key_id !== keyId) throw new Error("Manifest signing key does not match the public key.");
  if (expectedVersion !== undefined && manifest.version !== expectedVersion) {
    throw new Error("Manifest version does not match the expected release version.");
  }

  const sumsPath = safeEvidencePath(directory, "SHA256SUMS");
  await verifySignature(sumsPath, safeEvidencePath(directory, "SHA256SUMS.minisig"), publicKeyPath);
  const expectedSums = createSha256Sums(manifest);
  if (await readFile(sumsPath, "utf8") !== expectedSums) throw new Error("SHA256SUMS does not match the manifest.");

  const expectedFiles = new Set([
    "release-manifest.json",
    "release-manifest.json.minisig",
    "SHA256SUMS",
    "SHA256SUMS.minisig",
  ]);
  for (const asset of manifest.assets) {
    expectedFiles.add(asset.filename);
    expectedFiles.add(asset.integrity_signature);
    expectedFiles.add(asset.sbom.filename);
  }
  await assertExactEvidenceFiles(directory, expectedFiles);

  for (const asset of manifest.assets) {
    const assetPath = safeEvidencePath(directory, asset.filename);
    const assetDigest = await sha256File(assetPath);
    if (assetDigest.byteSize !== asset.byte_size || assetDigest.sha256 !== asset.sha256) {
      throw new Error(`Release asset digest mismatch: ${asset.filename}.`);
    }
    const sbomPath = safeEvidencePath(directory, asset.sbom.filename);
    await readCycloneDxSbom(sbomPath, asset.sha256);
    const sbomDigest = await sha256File(sbomPath);
    if (sbomDigest.sha256 !== asset.sbom.sha256) {
      throw new Error(`Release SBOM digest mismatch: ${asset.sbom.filename}.`);
    }
    await verifySignature(
      assetPath,
      safeEvidencePath(directory, asset.integrity_signature),
      publicKeyPath,
    );
  }
  return manifest;
}

export async function readMinisignPublicKeyId(publicKeyPath) {
  const content = await readFile(publicKeyPath, "utf8");
  const lines = content.trimEnd().split(/\r?\n/u);
  if (lines.length !== 2 || !/^untrusted comment: minisign public key [0-9A-F]{16}$/u.test(lines[0])
    || !/^[A-Za-z0-9+/]{56}$/u.test(lines[1])) {
    throw new Error("Minisign public key file is invalid.");
  }
  const payload = Buffer.from(lines[1], "base64");
  if (payload.length !== 42 || payload.subarray(0, 2).toString("ascii") !== "Ed") {
    throw new Error("Minisign public key file is invalid.");
  }
  const encodedKeyId = Buffer.from(payload.subarray(2, 10)).reverse().toString("hex").toUpperCase();
  const commentKeyId = lines[0].slice(-16);
  if (encodedKeyId !== commentKeyId) throw new Error("Minisign public key ID does not match its payload.");
  return encodedKeyId;
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

export async function bindCycloneDxSbom(filePath, assetFilename, assetDigest) {
  let document;
  try {
    document = JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    throw new Error(`CycloneDX SBOM is not valid JSON: ${path.basename(filePath)}.`);
  }
  if (!isPlainObject(document) || document.bomFormat !== "CycloneDX"
    || typeof document.specVersion !== "string"
    || (document.components !== undefined && !Array.isArray(document.components))) {
    throw new Error(`CycloneDX SBOM contract is invalid: ${path.basename(filePath)}.`);
  }
  const metadata = isPlainObject(document.metadata) ? document.metadata : {};
  const component = isPlainObject(metadata.component) ? metadata.component : { type: "file" };
  const properties = Array.isArray(metadata.properties) ? metadata.properties.filter(
    (property) => !isPlainObject(property) || property.name !== CYCLONEDX_ASSET_DIGEST_PROPERTY,
  ) : [];
  const bound = {
    ...document,
    components: document.components ?? [],
    metadata: {
      ...metadata,
      component: { ...component, name: assetFilename },
      properties: [...properties, { name: CYCLONEDX_ASSET_DIGEST_PROPERTY, value: assetDigest }],
    },
  };
  await writeFile(filePath, `${JSON.stringify(bound, null, 2)}\n`, { mode: 0o600 });
  return readCycloneDxSbom(filePath, assetDigest);
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

async function assertExactEvidenceFiles(directory, expectedFiles) {
  const entries = await readdir(directory, { withFileTypes: true });
  const actualFiles = new Set();
  for (const entry of entries) {
    if (!entry.isFile() || entry.isSymbolicLink()) {
      throw new Error(`Unexpected release evidence entry: ${entry.name}.`);
    }
    actualFiles.add(entry.name);
  }
  const missing = [...expectedFiles].filter((name) => !actualFiles.has(name));
  const unexpected = [...actualFiles].filter((name) => !expectedFiles.has(name));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(`Release evidence file set mismatch; missing: ${missing.join(", ") || "none"}; unexpected: ${unexpected.join(", ") || "none"}.`);
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size
    && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}
