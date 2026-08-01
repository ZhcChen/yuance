import assert from "node:assert/strict";
import test from "node:test";

import {
  browserWindowWebPreferences,
  decideNavigation,
  DEVELOPMENT_SESSION_PARTITION,
  isSafeExternalUrl,
  isTrustedRendererUrl,
  normalizeSafeExternalUrl,
  PRODUCTION_SESSION_PARTITION,
  resolveRendererTarget,
} from "../src/window/security-policy.mjs";

test("packaged runtime always selects the fixed app protocol target", () => {
  for (const rawDevServerUrl of [undefined, "http://127.0.0.1:4273", "https://attacker.example"] ) {
    assert.deepEqual(resolveRendererTarget({ isPackaged: true, rawDevServerUrl }), {
      kind: "app-protocol",
      url: "app://yuance/",
      origin: "app://yuance",
      partition: PRODUCTION_SESSION_PARTITION,
    });
  }
});

test("development renderer requires an explicit loopback origin and port", () => {
  assert.deepEqual(resolveRendererTarget({ isPackaged: false }), {
    kind: "dev-server",
    url: "http://127.0.0.1:4273",
    origin: "http://127.0.0.1:4273",
    partition: DEVELOPMENT_SESSION_PARTITION,
  });
  assert.equal(
    resolveRendererTarget({ isPackaged: false, rawDevServerUrl: "http://localhost:5000" }).url,
    "http://localhost:5000",
  );
  for (const value of [
    "https://example.com:4273",
    "http://127.0.0.1",
    "http://user@127.0.0.1:4273",
    "http://127.0.0.1:4273/path",
    "file:///tmp/index.html",
  ]) {
    assert.throws(
      () => resolveRendererTarget({ isPackaged: false, rawDevServerUrl: value }),
      /explicit loopback/,
      value,
    );
  }
});

test("trusted renderer navigation is bound to origin and canonical app routes", () => {
  const production = resolveRendererTarget({ isPackaged: true });
  assert.equal(isTrustedRendererUrl("app://yuance/projects/p-1", production), true);
  for (const value of [
    "app://other/projects/p-1",
    "app://yuance/unknown",
    "app://yuance/projects/%61dmin",
    "app://yuance/projects/p-1?redirect=https://example.com",
  ]) {
    assert.equal(isTrustedRendererUrl(value, production), false, value);
  }
});

test("navigation policy rejects subframes and only externalizes safe links", () => {
  const production = resolveRendererTarget({ isPackaged: true });
  assert.equal(decideNavigation({ url: "app://yuance/projects", isMainFrame: true, rendererTarget: production }).action, "allow");
  assert.equal(decideNavigation({ url: "https://example.com/docs", isMainFrame: true, rendererTarget: production }).action, "external");
  assert.equal(decideNavigation({ url: "https://example.com/docs", isMainFrame: false, rendererTarget: production }).action, "deny");
  assert.equal(decideNavigation({ url: "http://example.com", isMainFrame: true, rendererTarget: production }).action, "deny");
});

test("external URL policy is HTTPS-only outside explicit loopback development", () => {
  assert.equal(isSafeExternalUrl("https://example.com/docs"), true);
  assert.equal(isSafeExternalUrl("https://user@example.com/docs"), false);
  assert.equal(isSafeExternalUrl("https://example.com:444/docs"), false);
  assert.equal(isSafeExternalUrl("http://example.com/docs"), false);
  assert.equal(normalizeSafeExternalUrl(" HTTPS://EXAMPLE.COM:443/docs "), "https://example.com/docs");
  assert.equal(
    isSafeExternalUrl("http://127.0.0.1:4273/docs", {
      isDevelopment: true,
      devOrigin: "http://127.0.0.1:4273",
    }),
    true,
  );
  assert.equal(
    isSafeExternalUrl("http://127.0.0.1:4274/docs", {
      isDevelopment: true,
      devOrigin: "http://127.0.0.1:4273",
    }),
    false,
  );
});

test("BrowserWindow preferences keep every security invariant explicit", () => {
  assert.deepEqual(browserWindowWebPreferences({ preloadPath: "/app/preload.cjs", partition: PRODUCTION_SESSION_PARTITION }), {
    preload: "/app/preload.cjs",
    partition: PRODUCTION_SESSION_PARTITION,
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    webSecurity: true,
    webviewTag: false,
  });
});
