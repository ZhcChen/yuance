import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  planReleaseAssetUploads,
  preflightReleaseEvidence,
  publishRelease,
  signedUploadHeaders,
} from "../../scripts/publish-desktop-release.mjs";
import {
  CYCLONEDX_ASSET_DIGEST_PROPERTY,
  createReleaseEvidenceManifest,
  createSha256Sums,
  sha256File,
} from "../src/release-evidence.mjs";
import {
  DESKTOP_RELEASE_TARGETS,
  canonicalReleaseAssetName,
  releaseAssetKey,
} from "../src/release-assets.mjs";
import { releaseAssetEvidenceNames, serializeDesktopReleaseManifest } from "../src/release-manifest.mjs";

function minisignPublicKey(keyId) {
  const payload = Buffer.alloc(42, 1);
  payload.write("Ed", 0, "ascii");
  Buffer.from(keyId, "hex").reverse().copy(payload, 2);
  return `untrusted comment: minisign public key ${keyId}\n${payload.toString("base64")}\n`;
}

async function evidenceFixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "yuance-publish-evidence-"));
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
  const manifest = await createReleaseEvidenceManifest({
    directory,
    version: "0.1.0",
    tag: "desktop-v0.1.0",
    source: { commit: "c".repeat(40), repository: "ZhcChen/yuance", workflow_run: "123" },
    signing: { algorithm: "minisign", key_id: "0123456789ABCDEF" },
    provenanceByTarget,
  });
  await writeFile(path.join(directory, "release-manifest.json"), serializeDesktopReleaseManifest(manifest));
  await writeFile(path.join(directory, "release-manifest.json.minisig"), "manifest signature");
  await writeFile(path.join(directory, "SHA256SUMS"), createSha256Sums(manifest));
  await writeFile(path.join(directory, "SHA256SUMS.minisig"), "sums signature");
  for (const asset of manifest.assets) {
    await writeFile(path.join(directory, asset.integrity_signature), "asset signature");
  }
  const publicKeyPath = path.join(directory, "..", `${path.basename(directory)}.pub`);
  t.after(() => rm(publicKeyPath, { force: true }));
  await writeFile(publicKeyPath, minisignPublicKey("0123456789ABCDEF"));
  return { directory, publicKeyPath, manifest };
}

function preflightInput(fixture, overrides = {}) {
  return {
    directory: fixture.directory,
    version: "0.1.0",
    publicKeyPath: fixture.publicKeyPath,
    expectedTag: "desktop-v0.1.0",
    expectedCommit: "c".repeat(40),
    expectedRepository: "ZhcChen/yuance",
    verifyToolVersion: async () => {},
    verifySignature: async () => {},
    ...overrides,
  };
}

test("preserves tuple-based signed headers and uses the verified file length", () => {
  const headers = signedUploadHeaders(
    [["x-yuance-signature", "signed-value"], ["content-length", "999"]],
    { contentType: "application/octet-stream", byteSize: 42 },
  );
  assert.equal(headers.get("x-yuance-signature"), "signed-value");
  assert.equal(headers.get("content-length"), "42");
});

test("preflight verifies the exact signed evidence set before publication", async (t) => {
  const fixture = await evidenceFixture(t);
  const verified = await preflightReleaseEvidence(preflightInput(fixture));
  assert.equal(verified.artifacts.length, 22);
  assert.match(verified.manifestDigest, /^[0-9a-f]{64}$/u);
  assert.equal(verified.artifacts.filter((asset) => asset.artifactKind === "installer").length, 6);
  assert.equal(verified.artifacts.filter((asset) => asset.artifactKind === "sbom").length, 6);
});

test("preflight rejects source mismatch and tampered bytes without API side effects", async (t) => {
  const fixture = await evidenceFixture(t);
  let apiCalls = 0;
  const api = { findRelease: async () => { apiCalls += 1; } };
  await assert.rejects(
    () => preflightReleaseEvidence(preflightInput(fixture, { expectedCommit: "d".repeat(40) })),
    /source commit/,
  );
  await writeFile(path.join(fixture.directory, fixture.manifest.assets[0].filename), "tampered");
  await assert.rejects(
    () => preflightReleaseEvidence(preflightInput(fixture)),
    /digest mismatch/,
  );
  assert.equal(apiCalls, 0);
  assert.equal(typeof api.findRelease, "function");
});

test("preflight rejects a signature verification failure", async (t) => {
  const fixture = await evidenceFixture(t);
  await assert.rejects(
    () => preflightReleaseEvidence(preflightInput(fixture, {
      verifySignature: async (_message, signature) => {
        if (signature.endsWith("SHA256SUMS.minisig")) throw new Error("signature mismatch");
      },
    })),
    /signature mismatch/,
  );
});

test("refuses a remote asset that conflicts with verified evidence", () => {
  const asset = {
    canonicalName: "Yuance-0.1.0-mac-arm64.dmg",
    platform: "macos",
    architecture: "arm64",
    artifactKind: "installer",
    byteSize: 10,
    sha256: "a".repeat(64),
  };
  assert.throws(
    () => planReleaseAssetUploads([asset], { assets: [{
      platform: "macos", architecture: "arm64", artifact_kind: "installer",
      filename: asset.canonicalName, byte_size: 10, status: "uploaded",
      checksum_sha256: "b".repeat(64),
    }] }),
    /does not match/,
  );
});

