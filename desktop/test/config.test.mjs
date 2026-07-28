import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_WEB_URL,
  isSafeExternalUrl,
  isTrustedAppUrl,
  normalizeNotificationPayload,
  resolveWebUrl,
  safeNotificationTarget,
} from "../src/config.mjs";

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

test("allows only HTTP(S) external links", () => {
  assert.equal(isSafeExternalUrl("https://yuance.quanxinfu.com/web/downloads"), true);
  assert.equal(isSafeExternalUrl("mailto:team@example.com"), false);
  assert.equal(isSafeExternalUrl("javascript:alert(1)"), false);
});
