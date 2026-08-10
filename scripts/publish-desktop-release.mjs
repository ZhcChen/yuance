import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeDesktopVersion, releaseAssetContentType } from "../desktop/src/release-assets.mjs";
import { sha256File, verifyReleaseEvidence } from "../desktop/src/release-evidence.mjs";
import { verifyMinisignSignature, verifyMinisignVersion } from "../desktop/src/release-tools.mjs";

const args = process.argv.slice(2);
const versionArgument = args.find((argument) => !argument.startsWith("--"));
const dryRun = process.env.YUANCE_DRY_RUN === "1" || args.includes("--dry-run");

function requiredEnvironment(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Missing required environment variable ${name}.`);
  return value;
}

function releaseVersion() {
  return normalizeDesktopVersion(process.env.YUANCE_DESKTOP_VERSION || versionArgument);
}

function systemApiBaseUrl() {
  const parsed = new URL(requiredEnvironment("YUANCE_API_BASE_URL"));
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("YUANCE_API_BASE_URL must use http or https.");
  }
  return parsed.toString().replace(/\/$/u, "");
}

async function resolveReleaseEvidenceDirectory(version) {
  const localDirectory = String(process.env.YUANCE_DESKTOP_ASSET_DIR || "").trim();
  if (localDirectory) return { directory: path.resolve(localDirectory), cleanup: false };

  const repository = String(
    process.env.YUANCE_GITHUB_REPOSITORY || process.env.GITHUB_REPOSITORY || "",
  ).trim();
  if (!repository) {
    throw new Error(
      "Set YUANCE_DESKTOP_ASSET_DIR or YUANCE_GITHUB_REPOSITORY to locate release evidence.",
    );
  }
  const tag = String(process.env.YUANCE_DESKTOP_RELEASE_TAG || `desktop-v${version}`).trim();
  const directory = await mkdtemp(path.join(os.tmpdir(), "yuance-desktop-release-"));
  const token = String(process.env.YUANCE_GITHUB_TOKEN || process.env.GH_TOKEN || "").trim();
  const result = spawnSync(
    "gh",
    ["release", "download", tag, "--repo", repository, "--dir", directory],
    {
      stdio: "inherit",
      env: { ...process.env, ...(token ? { GH_TOKEN: token } : {}) },
    },
  );
  if (result.error) throw new Error(`Unable to start gh: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`Failed to download GitHub Release ${tag} from ${repository}.`);
  }
  return { directory, cleanup: true };
}

function evidenceContentType(filename) {
  if (filename.endsWith(".json")) return "application/json";
  if (filename === "SHA256SUMS" || filename.endsWith(".minisig")) return "text/plain";
  return releaseAssetContentType(filename);
}

async function evidenceArtifact(directory, descriptor) {
  const filePath = path.join(directory, descriptor.filename);
  const digest = await sha256File(filePath);
  if (descriptor.sha256 && descriptor.sha256 !== digest.sha256) {
    throw new Error(`Release evidence digest mismatch: ${descriptor.filename}.`);
  }
  return Object.freeze({
    ...descriptor,
    key: descriptor.filename,
    canonicalName: descriptor.filename,
    filePath,
    byteSize: digest.byteSize,
    sha256: digest.sha256,
    contentType: evidenceContentType(descriptor.filename),
  });
}

export async function collectManifestEvidence(directory, manifest) {
  const descriptors = [];
  for (const asset of manifest.assets) {
    descriptors.push(
      { filename: asset.filename, platform: asset.platform, architecture: asset.architecture, artifactKind: "installer", sha256: asset.sha256 },
      { filename: asset.integrity_signature, platform: asset.platform, architecture: asset.architecture, artifactKind: "signature" },
      { filename: asset.sbom.filename, platform: asset.platform, architecture: asset.architecture, artifactKind: "sbom", sha256: asset.sbom.sha256 },
    );
  }
  descriptors.push(
    { filename: "release-manifest.json", platform: "linux", architecture: "universal", artifactKind: "manifest" },
    { filename: "release-manifest.json.minisig", platform: "linux", architecture: "universal", artifactKind: "signature" },
    { filename: "SHA256SUMS", platform: "linux", architecture: "universal", artifactKind: "checksums" },
    { filename: "SHA256SUMS.minisig", platform: "linux", architecture: "universal", artifactKind: "signature" },
  );
  return Promise.all(descriptors.map((descriptor) => evidenceArtifact(directory, descriptor)));
}

