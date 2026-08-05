import assert from "node:assert/strict";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  CYCLONEDX_ASSET_DIGEST_PROPERTY,
  createReleaseEvidenceManifest,
  createSha256Sums,
  readMinisignPublicKeyId,
  readCycloneDxSbom,
  sha256File,
  verifyReleaseEvidence,
} from "../src/release-evidence.mjs";
import {
  DESKTOP_RELEASE_TARGETS,
  canonicalReleaseAssetName,
  releaseAssetKey,
} from "../src/release-assets.mjs";
import { releaseAssetEvidenceNames, serializeDesktopReleaseManifest } from "../src/release-manifest.mjs";

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "yuance-release-evidence-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const provenanceByTarget = new Map();
  for (const [index, target] of DESKTOP_RELEASE_TARGETS.entries()) {
    const filename = canonicalReleaseAssetName({ version: "0.1.0", ...target });
    const assetPath = path.join(directory, filename);
    await writeFile(assetPath, `installer-${target.platform}-${target.architecture}`);
    const { sha256 } = await sha256File(assetPath);
    const { sbom } = releaseAssetEvidenceNames(filename);
    await writeFile(path.join(directory, sbom), `${JSON.stringify({
      bomFormat: "CycloneDX",
      specVersion: "1.6",
      metadata: {
        component: { type: "file", name: filename },
        properties: [{ name: CYCLONEDX_ASSET_DIGEST_PROPERTY, value: sha256 }],
      },
      components: [{ type: "application", name: "yuance-desktop" }],
    })}\n`);
    provenanceByTarget.set(
      releaseAssetKey(target.platform, target.architecture),
      `https://github.com/ZhcChen/yuance/attestations/${index + 1}`,
    );
  }
  return { directory, provenanceByTarget };
}

async function buildManifest(t) {
  const evidence = await fixture(t);
  const manifest = await createReleaseEvidenceManifest({
    ...evidence,
    version: "0.1.0",
    tag: "desktop-v0.1.0",
    source: {
      commit: "c".repeat(40),
      repository: "ZhcChen/yuance",
      workflow_run: "123",
    },
    signing: { algorithm: "minisign", key_id: "0123456789ABCDEF" },
  });
  return {
    ...evidence,
    manifest,
  };
}

async function completeEvidenceFixture(t) {
  const evidence = await buildManifest(t);
  await writeFile(path.join(evidence.directory, "release-manifest.json"), serializeDesktopReleaseManifest(evidence.manifest));
  await writeFile(path.join(evidence.directory, "release-manifest.json.minisig"), "manifest signature");
  await writeFile(path.join(evidence.directory, "SHA256SUMS"), createSha256Sums(evidence.manifest));
  await writeFile(path.join(evidence.directory, "SHA256SUMS.minisig"), "sums signature");
  for (const asset of evidence.manifest.assets) {
    await writeFile(path.join(evidence.directory, asset.integrity_signature), "asset signature");
  }
  const publicKeyPath = `${evidence.directory}.pub`;
  t.after(() => rm(publicKeyPath, { force: true }));
  await writeFile(publicKeyPath, minisignPublicKey("0123456789ABCDEF"));
  return { ...evidence, publicKeyPath };
}

function minisignPublicKey(keyId, commentKeyId = keyId) {
  const payload = Buffer.alloc(42, 1);
  payload.write("Ed", 0, "ascii");
  Buffer.from(keyId, "hex").reverse().copy(payload, 2);
  return `untrusted comment: minisign public key ${commentKeyId}\n${payload.toString("base64")}\n`;
}

test("streams installer and SBOM digests into a complete manifest", async (t) => {
  const { manifest } = await buildManifest(t);
  assert.equal(manifest.assets.length, 6);
  assert.equal(manifest.assets[0].byte_size, Buffer.byteLength("installer-macos-x64"));
  assert.equal(manifest.assets[0].provenance.subject_sha256, manifest.assets[0].sha256);
  assert.match(manifest.assets[0].sbom.sha256, /^[0-9a-f]{64}$/u);
});

test("emits deterministic SHA256SUMS for installers and SBOMs", async (t) => {
  const { manifest } = await buildManifest(t);
  const sums = createSha256Sums(manifest);
  const lines = sums.trimEnd().split("\n");
  assert.equal(lines.length, 12);
  assert.equal(lines[0], `${manifest.assets[0].sha256}  ${manifest.assets[0].filename}`);
  assert.equal(lines[1], `${manifest.assets[0].sbom.sha256}  ${manifest.assets[0].sbom.filename}`);
});

