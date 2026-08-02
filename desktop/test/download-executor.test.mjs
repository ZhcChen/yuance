import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createDownloadExecutor } from "../src/files/download-executor.mjs";
import { createTrustedNetworkSession } from "../src/network/network-session.mjs";
import { createOperationRegistry } from "../src/network/operation-registry.mjs";

const content = Buffer.from("download canary");
const binding = Object.freeze({ profileEpoch: 1, authorizationVersion: 2, webContentsId: 3, frameRoutingId: 4 });

async function fixture(delegate, { cancelled = false, timeoutMs = 1_000, writeFailure = false } = {}) {
  const written = [];
  let cleaned = 0;
  let committed = 0;
  let consumed = 0;
  const target = Object.freeze({
    publicFilename: "canary.bin",
    handle: { async write(bytes, offset, length) { if (writeFailure) throw new Error("disk full /private/path"); written.push(Buffer.from(bytes).subarray(offset, offset + length)); return { bytesWritten: length }; } },
    async commit(bytes) { assert.equal(bytes, content.length); committed += 1; },
    async cleanup() { cleaned += 1; },
  });
  const contract = Object.freeze({ version: 1, purpose: "download", method: "GET", url: "https://objects.example/file?signature=opaque", origin: "https://objects.example", headers: Object.freeze([]), expectedBytes: content.length, contentType: "application/octet-stream", sha256: createHash("sha256").update(content).digest("hex"), expiresAt: Date.now() + 60_000 });
  const network = await createTrustedNetworkSession({ electronSession: { fromPartition: () => ({ async clearStorageData() {}, async clearCache() {}, async clearAuthCache() {}, fetch: delegate }) }, mode: "production", allowedOrigin: "https://api.example" });
  const registry = createOperationRegistry();
  const executor = createDownloadExecutor({
    grantVault: { consume: (_grant, actual) => { consumed += 1; assert.deepEqual(actual, { ...binding, purpose: "download" }); return contract; } },
    targetManager: { choose: async () => cancelled ? null : target },
    fetchImpl: network.transferFetch,
    registry,
    timeoutMs,
  });
  return { executor, registry, written, cleaned: () => cleaned, committed: () => committed, consumed: () => consumed };
}

test("streams and verifies a download before committing the target", async () => {
  const value = await fixture(async (url, options) => {
    assert.equal(options.method, "GET");
    assert.equal(options.credentials, "omit");
    assert.deepEqual(options.headers, []);
    return response(content, { url });
  });
  assert.deepEqual(await value.executor.execute({ suggestedFilename: "canary.bin", transferGrant: "grant", binding }), { status: "completed", byteSize: 15, filename: "canary.bin" });
  assert.equal(Buffer.concat(value.written).toString(), "download canary");
  assert.equal(value.committed(), 1);
  assert.equal(value.cleaned(), 1);
  assert.deepEqual(value.registry.snapshot(), { active: 0 });
});

test("cancel leaves the grant unconsumed and performs no network request", async () => {
  let requests = 0;
  const value = await fixture(async () => { requests += 1; }, { cancelled: true });
  assert.deepEqual(await value.executor.execute({ suggestedFilename: "canary.bin", transferGrant: "grant", binding }), { status: "cancelled" });
  assert.equal(value.consumed(), 0);
  assert.equal(requests, 0);
});

test("rejects long, short, corrupt, wrong-type, redirect, status, and URL drift responses", async () => {
  const cases = [
    response(Buffer.concat([content, Buffer.from("x")])),
    response(content.subarray(0, -1)),
    response(Buffer.from("x".repeat(content.length))),
    response(content, { contentType: "text/plain" }),
    response(content, { status: 307 }),
    response(content, { status: 401 }),
    response(content, { url: "https://other.example/file" }),
  ];
  for (const candidate of cases) {
    const value = await fixture(async () => candidate);
    await assert.rejects(value.executor.execute({ suggestedFilename: "canary.bin", transferGrant: "grant", binding }), (error) => error.code.startsWith("file_transfer_") && !error.message.includes("objects.example"));
    assert.equal(value.committed(), 0);
    assert.equal(value.cleaned(), 1);
  }
});

test("maps write failure, timeout, external abort, and registry abort to stable cleanup", async () => {
  const disk = await fixture(async () => response(content), { writeFailure: true });
  await assert.rejects(disk.executor.execute({ suggestedFilename: "canary.bin", transferGrant: "grant", binding }), (error) => error.code === "file_transfer_failed" && !error.message.includes("private"));
  for (const mode of ["timeout", "external", "registry"]) {
    const value = await fixture(async (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true })), { timeoutMs: 10 });
    const controller = new AbortController();
    if (mode === "external") setImmediate(() => controller.abort());
    if (mode === "registry") setImmediate(() => value.registry.abortAll());
    await assert.rejects(value.executor.execute({ suggestedFilename: "canary.bin", transferGrant: "grant", binding, signal: controller.signal }), (error) => error.code === "file_transfer_aborted");
    assert.equal(value.cleaned(), 1);
    assert.deepEqual(value.registry.snapshot(), { active: 0 });
  }
});

function response(body, { status = 200, contentType = "application/octet-stream", url = "" } = {}) {
  const value = new Response(body, { status, headers: { "content-type": contentType, "content-length": String(body.length) } });
  Object.defineProperty(value, "url", { value: url });
  return value;
}