export async function preflightReleaseEvidence({
  directory,
  version,
  publicKeyPath,
  minisignBinary = "minisign",
  expectedTag,
  expectedCommit,
  expectedRepository,
  verifyToolVersion = verifyMinisignVersion,
  verifySignature = verifyMinisignSignature,
}) {
  await verifyToolVersion(minisignBinary);
  const manifest = await verifyReleaseEvidence({
    directory,
    publicKeyPath,
    expectedVersion: version,
    verifySignature: (messagePath, signaturePath, keyPath) =>
      verifySignature(messagePath, signaturePath, keyPath, minisignBinary),
  });
  if (manifest.tag !== expectedTag) throw new Error("Manifest source tag does not match publication tag.");
  if (manifest.source.commit !== expectedCommit) {
    throw new Error("Manifest source commit does not match publication commit.");
  }
  if (manifest.source.repository !== expectedRepository) {
    throw new Error("Manifest source repository does not match publication repository.");
  }
  const artifacts = await collectManifestEvidence(directory, manifest);
  const manifestDigest = await sha256File(path.join(directory, "release-manifest.json"));
  return Object.freeze({ manifest, manifestDigest: manifestDigest.sha256, artifacts });
}

function releaseNotes() {
  const notesFile = String(process.env.YUANCE_RELEASE_NOTES_FILE || "").trim();
  if (notesFile) return readFile(path.resolve(notesFile), "utf8");
  const notes = String(process.env.YUANCE_RELEASE_NOTES || "").trim();
  return Promise.resolve(notes || "桌面端内部开发版本已发布。");
}

