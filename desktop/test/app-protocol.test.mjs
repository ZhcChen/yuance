import assert from "node:assert/strict";
import test from "node:test";

import {
  APP_CONTENT_SECURITY_POLICY,
  resolveAppProtocolRequest,
} from "../src/protocol/app-protocol.mjs";

const manifest = Object.freeze({
  version: 1,
  entrypoint: "/index.html",
  files: Object.freeze({
    "/index.html": Object.freeze({ relativePath: "index.html", bytes: 10, sha256: "a".repeat(64) }),
    "/assets/app.js": Object.freeze({ relativePath: "assets/app.js", bytes: 20, sha256: "b".repeat(64) }),
    "/assets/app-cccccccc.css": Object.freeze({ relativePath: "assets/app-cccccccc.css", bytes: 30, sha256: "c".repeat(64) }),
  }),
});

test("resolves manifest resources and explicit SPA routes", () => {
  const root = resolveAppProtocolRequest({ method: "GET", url: "app://yuance/" }, manifest);
  const asset = resolveAppProtocolRequest({ method: "HEAD", url: "app://yuance/assets/app.js?v=1#ignored" }, manifest);
  const route = resolveAppProtocolRequest({ method: "GET", url: "app://yuance/projects/p-1/work-items/w-1" }, manifest);

  assert.equal(root.resourcePath, "/index.html");
  assert.equal(route.resourcePath, "/index.html");
  assert.equal(asset.resourcePath, "/assets/app.js");
  assert.equal(asset.headOnly, true);
  assert.equal(asset.headers["Content-Type"], "text/javascript; charset=utf-8");
  assert.equal(asset.headers["Cache-Control"], "no-cache");
  assert.equal(root.headers["Cache-Control"], "no-store");
  assert.equal(
    resolveAppProtocolRequest({ method: "GET", url: "app://yuance/assets/app-cccccccc.css" }, manifest).headers["Cache-Control"],
    "public, max-age=31536000, immutable",
  );
});

test("uses the complete fail-closed CSP", () => {
  for (const directive of [
    "script-src 'self'",
    "connect-src 'none'",
    "worker-src 'none'",
    "object-src 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ]) {
    assert.match(APP_CONTENT_SECURITY_POLICY, new RegExp(directive.replace(/[']/g, "\\'")));
  }
  assert.doesNotMatch(APP_CONTENT_SECURITY_POLICY, /unsafe-inline|unsafe-eval|https?:/);
});

test("rejects unsupported methods, bodies, authorities, and reserved routes", () => {
  const cases = [
    [{ method: "POST", url: "app://yuance/" }, 405],
    [{ method: "GET", url: "app://yuance/", body: "value" }, 400],
    [{ method: "GET", url: "app://other/" }, 403],
    [{ method: "GET", url: "app://user@yuance/" }, 403],
    [{ method: "GET", url: "app://yuance:444/" }, 403],
    [{ method: "GET", url: "app://yuance/api" }, 404],
    [{ method: "GET", url: "app://yuance/.well-known/test" }, 404],
    [{ method: "GET", url: "app://yuance/unknown-route" }, 404],
    [{ method: "GET", url: "app://yuance/assets/missing.js" }, 404],
    [{ method: "GET", url: "app://yuance/projects/missing.js" }, 404],
    [{ method: "GET", url: "app://yuance/auth/missing.css" }, 404],
  ];
  for (const [request, status] of cases) {
    assert.equal(resolveAppProtocolRequest(request, manifest).status, status, request.url);
  }
});

test("rejects non-canonical SPA path variants", () => {
  for (const url of [
    "app://yuance/projects//item",
    "app://yuance/projects/%61dmin",
    "app://yuance/projects/%3f/value",
    "app://yuance/projects/%EF%BC%8Fadmin",
    "app://yuance/projects/%E9%A1%B9%E7%9B%AE",
    "app://yuance/projects/%0Aadmin",
  ]) {
    assert.equal(resolveAppProtocolRequest({ method: "GET", url }, manifest).status, 400, url);
  }
});

test("rejects traversal and encoded separator variants", () => {
  for (const url of [
    "app://yuance/../index.html",
    "app://yuance/%2e%2e/index.html",
    "app://yuance/%252e%252e/index.html",
    "app://yuance/assets%2fapp.js",
    "app://yuance/assets%255capp.js",
    "app://yuance/assets\\app.js",
    "app://yuance/%00index.html",
  ]) {
    assert.equal(resolveAppProtocolRequest({ method: "GET", url }, manifest).ok, false, url);
  }
});
