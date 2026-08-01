import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  DEVELOPMENT_APP_DISPLAY_NAME,
  DEVELOPMENT_APP_USER_MODEL_ID,
  DEFAULT_WEB_URL,
  isDevelopmentRuntime,
  isTrustedAppUrl,
  normalizeNotificationPayload,
  PRODUCTION_APP_DISPLAY_NAME,
  PRODUCTION_APP_USER_MODEL_ID,
  resolveDesktopAppIdentity,
  resolveDesktopNetworkOrigin,
  resolveDeviceAuthEndpoint,
  resolveDevelopmentDataPaths,
  resolveWebUrl,
  safeNotificationTarget,
} from "../src/config.mjs";

test("separates development and packaged runtime identities", () => {
  assert.equal(isDevelopmentRuntime({ isPackaged: false }), true);
  assert.equal(isDevelopmentRuntime({ isPackaged: true, channel: "dev" }), false);
  assert.equal(isDevelopmentRuntime({ isPackaged: true }), false);
  assert.deepEqual(resolveDesktopAppIdentity(true), {
    displayName: DEVELOPMENT_APP_DISPLAY_NAME,
    appUserModelId: DEVELOPMENT_APP_USER_MODEL_ID,
  });
  assert.deepEqual(resolveDesktopAppIdentity(false), {
    displayName: PRODUCTION_APP_DISPLAY_NAME,
    appUserModelId: PRODUCTION_APP_USER_MODEL_ID,
  });
});

test("keeps development user and session data outside the production profile", () => {
  const appDataPath = path.join("test-data", "Application Support");
  const userData = path.join(appDataPath, DEVELOPMENT_APP_DISPLAY_NAME);
  assert.deepEqual(resolveDevelopmentDataPaths(appDataPath), {
    userData,
    sessionData: path.join(userData, "Session Data"),
  });
});

test("uses the production Web URL by default", () => {
  assert.deepEqual(resolveWebUrl(), {
    url: DEFAULT_WEB_URL,
    origin: "https://yuance.quanxinfu.com",
  });
});

test("normalizes a local development Web URL", () => {
  assert.deepEqual(resolveWebUrl("http://127.0.0.1:33033/"), {
    url: "http://127.0.0.1:33033/web",
    origin: "http://127.0.0.1:33033",
  });
});

test("ignores endpoint environment overrides for production device auth profiles", () => {
  assert.equal(
    resolveDeviceAuthEndpoint({
      isDevRuntime: false,
      rawUrl: "https://attacker.example/web",
    }),
    "https://yuance.quanxinfu.com",
  );
  assert.equal(
    resolveDeviceAuthEndpoint({
      isDevRuntime: true,
      rawUrl: "http://127.0.0.1:33033/web",
    }),
    "http://127.0.0.1:33033",
  );
});

test("uses a build-fixed production network origin and explicit development loopback", () => {
  assert.equal(
    resolveDesktopNetworkOrigin({
      isDevRuntime: false,
      rawUrl: "https://attacker.example/web",
    }),
    "https://yuance.quanxinfu.com",
  );
  for (const rawUrl of [
    "http://127.0.0.1:33033/web",
    "https://localhost:33033/web",
    "http://[::1]:33033/web",
  ]) {
    assert.equal(
      new URL(resolveDesktopNetworkOrigin({ isDevRuntime: true, rawUrl })).hostname,
      new URL(rawUrl).hostname,
    );
  }
  for (const rawUrl of [
    undefined,
    "https://attacker.example/web",
    "http://192.168.1.2:33033/web",
    "http://localhost:33033/web?tenant=1",
    "http://user:secret@localhost:33033/web",
    "http://localhost:33033/arbitrary",
    "http://localhost:33033/%77eb",
    "http:\\localhost:33033\\web",
    "not-a-url?secret=value",
  ]) {
    assert.throws(
      () => resolveDesktopNetworkOrigin({ isDevRuntime: true, rawUrl }),
      /loopback|explicit|query|userinfo|path|valid URL/i,
    );
  }
});

test("rejects unsupported application URLs", () => {
  assert.throws(() => resolveWebUrl("file:///tmp/yuance"), /http or https/);
});

test("accepts only the configured Web origin", () => {
  const origin = "https://yuance.quanxinfu.com";
  assert.equal(isTrustedAppUrl("https://yuance.quanxinfu.com/web", origin), true);
  assert.equal(isTrustedAppUrl("https://example.com/web", origin), false);
  assert.equal(isTrustedAppUrl("app://other/messages", "app://yuance"), false);
});

test("limits notification navigation to canonical app routes", () => {
  const origin = "app://yuance";
  assert.equal(
    safeNotificationTarget("/messages/42", origin),
    "/messages/42",
  );
  assert.equal(safeNotificationTarget("https://example.com", origin), "/messages");
  assert.equal(safeNotificationTarget("/api/v1/projects", origin), "/messages");
  assert.equal(safeNotificationTarget("/messages/42?next=/projects", origin), "/messages");
  assert.equal(
    safeNotificationTarget("/projects/p-1", "http://127.0.0.1:4273"),
    "/projects/p-1",
  );
});

test("normalizes native notification payloads", () => {
  assert.deepEqual(
    normalizeNotificationPayload(
      { title: "  新评论\n", body: "查看任务讨论", targetPath: "/messages/42" },
      "app://yuance",
    ),
    {
      title: "新评论",
      body: "查看任务讨论",
      targetPath: "/messages/42",
    },
  );
});

