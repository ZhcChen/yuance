import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  DEVELOPMENT_APP_DISPLAY_NAME,
  DEVELOPMENT_APP_USER_MODEL_ID,
  DEFAULT_WEB_URL,
  isSafeExternalUrl,
  isDevelopmentRuntime,
  isTrustedAppUrl,
  normalizeNotificationPayload,
  PRODUCTION_APP_DISPLAY_NAME,
  PRODUCTION_APP_USER_MODEL_ID,
  resolveDesktopAppIdentity,
  resolveDevelopmentDataPaths,
  resolveWebUrl,
  safeNotificationTarget,
} from "../src/config.mjs";

test("separates development and packaged runtime identities", () => {
  assert.equal(isDevelopmentRuntime({ isPackaged: false }), true);
  assert.equal(isDevelopmentRuntime({ isPackaged: true, channel: "dev" }), true);
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

test("rejects unsupported application URLs", () => {
  assert.throws(() => resolveWebUrl("file:///tmp/yuance"), /http or https/);
});

test("accepts only the configured Web origin", () => {
  const origin = "https://yuance.quanxinfu.com";
  assert.equal(isTrustedAppUrl("https://yuance.quanxinfu.com/web", origin), true);
  assert.equal(isTrustedAppUrl("https://example.com/web", origin), false);
});

test("limits notification navigation to internal Web paths", () => {
  const origin = "https://yuance.quanxinfu.com";
  assert.equal(
    safeNotificationTarget("/web/messages/42/open", origin),
    "/web/messages/42/open",
  );
  assert.equal(safeNotificationTarget("https://example.com", origin), "/web/messages");
  assert.equal(safeNotificationTarget("/api/v1/projects", origin), "/web/messages");
});

test("normalizes native notification payloads", () => {
  assert.deepEqual(
    normalizeNotificationPayload(
      { title: "  新评论\n", body: "查看任务讨论", targetPath: "/web/messages/42/open" },
      "https://yuance.quanxinfu.com",
    ),
    {
      title: "新评论",
      body: "查看任务讨论",
      targetPath: "/web/messages/42/open",
    },
  );
});

test("intercepts both direct navigations and server redirects", () => {
  const mainSource = readFileSync(new URL("../src/main.mjs", import.meta.url), "utf8");
  assert.match(mainSource, /webContents\.on\("will-navigate", handleInAppNavigation\)/);
  assert.match(mainSource, /webContents\.on\("will-redirect", handleInAppNavigation\)/);
});

test("configures development storage and maximizes the startup window", () => {
  const mainSource = readFileSync(new URL("../src/main.mjs", import.meta.url), "utf8");
  assert.match(mainSource, /app\.setPath\("userData", developmentDataPaths\.userData\)/);
  assert.match(mainSource, /app\.setPath\("sessionData", developmentDataPaths\.sessionData\)/);
  assert.match(mainSource, /window\.maximize\(\);/);
  assert.doesNotMatch(mainSource, /fullscreen: true/);
  assert.match(mainSource, /applyRuntimeBrandIcon\(\);/);
});

test("allows only HTTP(S) external links", () => {
  assert.equal(isSafeExternalUrl("https://yuance.quanxinfu.com/web/downloads"), true);
  assert.equal(isSafeExternalUrl("mailto:team@example.com"), false);
  assert.equal(isSafeExternalUrl("javascript:alert(1)"), false);
});
