import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createUploadExecutor } from "../src/files/upload-executor.mjs";
import { createTrustedNetworkSession } from "../src/network/network-session.mjs";
import { createOperationRegistry } from "../src/network/operation-registry.mjs";

const binding = Object.freeze({ profileEpoch: 1, authorizationVersion: 2, webContentsId: 3, frameRoutingId: 4 });

async function fixture(t, delegate, { content = Buffer.from("upload canary"), timeoutMs = 1_000, expectedBytesDelta = 0 } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-upload-executor-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const privatePath = path.join(root, "snapshot.bin");
  await fs.writeFile(privatePath, content);
  let removed = 0;
  let fileConsumed = false;
  let grantConsumed = false;
  const snapshot = Object.freeze({
    privatePath,
    filename: "snapshot.bin",
    contentType: "application/octet-stream",
    byteSize: content.length,
    sha256: createHash("sha256").update(content).digest("hex"),
    remove: async () => { removed += 1; await fs.unlink(privatePath).catch(() => {}); },
  });
  const contract = Object.freeze({
    version: 1,
    purpose: "upload",
    method: "PUT",
    url: "https://objects.example/file?signature=opaque",
    origin: "https://objects.example",
    headers: Object.freeze([Object.freeze(["content-type", "application/octet-stream"])]),
    expectedBytes: content.length + expectedBytesDelta,
    contentType: "application/octet-stream",
    sha256: snapshot.sha256,
    expiresAt: Date.now() + 60_000,
  });
  const network = await createTrustedNetworkSession({
    electronSession: { fromPartition: () => ({ async clearStorageData() {}, async clearCache() {}, async clearAuthCache() {}, fetch: delegate }) },
    mode: "production",
    allowedOrigin: "https://api.example",
  });
  const registry = createOperationRegistry();
  const executor = createUploadExecutor({
    fileVault: { consume: (_capability, actual) => { assert.deepEqual(actual, { ...binding, purpose: "upload" }); if (fileConsumed) throw invalid(); fileConsumed = true; return snapshot; } },
    grantVault: { consume: (_grant, actual) => { assert.deepEqual(actual, { ...binding, purpose: "upload" }); if (grantConsumed) throw invalid(); grantConsumed = true; return contract; } },
    fetchImpl: network.transferFetch,
    timeoutMs,
    openSnapshot: testOpenSnapshot,
    platform: "linux",
    registry,
  });
  return { executor, privatePath, snapshot, contract, registry, removed: () => removed };
}

test("streams a verified snapshot with fixed no-ambient request fields", async (t) => {
  const calls = [];
  const value = await fixture(t, async (url, options) => {
    const bytes = Buffer.from(await new Response(options.body).arrayBuffer());
    calls.push({ url, options, bytes });
    return uploadResponse(204, url);
  });
  assert.deepEqual(await value.executor.execute({ fileCapability: "file", transferGrant: "grant", binding }), { status: "completed", byteSize: 13 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].bytes.toString(), "upload canary");
  assert.equal(calls[0].options.redirect, "manual");
  assert.equal(calls[0].options.credentials, "omit");
  assert.equal(new Headers(calls[0].options.headers).has("authorization"), false);
  assert.equal(value.removed(), 1);
  await assert.rejects(fs.access(value.privatePath), { code: "ENOENT" });
});

test("rejects metadata drift before network and still consumes both capabilities", async (t) => {
  let requests = 0;
  const value = await fixture(t, async () => { requests += 1; return uploadResponse(204); }, { expectedBytesDelta: 1 });
  await assert.rejects(value.executor.execute({ fileCapability: "file", transferGrant: "grant", binding }), (error) => error.code === "file_transfer_contract_mismatch");
  assert.equal(requests, 0);
  assert.equal(value.removed(), 1);
  await assert.rejects(value.executor.execute({ fileCapability: "file", transferGrant: "grant", binding }));
});

test("detects spool mutation during transfer and never permits replay", async (t) => {
  const value = await fixture(t, async (url, options) => {
    await fs.writeFile(value.privatePath, "changed bytes");
    await new Response(options.body).arrayBuffer();
    return uploadResponse(204, url);
  });
  await assert.rejects(value.executor.execute({ fileCapability: "file", transferGrant: "grant", binding }), (error) => error.code === "file_transfer_source_changed");
  assert.equal(value.removed(), 1);
  await assert.rejects(value.executor.execute({ fileCapability: "file", transferGrant: "grant", binding }));
});

test("rejects redirects, auth challenges, URL drift, and network failures with stable errors", async (t) => {
  for (const response of [uploadResponse(307), uploadResponse(401), uploadResponse(407), uploadResponse(204, "https://other.example/file")]) {
    const value = await fixture(t, async (_url, options) => { await new Response(options.body).arrayBuffer(); return response; });
    await assert.rejects(value.executor.execute({ fileCapability: "file", transferGrant: "grant", binding }), (error) => error.code === "file_transfer_response_invalid" && !error.message.includes("objects.example"));
    assert.equal(value.removed(), 1);
  }
  const failed = await fixture(t, async () => { throw new Error("https://secret.example Bearer secret"); });
  await assert.rejects(failed.executor.execute({ fileCapability: "file", transferGrant: "grant", binding }), (error) => error.code === "file_transfer_network_error" && !error.message.includes("secret"));
});

test("aborts timeout and external cancellation while cleaning the snapshot", async (t) => {
  for (const external of [false, true]) {
    const value = await fixture(t, async (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true })), { timeoutMs: 10 });
    const controller = new AbortController();
    if (external) setImmediate(() => controller.abort());
    await assert.rejects(value.executor.execute({ fileCapability: "file", transferGrant: "grant", binding, signal: controller.signal }), (error) => error.code === "file_transfer_aborted");
    assert.equal(value.removed(), 1);
  }
});

test("operation registry aborts active uploads and releases the slot after cleanup", async (t) => {
  const value = await fixture(t, async (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true })));
  const pending = value.executor.execute({ fileCapability: "file", transferGrant: "grant", binding });
  setImmediate(() => value.registry.abortAll());
  await assert.rejects(pending, (error) => error.code === "file_transfer_aborted");
  assert.deepEqual(value.registry.snapshot(), { active: 0 });
  assert.equal(value.removed(), 1);
});

function uploadResponse(status, url = "") {
  const response = new Response(null, { status });
  Object.defineProperty(response, "url", { value: url });
  return response;
}
function invalid() { return Object.assign(new Error("invalid"), { code: "file_transfer_grant_invalid" }); }

async function testOpenSnapshot({ filePath }) {
  const handle = await fs.open(filePath, "r");
  const identity = identityFrom(await handle.stat({ bigint: true }));
  return Object.freeze({ handle, identity, currentIdentity: async () => identityFrom(await handle.stat({ bigint: true })) });
}
function identityFrom(stats) {
  return Object.freeze({ dev: String(stats.dev), ino: String(stats.ino), size: Number(stats.size), mtimeNs: String(stats.mtimeNs), ctimeNs: String(stats.ctimeNs) });
}