test("intercepts both direct navigations and server redirects", () => {
  const mainSource = readFileSync(new URL("../src/main.mjs", import.meta.url), "utf8");
  assert.match(mainSource, /webContents\.on\("will-navigate", handleNavigation\)/);
  assert.match(mainSource, /webContents\.on\("will-redirect", handleNavigation\)/);
  assert.match(mainSource, /webContents\.on\("will-frame-navigate"/);
  assert.match(mainSource, /if \(!event\.isMainFrame\) handleNavigation\(event\)/);
});

test("validates notification payloads before platform availability shortcuts", () => {
  const mainSource = readFileSync(new URL("../src/main.mjs", import.meta.url), "utf8");
  const handlerIndex = mainSource.indexOf("function notifyFromRenderer");
  const payloadIndex = mainSource.indexOf("parseNotificationPayload(payload)", handlerIndex);
  const availabilityIndex = mainSource.indexOf("Notification.isSupported()", handlerIndex);
  assert.ok(handlerIndex >= 0);
  assert.ok(payloadIndex > handlerIndex);
  assert.ok(availabilityIndex > payloadIndex);
});

test("configures development storage and maximizes the startup window", () => {
  const mainSource = readFileSync(new URL("../src/main.mjs", import.meta.url), "utf8");
  assert.match(mainSource, /app\.setPath\("userData", developmentDataPaths\.userData\)/);
  assert.match(mainSource, /app\.setPath\("sessionData", developmentDataPaths\.sessionData\)/);
  assert.match(mainSource, /window\.maximize\(\);/);
  assert.doesNotMatch(mainSource, /fullscreen: true/);
  assert.match(mainSource, /applyRuntimeBrandIcon\(\);/);
});

test("acquires the OS single-instance lock before the ready lifecycle", () => {
  const mainSource = readFileSync(new URL("../src/main.mjs", import.meta.url), "utf8");
  const lockIndex = mainSource.indexOf("app.requestSingleInstanceLock()");
  const readyIndex = mainSource.indexOf("app.whenReady()", lockIndex);
  assert.ok(lockIndex >= 0);
  assert.ok(readyIndex > lockIndex);
  assert.match(mainSource, /if \(!hasSingleInstanceLock\) \{\s*app\.quit\(\);/);
  assert.match(mainSource, /app\.on\("second-instance", \(\) => revealWindow\("\/"\)\)/);
  assert.ok(mainSource.indexOf("initializeDesktopCredentialRuntime().catch", readyIndex) > readyIndex);
});

test("registers the privileged app scheme before the ready lifecycle", () => {
  const mainSource = readFileSync(new URL("../src/main.mjs", import.meta.url), "utf8");
  const registrationIndex = mainSource.indexOf("protocol.registerSchemesAsPrivileged");
  const readyIndex = mainSource.indexOf("app.whenReady()");
  assert.ok(registrationIndex >= 0);
  assert.ok(readyIndex > registrationIndex);
  assert.match(mainSource, /standard: true, secure: true/);
  assert.doesNotMatch(mainSource, /supportFetchAPI|bypassCSP|allowServiceWorkers/);
});

test("creates the starting Shell before one asynchronous credential runtime", () => {
  const mainSource = readFileSync(new URL("../src/main.mjs", import.meta.url), "utf8");
  const normalLifecycle = mainSource.indexOf("mainWindow = createMainWindow();");
  const runtimeStart = mainSource.indexOf("initializeDesktopCredentialRuntime().catch", normalLifecycle);
  assert.ok(normalLifecycle >= 0);
  assert.ok(runtimeStart > normalLifecycle);
  assert.equal(mainSource.indexOf("initializeDesktopCredentialRuntime().catch", runtimeStart + 1), -1);
  assert.match(mainSource.slice(runtimeStart), /hostStatePublisher\.update\(\{ status: "fatal" \}\)/u);
  assert.match(mainSource, /createTrustedNetworkSession\(\{[\s\S]*allowedOrigin: origin/u);
  assert.match(mainSource, /enrollDesktop\(\{ origin, mode, fetchImpl: network\.fetch \}\)/u);
  assert.doesNotMatch(mainSource, /globalThis\.fetch/u);
});

test("binds the SSE network epoch to credentials, window, power, and quit lifecycle", () => {
  const mainSource = readFileSync(new URL("../src/main.mjs", import.meta.url), "utf8");
  assert.match(mainSource, /createSseClient\(\{ profile: enrolled\.profile, fetchImpl: network\.fetch \}\)/u);
  assert.match(mainSource, /probe: \(\) => restTransport\.execute\("session\.probe", \{\}\)/u);
  assert.match(mainSource, /onReauthorizationRequired: \(\) => runtime\.discardLocalSession\(\)/u);
  assert.match(mainSource, /onNetworkInvalidated: \(\) => coordinator\?\.invalidate\(\)/u);
  assert.match(mainSource, /window\.on\("closed", \(\) => \{[\s\S]*networkCoordinator\?\.stop\(\)/u);
  assert.match(mainSource, /powerMonitor\.on\("suspend", \(\) => networkCoordinator\?\.suspend\(\)\)/u);
  assert.match(mainSource, /powerMonitor\.on\("resume", \(\) => networkCoordinator\?\.resume\(\)\)/u);
  assert.match(mainSource, /app\.on\("before-quit", \(\) => \{[\s\S]*networkCoordinator\?\.stop\(\)/u);
});
