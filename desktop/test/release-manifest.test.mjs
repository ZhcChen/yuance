import assert from "node:assert/strict";
import test from "node:test";

import {
  createDesktopReleaseManifest,
  parseDesktopReleaseManifest,
  releaseAssetEvidenceNames,
  releaseAssetOsSignature,
  serializeDesktopReleaseManifest,
} from "../src/release-manifest.mjs";
import {
  DESKTOP_RELEASE_TARGETS,
  canonicalReleaseAssetName,
  releaseAssetContentType,
} from "../src/release-assets.mjs";

const DIGEST = "a".repeat(64);
const SBOM_DIGEST = "b".repeat(64);

function validManifestInput() {
  const version = "0.1.0";
  return {
    version,
    tag: `desktop-v${version}`,
    source: {
      commit: "c".repeat(40),
      repository: "ZhcChen/yuance",
      workflow_run: "12345",
    },
    signing: { algorithm: "minisign", key_id: "0123456789ABCDEF" },
    assets: DESKTOP_RELEASE_TARGETS.map((target) => {
      const filename = canonicalReleaseAssetName({ version, ...target });
      const evidence = releaseAssetEvidenceNames(filename);
      return {
        filename,
        platform: target.platform,
        architecture: target.architecture,
        byte_size: 1024,
        sha256: DIGEST,
        content_type: releaseAssetContentType(filename),
        os_signature: releaseAssetOsSignature(target.platform),
        integrity_signature: evidence.integritySignature,
        sbom: { filename: evidence.sbom, sha256: SBOM_DIGEST },
        provenance: {
          reference: "https://github.com/ZhcChen/yuance/attestations/9876",
          subject_sha256: DIGEST,
        },
      };
    }),
  };
}

test("creates a deterministic internal manifest in the fixed target order", () => {
  const input = validManifestInput();
  input.assets.reverse();
  const manifest = createDesktopReleaseManifest(input);

  assert.equal(manifest.schema_version, 1);
  assert.equal(manifest.channel, "internal");
  assert.deepEqual(
    manifest.assets.map(({ platform, architecture }) => `${platform}:${architecture}`),
    ["macos:x64", "macos:arm64", "windows:x64", "windows:arm64", "linux:x64", "linux:arm64"],
  );
  assert.equal(serializeDesktopReleaseManifest(manifest), serializeDesktopReleaseManifest(manifest));
  assert.ok(Object.isFrozen(manifest));
});

test("freezes OS and integrity signature semantics", () => {
  assert.equal(releaseAssetOsSignature("macos"), "adhoc");
  assert.equal(releaseAssetOsSignature("windows"), "none");
  assert.equal(releaseAssetOsSignature("linux"), "none");
  assert.deepEqual(releaseAssetEvidenceNames("Yuance-0.1.0-linux-x64.AppImage"), {
    integritySignature: "Yuance-0.1.0-linux-x64.AppImage.minisig",
    sbom: "Yuance-0.1.0-linux-x64.AppImage.cdx.json",
  });
  assert.throws(() => releaseAssetEvidenceNames("../secret.exe"), /filename is invalid/);
  assert.throws(() => releaseAssetEvidenceNames("asset.exe\nsecret"), /filename is invalid/);
  assert.throws(() => releaseAssetEvidenceNames("https://example.test/asset.exe"), /filename is invalid/);
});

test("rejects incomplete, duplicate, and mismatched target contracts", () => {
  const missing = validManifestInput();
  missing.assets.pop();
  assert.throws(() => createDesktopReleaseManifest(missing), /exactly six targets/);

  const duplicate = validManifestInput();
  duplicate.assets[5] = { ...duplicate.assets[0] };
  assert.throws(() => createDesktopReleaseManifest(duplicate), /Duplicate desktop release asset/);

  const wrongSignature = validManifestInput();
  wrongSignature.assets[0] = { ...wrongSignature.assets[0], os_signature: "none" };
  assert.throws(() => createDesktopReleaseManifest(wrongSignature), /contract mismatch/);
});

test("rejects invalid source, signing identity, SBOM, and provenance", () => {
  const source = validManifestInput();
  source.source.repository = "https://github.com/ZhcChen/yuance";
  assert.throws(() => createDesktopReleaseManifest(source), /source is invalid/);

  const signing = validManifestInput();
  signing.signing.key_id = "not-a-key";
  assert.throws(() => createDesktopReleaseManifest(signing), /signing identity is invalid/);

  const sbom = validManifestInput();
  sbom.assets[0] = { ...sbom.assets[0], sbom: { ...sbom.assets[0].sbom, filename: "other.json" } };
  assert.throws(() => createDesktopReleaseManifest(sbom), /SBOM mapping is invalid/);

  const provenance = validManifestInput();
  provenance.assets[0] = {
    ...provenance.assets[0],
    provenance: { ...provenance.assets[0].provenance, subject_sha256: "d".repeat(64) },
  };
  assert.throws(() => createDesktopReleaseManifest(provenance), /provenance mapping is invalid/);
});

test("parser rejects unknown fields, schema versions, channels, and version/tag drift", () => {
  const manifest = createDesktopReleaseManifest(validManifestInput());
  assert.equal(parseDesktopReleaseManifest(manifest).tag, "desktop-v0.1.0");
  assert.throws(() => parseDesktopReleaseManifest({ ...manifest, secret: "value" }), /unknown or missing/);
  assert.throws(() => parseDesktopReleaseManifest({ ...manifest, schema_version: 2 }), /schema version/);
  assert.throws(() => parseDesktopReleaseManifest({ ...manifest, channel: "stable" }), /channel must be internal/);
  assert.throws(() => parseDesktopReleaseManifest({ ...manifest, tag: "desktop-v0.1.1" }), /exactly match/);
});
