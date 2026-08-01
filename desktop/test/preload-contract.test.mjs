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
  });
  return { bridge: exposed, invocations, listeners };
}

test("preload exposes a frozen versioned bridge without generic IPC", async () => {
  const { bridge, invocations } = await executePreload();
  assert.equal(bridge.schemaVersion, 1);
  assert.equal(Object.isFrozen(bridge), true);
  assert.equal(Object.isFrozen(bridge.hostState), true);
  assert.equal(Object.isFrozen(bridge.notifications), true);
  assert.deepEqual(Object.keys(bridge).sort(), ["hostState", "notifications", "schemaVersion"]);
  assert.equal("invoke" in bridge, false);
  assert.equal("token" in bridge, false);

  await bridge.notifications.show({ title: "更新" });
  assert.deepEqual(invocations, [["yuance:notify", { title: "更新" }]]);
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
