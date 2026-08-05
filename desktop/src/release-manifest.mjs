import {
  DESKTOP_RELEASE_TARGETS,
  canonicalReleaseAssetName,
  normalizeDesktopVersion,
  releaseAssetContentType,
  releaseAssetKey,
} from "./release-assets.mjs";

export const DESKTOP_RELEASE_MANIFEST_SCHEMA_VERSION = 1;
export const DESKTOP_RELEASE_CHANNEL = "internal";
export const DESKTOP_RELEASE_SIGNING_ALGORITHM = "minisign";

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const KEY_ID_PATTERN = /^[0-9A-F]{16}$/u;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
const WORKFLOW_RUN_PATTERN = /^[1-9][0-9]*$/u;
const ATTESTATION_PATTERN = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/attestations\/[1-9][0-9]*$/u;
const SAFE_FILENAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,254}$/u;

export function releaseAssetOsSignature(platform) {
  if (platform === "macos") return "adhoc";
  if (platform === "windows" || platform === "linux") return "none";
  throw new Error(`Unsupported desktop platform ${platform}.`);
}

export function releaseAssetEvidenceNames(fileName) {
  assertSafeFilename(fileName, "Release asset filename");
  return Object.freeze({
    integritySignature: `${fileName}.minisig`,
    sbom: `${fileName}.cdx.json`,
  });
}

export function createDesktopReleaseManifest({ version, tag, source, signing, assets }) {
  const normalizedVersion = normalizeDesktopVersion(version);
  if (tag !== `desktop-v${normalizedVersion}`) {
    throw new Error("Desktop release tag must exactly match the manifest version.");
  }
  const normalizedSource = normalizeSource(source);
  const normalizedSigning = normalizeSigning(signing);
  if (!Array.isArray(assets)) throw new Error("Desktop release assets must be an array.");

  const byTarget = new Map();
  for (const value of assets) {
    const asset = normalizeAsset(value, normalizedVersion);
    const key = releaseAssetKey(asset.platform, asset.architecture);
    if (byTarget.has(key)) throw new Error(`Duplicate desktop release asset for ${key}.`);
    byTarget.set(key, asset);
  }

  const missing = DESKTOP_RELEASE_TARGETS.filter(
    (target) => !byTarget.has(releaseAssetKey(target.platform, target.architecture)),
  );
  if (missing.length > 0 || byTarget.size !== DESKTOP_RELEASE_TARGETS.length) {
    throw new Error(
      `Desktop release manifest requires exactly six targets; missing: ${missing
        .map((target) => releaseAssetKey(target.platform, target.architecture))
        .join(", ") || "none"}.`,
    );
  }

  return Object.freeze({
    schema_version: DESKTOP_RELEASE_MANIFEST_SCHEMA_VERSION,
    channel: DESKTOP_RELEASE_CHANNEL,
    version: normalizedVersion,
    tag,
    source: normalizedSource,
    signing: normalizedSigning,
    assets: Object.freeze(
      DESKTOP_RELEASE_TARGETS.map((target) => byTarget.get(releaseAssetKey(target.platform, target.architecture))),
    ),
  });
}

export function parseDesktopReleaseManifest(value) {
  if (!isPlainObject(value) || !hasExactKeys(value, [
    "assets", "channel", "schema_version", "signing", "source", "tag", "version",
  ])) throw new Error("Desktop release manifest has unknown or missing fields.");
  if (value.schema_version !== DESKTOP_RELEASE_MANIFEST_SCHEMA_VERSION) {
    throw new Error("Unsupported desktop release manifest schema version.");
  }
  if (value.channel !== DESKTOP_RELEASE_CHANNEL) throw new Error("Desktop release channel must be internal.");
  return createDesktopReleaseManifest(value);
}

export function serializeDesktopReleaseManifest(value) {
  return `${JSON.stringify(parseDesktopReleaseManifest(value), null, 2)}\n`;
}

function normalizeSource(value) {
  if (!isPlainObject(value) || !hasExactKeys(value, ["commit", "repository", "workflow_run"])) {
    throw new Error("Desktop release source is invalid.");
  }
  if (!COMMIT_PATTERN.test(value.commit) || !REPOSITORY_PATTERN.test(value.repository)
    || !WORKFLOW_RUN_PATTERN.test(value.workflow_run)) {
    throw new Error("Desktop release source is invalid.");
  }
  return Object.freeze({
    commit: value.commit,
    repository: value.repository,
    workflow_run: value.workflow_run,
  });
}

function normalizeSigning(value) {
  if (!isPlainObject(value) || !hasExactKeys(value, ["algorithm", "key_id"])
    || value.algorithm !== DESKTOP_RELEASE_SIGNING_ALGORITHM || !KEY_ID_PATTERN.test(value.key_id)) {
    throw new Error("Desktop release signing identity is invalid.");
  }
  return Object.freeze({ algorithm: value.algorithm, key_id: value.key_id });
}

function normalizeAsset(value, version) {
  const keys = [
    "architecture", "byte_size", "content_type", "filename", "integrity_signature",
    "os_signature", "platform", "provenance", "sbom", "sha256",
  ];
  if (!isPlainObject(value) || !hasExactKeys(value, keys)) {
    throw new Error("Desktop release asset has unknown or missing fields.");
  }
  const expectedName = canonicalReleaseAssetName({
    version,
    platform: value.platform,
    architecture: value.architecture,
  });
  const evidence = releaseAssetEvidenceNames(expectedName);
  if (value.filename !== expectedName || value.content_type !== releaseAssetContentType(expectedName)
    || value.os_signature !== releaseAssetOsSignature(value.platform)
    || value.integrity_signature !== evidence.integritySignature) {
    throw new Error(`Desktop release asset contract mismatch for ${value.platform}/${value.architecture}.`);
  }
  if (!Number.isSafeInteger(value.byte_size) || value.byte_size <= 0 || !SHA256_PATTERN.test(value.sha256)) {
    throw new Error("Desktop release asset size or SHA-256 is invalid.");
  }
  if (!isPlainObject(value.sbom) || !hasExactKeys(value.sbom, ["filename", "sha256"])
    || value.sbom.filename !== evidence.sbom || !SHA256_PATTERN.test(value.sbom.sha256)) {
    throw new Error("Desktop release SBOM mapping is invalid.");
  }
  if (!isPlainObject(value.provenance) || !hasExactKeys(value.provenance, ["reference", "subject_sha256"])
    || value.provenance.subject_sha256 !== value.sha256
    || !ATTESTATION_PATTERN.test(value.provenance.reference)) {
    throw new Error("Desktop release provenance mapping is invalid.");
  }
  return Object.freeze({
    filename: value.filename,
    platform: value.platform,
    architecture: value.architecture,
    byte_size: value.byte_size,
    sha256: value.sha256,
    content_type: value.content_type,
    os_signature: value.os_signature,
    integrity_signature: value.integrity_signature,
    sbom: Object.freeze({ filename: value.sbom.filename, sha256: value.sbom.sha256 }),
    provenance: Object.freeze({
      reference: value.provenance.reference,
      subject_sha256: value.provenance.subject_sha256,
    }),
  });
}

function assertSafeFilename(value, label) {
  if (typeof value !== "string" || !SAFE_FILENAME_PATTERN.test(value) || value === "." || value === "..") {
    throw new Error(`${label} is invalid.`);
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function hasExactKeys(value, expected) {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index]);
}
