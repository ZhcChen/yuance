import assert from "node:assert/strict";
import test from "node:test";

import { createDesktopProfile } from "../src/auth/profile.mjs";
import { createPreviewContentLoader } from "../src/files/preview-content-loader.mjs";
import { createTrustedNetworkSession } from "../src/network/network-session.mjs";

const profile = createDesktopProfile({ endpoint: "https://yuance.example", serverInstanceId: "server-1" });

async function trustedFetch(responder) {
  const chromium = { clearStorageData: async () => {}, clearCache: async () => {}, clearAuthCache: async () => {}, fetch: responder };
  return (await createTrustedNetworkSession({ electronSession: { fromPartition: () => chromium }, mode: "production", allowedOrigin: profile.origin })).fetch;
}

test("loads exact authenticated preview bytes into the private spool", async () => {
  const calls = [];
  const fetchImpl = await trustedFetch(async (url, options) => {
    calls.push({ url, options });
    return new Response("preview", { status: 200, headers: { "content-type": "text/plain", "content-length": "7", "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
  });
  const snapshots = [];
  const loader = createPreviewContentLoader({ profile, fetchImpl, credentialRuntime: { withAccessLease: (operation) => operation({ accessToken: "yuance_dat_secret", epoch: 3 }), refreshAccess: async () => false }, spool: { capture: async (stream, metadata) => { snapshots.push(metadata); return Object.freeze({ privatePath: "/private/preview", contentType: metadata.contentType, byteSize: metadata.expectedBytes, remove: async () => {} }); } } });
  const result = await loader.load({ contentPath: "/api/v1/projects/YCE/attachments/7/preview/content", contentType: "text/plain", byteSize: 7 });
  assert.equal(result.privatePath, "/private/preview");
  assert.equal(calls[0].options.headers.Authorization, "Bearer yuance_dat_secret");
  assert.deepEqual(snapshots, [{ contentType: "text/plain", expectedBytes: 7 }]);
});

test("rejects arbitrary paths and mismatched response metadata", async () => {
  const fetchImpl = await trustedFetch(async () => new Response("preview", { status: 200, headers: { "content-type": "text/html", "content-length": "7", "cache-control": "private, no-store", "x-content-type-options": "nosniff" } }));
  const loader = createPreviewContentLoader({ profile, fetchImpl, credentialRuntime: { withAccessLease: (operation) => operation({ accessToken: "token", epoch: 1 }), refreshAccess: async () => false }, spool: { capture: async () => assert.fail("invalid response must not reach spool") } });
  await assert.rejects(loader.load({ contentPath: "https://attacker.invalid/file", contentType: "text/plain", byteSize: 7 }), (error) => error.code === "preview_request_invalid");
  await assert.rejects(loader.load({ contentPath: "/api/v1/projects/YCE/attachments/7/preview/content", contentType: "text/plain", byteSize: 7 }), (error) => error.code === "preview_response_invalid");
});

test("accepts one canonical resource access grant and rejects query injection", async () => {
  const calls = [];
  const fetchImpl = await trustedFetch(async (url) => {
    calls.push(url);
    return new Response("preview", { status: 200, headers: { "content-type": "text/plain", "content-length": "7", "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
  });
  const loader = createPreviewContentLoader({ profile, fetchImpl, credentialRuntime: { withAccessLease: (operation) => operation({ accessToken: "token", epoch: 1 }), refreshAccess: async () => false }, spool: { capture: async () => Object.freeze({ privatePath: "/private/resource-preview", contentType: "text/plain", byteSize: 7, remove: async () => {} }) } });
  const path = "/api/v1/projects/YCE/resources/8/attachments/7/preview/content?access=grant+token";
  await loader.load({ contentPath: path, contentType: "text/plain", byteSize: 7 });
  assert.equal(calls[0], `${profile.origin}${path}`);
  for (const invalid of [`${path}&url=https%3A%2F%2Fattacker.invalid`, `${path}&access=second`, `${path}#fragment`]) {
    await assert.rejects(loader.load({ contentPath: invalid, contentType: "text/plain", byteSize: 7 }), (error) => error.code === "preview_request_invalid");
  }
});
