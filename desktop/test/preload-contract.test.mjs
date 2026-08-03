import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

async function executePreload() {
  const source = await readFile(new URL("../src/preload.cjs", import.meta.url), "utf8");
  const listeners = new Map();
  const invocations = [];
  let exposed;
  const ipcRenderer = {
    invoke(channel, payload) {
      invocations.push([channel, payload]);
      return Promise.resolve({ shown: true });
    },
    on(channel, listener) {
      listeners.set(channel, listener);
    },
    removeListener(channel, listener) {
      if (listeners.get(channel) === listener) listeners.delete(channel);
    },
  };
  vm.runInNewContext(source, {
    require(name) {
      assert.equal(name, "electron");
      return {
        contextBridge: {
          exposeInMainWorld(name, bridge) {
            assert.equal(name, "yuanceDesktop");
            exposed = bridge;
          },
        },
        ipcRenderer,
      };
    },
    Object,
    Set,
    crypto: { randomUUID: () => "12345678-1234-4123-8123-123456789abc" },
  });
  return { bridge: exposed, invocations, listeners };
}

test("preload exposes a frozen versioned bridge without generic IPC", async () => {
  const { bridge, invocations } = await executePreload();
  assert.equal(bridge.schemaVersion, 6);
  assert.equal(Object.isFrozen(bridge), true);
  assert.equal(Object.isFrozen(bridge.hostState), true);
  assert.equal(Object.isFrozen(bridge.notifications), true);
  assert.equal(Object.isFrozen(bridge.auth), true);
  assert.equal(Object.isFrozen(bridge.network), true);
  assert.equal(Object.isFrozen(bridge.files), true);
  assert.equal(Object.isFrozen(bridge.business), true);
  assert.deepEqual(Object.keys(bridge).sort(), ["auth", "business", "files", "hostState", "network", "notifications", "schemaVersion"]);
  assert.equal("invoke" in bridge, false);
  assert.equal("token" in bridge, false);

  await bridge.notifications.show({ title: "更新" });
  assert.deepEqual(invocations, [["yuance:notify", { title: "更新" }]]);
});

test("business bridge exposes only one semantic execute command", async () => {
  const { bridge, invocations } = await executePreload();
  assert.deepEqual(Object.keys(bridge.business), ["execute"]);
  await bridge.business.execute("workitem.detail", { itemKey: "DEMO-1" });
  assert.equal(invocations.length, 1);
  assert.equal(invocations[0][0], "yuance:business-execute");
  assert.equal(invocations[0][1].operation, "workitem.detail");
  assert.deepEqual({ ...invocations[0][1].input }, { itemKey: "DEMO-1" });
});

test("file bridge exposes only fixed host-delegated commands", async () => {
  const { bridge, invocations } = await executePreload();
  assert.deepEqual(Object.keys(bridge.files).sort(), ["choose", "downloadCanary", "downloadWorkItemAttachment", "downloadWorkItemCommentAttachment", "revealDownload", "uploadCanary", "uploadWorkItemAttachment", "uploadWorkItemCommentAttachment"]);
  await bridge.files.choose();
  await bridge.files.uploadCanary("yfc_opaque");
  await bridge.files.downloadCanary();
  assert.deepEqual(invocations, [
    ["yuance:file-choose", undefined],
    ["yuance:file-upload-canary", "yfc_opaque"],
    ["yuance:file-download-canary", undefined],
  ]);
});

test("reveal bridge forwards only an opaque capability on its fixed channel", async () => {
  const { bridge, invocations } = await executePreload();
  await bridge.files.revealDownload("yrd_opaque");
  assert.deepEqual(invocations, [["yuance:file-reveal-download", "yrd_opaque"]]);
});

test("attachment upload correlates fixed progress stages and removes its listener", async () => {
  const { bridge, invocations, listeners } = await executePreload();
  const stages = [];
  const pending = bridge.files.uploadWorkItemAttachment({ itemKey: "YCE-TASK-2", fileCapability: "yfc_opaque" }, (stage) => stages.push(stage));
  const payload = invocations[0][1];
  listeners.get("yuance:file-attachment-progress")({}, { operationId: "other", stage: "signing" });
  listeners.get("yuance:file-attachment-progress")({}, { operationId: payload.operationId, stage: "private-stage" });
  listeners.get("yuance:file-attachment-progress")({}, { operationId: payload.operationId, stage: "uploading", url: "https://secret" });
  await pending;
  assert.deepEqual(stages, ["uploading"]);
  assert.equal(listeners.has("yuance:file-attachment-progress"), false);
  assert.deepEqual({ ...payload.input }, { itemKey: "YCE-TASK-2", fileCapability: "yfc_opaque" });
});

test("auth bridge exposes only parameter-free semantic commands", async () => {
  const { bridge, invocations } = await executePreload();
  assert.deepEqual(Object.keys(bridge.auth).sort(), ["authorize", "logout", "retry"]);
  await bridge.auth.authorize(); await bridge.auth.retry(); await bridge.auth.logout();
  assert.deepEqual(invocations, [
    ["yuance:auth-authorize", undefined],
    ["yuance:auth-retry", undefined],
    ["yuance:auth-logout", undefined],
  ]);
});

test("network bridge publishes only normalized status snapshots", async () => {
  const { bridge, listeners } = await executePreload(); const values = [];
  const unsubscribe = bridge.network.subscribe((value) => values.push(value));
  listeners.get("yuance:network-state")({}, { status: "online", token: "secret", endpoint: "https://secret" });
  listeners.get("yuance:network-state")({}, { status: "unknown" });
  assert.deepEqual(values.map((value) => value.status), ["idle", "online", "fatal"]);
  assert.deepEqual(Object.keys(bridge.network.getSnapshot()), ["status"]);
  assert.equal(bridge.network.getSnapshot().status, "fatal"); unsubscribe();
});

test("host state subscriptions receive sanitized snapshots and unsubscribe cleanly", async () => {
  const { bridge, listeners } = await executePreload();
  const values = [];
  assert.equal(bridge.hostState.getSnapshot().status, "starting");
  const unsubscribe = bridge.hostState.subscribe((value) => values.push(value));
  listeners.get("yuance:host-state")({}, { status: "authenticated", token: "secret" });
  assert.deepEqual(values.map((value) => value.status), ["starting", "authenticated"]);
  assert.equal(bridge.hostState.getSnapshot().status, "authenticated");
  unsubscribe();
  listeners.get("yuance:host-state")({}, { status: "locked" });
  assert.equal(values.length, 2);
});

test("notification click listeners use one fixed channel and can be removed", async () => {
  const { bridge, listeners } = await executePreload();
  const targets = [];
  const unsubscribe = bridge.notifications.onClick((target) => targets.push(target));
  const listener = listeners.get("yuance:notification-click");
  listener({}, "/messages");
  unsubscribe();
  assert.deepEqual(targets, ["/messages"]);
  assert.equal(listeners.has("yuance:notification-click"), false);
});