class SystemReleaseApi {
  constructor(baseUrl, token) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  async request(method, pathname, body) {
    const headers = { accept: "application/json", authorization: `Bearer ${this.token}` };
    if (body !== undefined) headers["content-type"] = "application/json";
    const response = await fetch(`${this.baseUrl}${pathname}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok) {
      const message = payload?.error?.message || response.statusText || "Unknown system API error.";
      throw new Error(`${method} ${pathname} failed: ${message}`);
    }
    return payload.data;
  }

  async findRelease(version) {
    let page = 1;
    while (true) {
      const result = await this.request("GET", `/api/v1/system/releases?page=${page}&per_page=100`);
      const matched = (result.items || []).find((item) => item.version_name === version);
      if (matched) return this.request("GET", `/api/v1/system/releases/${matched.id}`);
      if (!result.pagination || page >= result.pagination.total_pages) return null;
      page += 1;
    }
  }

  createRelease(input) { return this.request("POST", "/api/v1/system/releases", input); }
  createAsset(releaseId, input) { return this.request("POST", `/api/v1/system/releases/${releaseId}/assets`, input); }
  uploadUrl(releaseId, assetId) { return this.request("GET", `/api/v1/system/releases/${releaseId}/assets/${assetId}/upload-url`); }
  downloadUrl(releaseId, assetId) { return this.request("GET", `/api/v1/system/releases/${releaseId}/assets/${assetId}/download-url`); }
  markUploaded(releaseId, assetId) { return this.request("POST", `/api/v1/system/releases/${releaseId}/assets/${assetId}/uploaded`); }
  verifyRelease(releaseId) { return this.request("POST", `/api/v1/system/releases/${releaseId}/verify`); }
  updateRelease(releaseId, input) { return this.request("PATCH", `/api/v1/system/releases/${releaseId}`, input); }
}

export function signedUploadHeaders(requestHeaders, asset) {
  const headers = new Headers();
  for (const entry of requestHeaders || []) {
    const [name, value] = Array.isArray(entry) ? entry : [entry?.name, entry?.value];
    if (name && value != null) headers.set(name, value);
  }
  if (!headers.has("content-type")) headers.set("content-type", asset.contentType);
  headers.set("content-length", String(asset.byteSize));
  return headers;
}

async function uploadSignedAsset(asset, signed) {
  const request = signed?.request || {};
  const response = await fetch(request.url, {
    method: request.method || "PUT",
    headers: signedUploadHeaders(request.headers, asset),
    body: createReadStream(asset.filePath),
    duplex: "half",
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`OSS upload failed for ${asset.canonicalName}: ${response.status} ${body.slice(0, 400)}`);
  }
}

async function sha256Response(response, filename) {
  if (!response.ok) throw new Error(`OSS readback failed for ${filename}: ${response.status}.`);
  if (!response.body) throw new Error(`OSS readback returned no body for ${filename}.`);
  const hash = createHash("sha256");
  let byteSize = 0;
  for await (const chunk of response.body) {
    byteSize += chunk.byteLength;
    hash.update(chunk);
  }
  return { byteSize, sha256: hash.digest("hex") };
}

export function existingAssetFor(asset, release) {
  const matches = (release.assets || []).filter((item) => item.filename === asset.canonicalName);
  if (matches.length > 1) throw new Error(`Existing release has duplicate asset ${asset.canonicalName}.`);
  const existing = matches[0] || null;
  if (existing && (
    existing.platform !== asset.platform
    || existing.architecture !== asset.architecture
    || existing.artifact_kind !== asset.artifactKind
    || existing.status !== "uploaded"
    || Number(existing.byte_size) !== asset.byteSize
    || existing.checksum_sha256 !== asset.sha256
  )) {
    throw new Error(`Existing release asset ${asset.canonicalName} does not match the verified evidence.`);
  }
  return existing;
}

export function planReleaseAssetUploads(assets, release) {
  const expectedNames = new Set(assets.map((asset) => asset.canonicalName));
  const unexpected = (release.assets || []).filter((asset) => !expectedNames.has(asset.filename));
  if (unexpected.length > 0) {
    throw new Error(`Existing release contains unexpected asset ${unexpected[0].filename}.`);
  }
  return assets.map((asset) => ({ asset, existing: existingAssetFor(asset, release) }));
}

function assertReleaseIdentity(release, preflight, version) {
  const expected = {
    version_name: version,
    channel: "internal",
    manifest_sha256: preflight.manifestDigest,
    signing_key_id: preflight.manifest.signing.key_id,
    source_commit: preflight.manifest.source.commit,
    source_tag: preflight.manifest.tag,
  };
  for (const [name, value] of Object.entries(expected)) {
    if (release[name] !== value) throw new Error(`Existing release ${name} conflicts with verified evidence.`);
  }
}

async function readBackAsset(api, releaseId, remoteAsset, expected) {
  const signed = await api.downloadUrl(releaseId, remoteAsset.id);
  if (signed.checksum_sha256 !== expected.sha256) {
    throw new Error(`System checksum metadata mismatch for ${expected.canonicalName}.`);
  }
  const actual = await sha256Response(await fetch(signed.request.url), expected.canonicalName);
  if (actual.byteSize !== expected.byteSize || actual.sha256 !== expected.sha256) {
    throw new Error(`OSS readback digest mismatch for ${expected.canonicalName}.`);
  }
}

export async function publishRelease(api, version, preflight, title, notes) {
  let detail = await api.findRelease(version);
  if (detail) {
    if (detail.release.status === "withdrawn") throw new Error(`Version ${version} was withdrawn and cannot be reused.`);
    assertReleaseIdentity(detail.release, preflight, version);
  } else {
    detail = await api.createRelease({
      version_name: version,
      title,
      notes,
      channel: "internal",
      manifest_sha256: preflight.manifestDigest,
      signing_key_id: preflight.manifest.signing.key_id,
      source_commit: preflight.manifest.source.commit,
      source_tag: preflight.manifest.tag,
    });
  }

  const uploadPlan = planReleaseAssetUploads(preflight.artifacts, detail);
  if (detail.release.status === "published" && uploadPlan.some(({ existing }) => !existing)) {
    throw new Error(`Published version ${version} does not contain the complete verified evidence set.`);
  }

  for (const { asset, existing } of uploadPlan) {
    let remote = existing;
    if (!remote) {
      console.log(`Uploading ${asset.canonicalName}.`);
      remote = await api.createAsset(detail.release.id, {
        platform: asset.platform,
        architecture: asset.architecture,
        artifact_kind: asset.artifactKind,
        original_filename: asset.canonicalName,
        content_type: asset.contentType,
        byte_size: asset.byteSize,
        checksum_sha256: asset.sha256,
      });
      await uploadSignedAsset(asset, await api.uploadUrl(detail.release.id, remote.id));
      remote = await api.markUploaded(detail.release.id, remote.id);
    } else {
      console.log(`Reusing verified asset ${asset.canonicalName}.`);
    }
    await readBackAsset(api, detail.release.id, remote, asset);
  }

  if (detail.release.status === "published") return detail;
  if (detail.release.verification_status !== "verified") {
    detail = await api.verifyRelease(detail.release.id);
  }
  return api.updateRelease(detail.release.id, {
    version_name: version,
    title,
    notes,
    publish: true,
  });
}

async function main() {
  const version = releaseVersion();
  const source = await resolveReleaseEvidenceDirectory(version);
  try {
    const expectedTag = String(process.env.YUANCE_DESKTOP_RELEASE_TAG || `desktop-v${version}`).trim();
    const expectedCommit = String(process.env.YUANCE_DESKTOP_SOURCE_COMMIT || process.env.GITHUB_SHA || "").trim();
    if (!/^[0-9a-f]{40}$/u.test(expectedCommit)) {
      throw new Error("YUANCE_DESKTOP_SOURCE_COMMIT or GITHUB_SHA must be a lowercase 40-character commit SHA.");
    }
    const expectedRepository = String(
      process.env.YUANCE_GITHUB_REPOSITORY || process.env.GITHUB_REPOSITORY || "",
    ).trim();
    if (!expectedRepository) throw new Error("YUANCE_GITHUB_REPOSITORY or GITHUB_REPOSITORY is required.");
    const publicKeyPath = path.resolve(requiredEnvironment("YUANCE_MINISIGN_PUBLIC_KEY_FILE"));
    const preflight = await preflightReleaseEvidence({
      directory: source.directory,
      version,
      publicKeyPath,
      minisignBinary: process.env.MINISIGN_BIN || "minisign",
      expectedTag,
      expectedCommit,
      expectedRepository,
    });
    console.log(`Verified ${preflight.artifacts.length} evidence files for ${preflight.manifest.tag}.`);
    if (dryRun) return;

    const title = String(process.env.YUANCE_RELEASE_TITLE || `元策桌面端 v${version}`).trim();
    const notes = await releaseNotes();
    const published = await publishRelease(
      new SystemReleaseApi(systemApiBaseUrl(), requiredEnvironment("YUANCE_SYSTEM_API_TOKEN")),
      version,
      preflight,
      title,
      notes,
    );
    console.log(`Published system release ${published.release.version_name} (id=${published.release.id}).`);
  } finally {
    if (source.cleanup) await rm(source.directory, { recursive: true, force: true });
  }
}

function isScriptEntrypoint() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isScriptEntrypoint()) {
  main().catch((error) => {
    console.error(`Desktop release publication failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
