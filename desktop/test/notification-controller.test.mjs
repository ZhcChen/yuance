import assert from "node:assert/strict";
import test from "node:test";

import { createNotificationController } from "../src/notifications/notification-controller.mjs";

test("topbar fact always refreshes the renderer and uses one fixed unread query", async () => {
  const fixture = createFixture({ focused: true, items: [notification(7)] });

  await fixture.controller.handleFact({ type: "topbar", reason: "refresh", epoch: 3 });

  assert.deepEqual(fixture.refreshes, [{ schemaVersion: 1, type: "topbar" }]);
  assert.deepEqual(fixture.operations, [["notification.list", { filter: "unread", limit: 100 }]]);
  assert.deepEqual(fixture.shown, []);
});

test("background delivery is deduplicated by credential epoch and notification id", async () => {
  const fixture = createFixture({ items: [notification(8), notification(7)] });

  await fixture.controller.handleFact({ type: "topbar", reason: "refresh", epoch: 3 });
  await fixture.controller.handleFact({ type: "topbar", reason: "connected", epoch: 3 });
  await fixture.controller.handleFact({ type: "topbar", reason: "refresh", epoch: 4 });

  assert.deepEqual(fixture.shown.map(({ id }) => id), [8, 7, 8, 7]);
  assert.equal(fixture.refreshes.length, 3);
});

test("unsupported or disabled native notifications preserve the in-app refresh", async () => {
  const unsupported = createFixture({ supported: false, items: [notification(9)] });
  const disabled = createFixture({ enabled: false, items: [notification(10)] });

  await unsupported.controller.handleFact({ type: "topbar", reason: "refresh", epoch: 1 });
  await disabled.controller.handleFact({ type: "topbar", reason: "refresh", epoch: 1 });

  assert.equal(unsupported.refreshes.length, 1);
  assert.equal(disabled.refreshes.length, 1);
  assert.deepEqual(unsupported.shown, []);
  assert.deepEqual(disabled.shown, []);
});

test("release facts are forwarded without querying or delivering notifications", async () => {
  const fixture = createFixture({ items: [notification(11)] });

  await fixture.controller.handleFact({ type: "release-version", version: "0.2.0", epoch: 2 });

  assert.deepEqual(fixture.refreshes, [{ schemaVersion: 1, type: "release-version", version: "0.2.0" }]);
  assert.deepEqual(fixture.operations, []);
  assert.deepEqual(fixture.shown, []);
});

test("unknown, malformed and invalidated facts have no side effects", async () => {
  let resolveQuery;
  const fixture = createFixture({ execute: () => new Promise((resolve) => { resolveQuery = resolve; }) });
  const pending = fixture.controller.handleFact({ type: "topbar", reason: "refresh", epoch: 1 });
  fixture.controller.invalidate();
  resolveQuery({ items: [notification(12)] });
  await pending;
  await fixture.controller.handleFact({ type: "unknown", epoch: 2 });
  await fixture.controller.handleFact({ type: "release-version", version: "x".repeat(257), epoch: 2 });

  assert.deepEqual(fixture.refreshes, [{ schemaVersion: 1, type: "topbar" }]);
  assert.deepEqual(fixture.shown, []);
});

function createFixture({ focused = false, minimized = false, supported = true, enabled = true, items = [], execute } = {}) {
  const operations = [];
  const refreshes = [];
  const shown = [];
  const controller = createNotificationController({
    execute: execute ?? (async (operation, input) => {
      operations.push([operation, input]);
      return { items };
    }),
    publishFact: (fact) => refreshes.push(fact),
    isWindowFocused: () => focused,
    isWindowMinimized: () => minimized,
    isNativeNotificationSupported: () => supported,
    isNativeNotificationEnabled: () => enabled,
    showNativeNotification: (value) => shown.push(value),
  });
  return { controller, operations, refreshes, shown };
}

function notification(id) {
  return Object.freeze({
    id,
    title: `通知 ${id}`,
    body: `正文 ${id}`,
    read: false,
    target: { kind: "work_item", project_key: "YCE", work_item_key: `YCE-TASK-${id}`, comment_id: null },
  });
}
