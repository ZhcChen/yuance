import assert from "node:assert/strict";
import test from "node:test";

import { parseTransferContract } from "../src/files/transfer-contract.mjs";

const NOW = Date.UTC(2026, 7, 2, 10, 0, 0);

function contract(overrides = {}) {
  const base = {
    schema_version: 1,
    purpose: "upload",
    request: {
      method: "PUT",
      url: "https://objects.example/upload?signature=opaque",
      headers: [["content-type", "text/plain; charset=utf-8"]],
    },
    expected_bytes: 34,
    content_type: "text/plain; charset=utf-8",
    sha256: "a".repeat(64),
    expires_in_seconds: 60,
    expires_at: new Date(NOW + 60_000).toISOString(),
  };
  return { ...base, ...overrides, request: { ...base.request, ...(overrides.request ?? {}) } };
}

function parse(value, options = {}) {
  return parseTransferContract(value, { apiOrigin: "https://api.example", expectedPurpose: value.purpose, now: () => NOW, ...options });
}

test("parses upload and download contracts into frozen private requests", () => {
  const upload = parse(contract());
  assert.deepEqual(upload, {
    version: 1,
    purpose: "upload",
    method: "PUT",
    url: "https://objects.example/upload?signature=opaque",
    origin: "https://objects.example",
    headers: [["content-type", "text/plain; charset=utf-8"]],
    expectedBytes: 34,
    contentType: "text/plain; charset=utf-8",
    sha256: "a".repeat(64),
    expiresAt: NOW + 60_000,
  });
  assert.equal(Object.isFrozen(upload), true);
  assert.equal(Object.isFrozen(upload.headers[0]), true);

  const download = parse(contract({ purpose: "download", request: { method: "GET", url: "https://cdn.example/file?signature=opaque", headers: [] } }));
  assert.equal(download.method, "GET");
  assert.deepEqual(download.headers, []);
});

test("accepts only the fixed same-origin loopback canary route", () => {
  const canary = contract({ request: { url: "/api/v1/device-file-transfer/canary/upload?grant=opaque" } });
  const parsed = parseTransferContract(canary, { apiOrigin: "http://127.0.0.1:3000", expectedPurpose: "upload", now: () => NOW, allowLoopbackHttp: true });
  assert.equal(parsed.url, "http://127.0.0.1:3000/api/v1/device-file-transfer/canary/upload?grant=opaque");
  for (const url of [
    "/api/v1/device-file-transfer/canary/download?grant=opaque",
    "/api/v1/device-file-transfer/canary/upload",
    "/api/v1/device-file-transfer/canary/upload/child?grant=opaque",
    "http://localhost:3000/api/v1/device-file-transfer/canary/upload?grant=opaque",
  ]) assert.throws(() => parseTransferContract(contract({ request: { url } }), { apiOrigin: "http://127.0.0.1:3000", expectedPurpose: "upload", now: () => NOW, allowLoopbackHttp: true }), invalidContract);
});

test("accepts only an explicitly selected same-origin business storage route", () => {
  const value = contract({
    content_type: "text/plain",
    request: { method: "PUT", url: "/api/v1/test-storage/upload?object_key=private", headers: [["content-type", "text/plain"]] },
  });
  const parsed = parseTransferContract(value, {
    apiOrigin: "http://127.0.0.1:3000",
    expectedPurpose: "upload",
    allowLoopbackHttp: true,
    allowedRelativePath: "/api/v1/test-storage/upload",
    now: () => NOW,
  });
  assert.equal(parsed.url, "http://127.0.0.1:3000/api/v1/test-storage/upload?object_key=private");
  assert.throws(() => parseTransferContract(value, {
    apiOrigin: "http://127.0.0.1:3000",
    expectedPurpose: "upload",
    allowLoopbackHttp: true,
    allowedRelativePath: "/api/v1/test-storage/download",
    now: () => NOW,
  }), (error) => error.code === "file_transfer_contract_invalid");
});

test("rejects unsafe URL forms, methods, and purpose drift", () => {
  const urls = [
    "http://objects.example/file?signature=x",
    "https://user:pass@objects.example/file?signature=x",
    "https://objects.example/file?signature=x#fragment",
    "https://objects.example\\attacker.invalid/file",
    "https://\u0440aypal.example/file?signature=x",
    "https://objects.example:443/file?signature=x",
    `https://objects.example/${"a".repeat(8192)}`,
    " https://objects.example/file",
  ];
  for (const url of urls) assert.throws(() => parse(contract({ request: { url } })), invalidContract, url);
  assert.throws(() => parse(contract({ request: { method: "POST" } })), invalidContract);
  assert.throws(() => parseTransferContract(contract(), { apiOrigin: "https://api.example", expectedPurpose: "download", now: () => NOW }), invalidContract);
});

test("rejects forbidden, duplicate, conflicting, and malformed headers", () => {
  for (const headers of [
    [["authorization", "Bearer secret"]],
    [["cookie", "session=secret"]],
    [["host", "objects.example"]],
    [["referer", "https://api.example"]],
    [["Content-Type", "text/plain"]],
    [["content-type", "text/plain"], ["content-type", "application/json"]],
    [["content-type", "text/plain\r\nx-injected: value"]],
    [["content-type", " text/plain"]],
    [["content-type", ""]],
    [["x-unknown", "value"]],
    [["content-type", "x".repeat(4097)]],
  ]) assert.throws(() => parse(contract({ request: { headers } })), invalidContract);
  assert.throws(() => parse(contract({ purpose: "download", request: { method: "GET", headers: [["content-type", "text/plain"]] } })), invalidContract);
});

test("rejects unknown fields, invalid metadata, and TTL boundaries", () => {
  for (const value of [
    { ...contract(), redirect: true },
    contract({ request: { redirect: "manual" } }),
    contract({ expected_bytes: 100 * 1024 * 1024 + 1 }),
    contract({ content_type: "text/plain\r\nx: y" }),
    contract({ sha256: "A".repeat(64) }),
    contract({ expires_in_seconds: 61 }),
    contract({ expires_in_seconds: 0 }),
    contract({ expires_at: NOW + 1_000 }),
    contract({ expires_at: "2026-08-02 10:00:01Z" }),
    contract({ expires_at: new Date(NOW).toISOString() }),
    contract({ expires_at: new Date(NOW + 60_001).toISOString() }),
  ]) assert.throws(() => parse(value), invalidContract);
  const shortened = parse(contract({ expires_in_seconds: 10 }));
  assert.equal(shortened.expiresAt, NOW + 10_000);
});

test("binds signed upload headers to expected metadata", () => {
  assert.throws(() => parse(contract({ request: { headers: [] } })), invalidContract);
  assert.throws(() => parse(contract({ request: { headers: [["content-type", "application/octet-stream"]] } })), invalidContract);
  assert.throws(() => parse(contract({ request: { headers: [["content-type", "text/plain; charset=utf-8"], ["content-length", "35"]] } })), invalidContract);
  const parsed = parse(contract({ request: { headers: [["content-type", "text/plain; charset=utf-8"], ["content-length", "34"]] } }));
  assert.equal(new Map(parsed.headers).get("content-length"), "34");
});

function invalidContract(error) { return error.code === "file_transfer_contract_invalid" && !error.message.includes("objects.example"); }