test("rejects missing provenance before producing a manifest", async (t) => {
  const evidence = await fixture(t);
  evidence.provenanceByTarget.delete("linux:arm64");
  await assert.rejects(() => createReleaseEvidenceManifest({
    ...evidence,
    version: "0.1.0",
    tag: "desktop-v0.1.0",
    source: { commit: "c".repeat(40), repository: "ZhcChen/yuance", workflow_run: "123" },
    signing: { algorithm: "minisign", key_id: "0123456789ABCDEF" },
  }), /Missing release provenance for linux:arm64/);
});

test("rejects SBOM digest drift and component identity drift", async (t) => {
  const evidence = await fixture(t);
  const filename = canonicalReleaseAssetName({ version: "0.1.0", ...DESKTOP_RELEASE_TARGETS[0] });
  const { sbom } = releaseAssetEvidenceNames(filename);
  const sbomPath = path.join(evidence.directory, sbom);
  await writeFile(sbomPath, `${JSON.stringify({
    bomFormat: "CycloneDX",
    specVersion: "1.6",
    metadata: {
      component: { type: "file", name: "other.dmg" },
      properties: [{ name: CYCLONEDX_ASSET_DIGEST_PROPERTY, value: "0".repeat(64) }],
    },
    components: [],
  })}\n`);
  await assert.rejects(() => readCycloneDxSbom(sbomPath, "a".repeat(64)), /not bound/);
  await assert.rejects(() => createReleaseEvidenceManifest({
    ...evidence,
    version: "0.1.0",
    tag: "desktop-v0.1.0",
    source: { commit: "c".repeat(40), repository: "ZhcChen/yuance", workflow_run: "123" },
    signing: { algorithm: "minisign", key_id: "0123456789ABCDEF" },
  }), /not bound/);
});

test("rejects empty evidence files", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "yuance-release-empty-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "empty.bin");
  await writeFile(filePath, "");
  await assert.rejects(() => sha256File(filePath), /must not be empty/);
});

test("rejects symbolic-link evidence", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "yuance-release-link-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(path.join(directory, "target.bin"), "content");
  await symlink(path.join(directory, "target.bin"), path.join(directory, "asset.bin"));
  await assert.rejects(() => sha256File(path.join(directory, "asset.bin")), /must be a regular file/);
});

test("verifies the exact signed evidence set", async (t) => {
  const evidence = await completeEvidenceFixture(t);
  const calls = [];
  const manifest = await verifyReleaseEvidence({
    directory: evidence.directory,
    publicKeyPath: evidence.publicKeyPath,
    expectedVersion: "0.1.0",
    verifySignature: async (...args) => calls.push(args.map((value) => path.basename(value))),
  });
  assert.equal(manifest.tag, "desktop-v0.1.0");
  assert.equal(calls.length, 8);
  assert.deepEqual(calls[0].slice(0, 2), ["release-manifest.json", "release-manifest.json.minisig"]);
});

test("rejects public key drift and unexpected evidence", async (t) => {
  const evidence = await completeEvidenceFixture(t);
  assert.equal(await readMinisignPublicKeyId(evidence.publicKeyPath), "0123456789ABCDEF");
  await writeFile(evidence.publicKeyPath, minisignPublicKey("FEDCBA9876543210"));
  await assert.rejects(() => verifyReleaseEvidence({
    directory: evidence.directory,
    publicKeyPath: evidence.publicKeyPath,
    verifySignature: async () => {},
  }), /does not match/);

  await writeFile(evidence.publicKeyPath, minisignPublicKey("0123456789ABCDEF"));
  await writeFile(path.join(evidence.directory, "secret.key"), "private");
  await assert.rejects(() => verifyReleaseEvidence({
    directory: evidence.directory,
    publicKeyPath: evidence.publicKeyPath,
    verifySignature: async () => {},
  }), /unexpected: secret.key/);
});

test("rejects a public key comment that does not match its payload", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "yuance-release-key-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const publicKeyPath = path.join(directory, "minisign.pub");
  await writeFile(publicKeyPath, minisignPublicKey("0123456789ABCDEF", "FEDCBA9876543210"));
  await assert.rejects(() => readMinisignPublicKeyId(publicKeyPath), /does not match its payload/);
});

test("rejects SHA256SUMS and asset byte drift", async (t) => {
  const evidence = await completeEvidenceFixture(t);
  await writeFile(path.join(evidence.directory, "SHA256SUMS"), "tampered\n");
  await assert.rejects(() => verifyReleaseEvidence({
    directory: evidence.directory,
    publicKeyPath: evidence.publicKeyPath,
    verifySignature: async () => {},
  }), /SHA256SUMS does not match/);

  await writeFile(path.join(evidence.directory, "SHA256SUMS"), createSha256Sums(evidence.manifest));
  await writeFile(path.join(evidence.directory, evidence.manifest.assets[0].filename), "tampered installer");
  await assert.rejects(() => verifyReleaseEvidence({
    directory: evidence.directory,
    publicKeyPath: evidence.publicKeyPath,
    verifySignature: async () => {},
  }), /asset digest mismatch/);
});