async function publicationHarness(t, { tamperReadback = false, failUploadId = 0 } = {}) {
  const objects = new Map();
  const server = createServer(async (request, response) => {
    const target = new URL(request.url || "/", "http://127.0.0.1");
    const match = target.pathname.match(/^\/objects\/(\d+)$/u);
    if (!match) { response.writeHead(404).end(); return; }
    const id = Number(match[1]);
    if (request.method === "PUT") {
      if (id === failUploadId) {
        response.writeHead(503).end("upload unavailable");
        return;
      }
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      objects.set(id, Buffer.concat(chunks));
      response.writeHead(200).end();
      return;
    }
    if (request.method === "GET") {
      const body = objects.get(id);
      response.writeHead(body ? 200 : 404);
      response.end(tamperReadback && id === 1 ? Buffer.from("tampered") : body);
      return;
    }
    response.writeHead(405).end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const calls = [];
  const assets = [];
  let release = null;
  const base = `http://127.0.0.1:${server.address().port}`;
  const api = {
    async findRelease() {
      calls.push("find");
      return release ? { release, assets } : null;
    },
    async createRelease(input) {
      calls.push("create-release");
      release = { id: 1, status: "draft", verification_status: "pending", ...input };
      return { release, assets: [] };
    },
    async createAsset(_releaseId, input) {
      calls.push(`create:${input.original_filename}`);
      const asset = { id: assets.length + 1, filename: input.original_filename, status: "pending", ...input };
      assets.push(asset);
      return asset;
    },
    async uploadUrl(_releaseId, id) {
      calls.push(`upload-url:${id}`);
      return { request: { method: "PUT", url: `${base}/objects/${id}`, headers: [] } };
    },
    async markUploaded(_releaseId, id) {
      calls.push(`uploaded:${id}`);
      const asset = assets[id - 1];
      asset.status = "uploaded";
      asset.byte_size = asset.byte_size;
      return asset;
    },
    async downloadUrl(_releaseId, id) {
      calls.push(`download-url:${id}`);
      return { request: { url: `${base}/objects/${id}` }, checksum_sha256: assets[id - 1].checksum_sha256 };
    },
    async verifyRelease() {
      calls.push("verify");
      release.verification_status = "verified";
      return { release, assets };
    },
    async updateRelease(_releaseId, input) {
      calls.push("publish");
      release = { ...release, ...input, status: "published" };
      return { release, assets };
    },
  };
  return { api, calls, assets, objects };
}

test("uploads and reads back one manifest-bound 22-file set before verify and publish", async (t) => {
  const fixture = await evidenceFixture(t);
  const preflight = await preflightReleaseEvidence(preflightInput(fixture));
  const harness = await publicationHarness(t);
  const result = await publishRelease(harness.api, "0.1.0", preflight, "内部版本", "测试发布");
  assert.equal(result.release.status, "published");
  assert.equal(harness.assets.length, 22);
  assert.equal(harness.objects.size, 22);
  assert.equal(harness.calls.filter((call) => call.startsWith("download-url:")).length, 22);
  assert.ok(harness.calls.indexOf("verify") > harness.calls.lastIndexOf("download-url:22"));
  assert.ok(harness.calls.indexOf("publish") > harness.calls.indexOf("verify"));
});

test("readback tampering leaves the release unverified and unpublished", async (t) => {
  const fixture = await evidenceFixture(t);
  const preflight = await preflightReleaseEvidence(preflightInput(fixture));
  const harness = await publicationHarness(t, { tamperReadback: true });
  await assert.rejects(
    () => publishRelease(harness.api, "0.1.0", preflight, "内部版本", "测试发布"),
    /readback digest mismatch/,
  );
  assert.equal(harness.calls.includes("verify"), false);
  assert.equal(harness.calls.includes("publish"), false);
});

test("an intermediate upload failure never verifies or publishes the draft", async (t) => {
  const fixture = await evidenceFixture(t);
  const preflight = await preflightReleaseEvidence(preflightInput(fixture));
  const harness = await publicationHarness(t, { failUploadId: 4 });
  await assert.rejects(
    () => publishRelease(harness.api, "0.1.0", preflight, "内部版本", "测试发布"),
    /OSS upload failed/,
  );
  assert.equal(harness.calls.includes("verify"), false);
  assert.equal(harness.calls.includes("publish"), false);
});

test("rerunning an identical published evidence set is idempotent and never uploads again", async (t) => {
  const fixture = await evidenceFixture(t);
  const preflight = await preflightReleaseEvidence(preflightInput(fixture));
  const harness = await publicationHarness(t);
  await publishRelease(harness.api, "0.1.0", preflight, "内部版本", "测试发布");
  const uploadCount = harness.calls.filter((call) => call.startsWith("create:")).length;
  const second = await publishRelease(
    harness.api,
    "0.1.0",
    preflight,
    "内部版本",
    "测试发布",
  );
  assert.equal(second.release.status, "published");
  assert.equal(harness.calls.filter((call) => call.startsWith("create:")).length, uploadCount);
  assert.equal(harness.calls.filter((call) => call === "publish").length, 1);
});
