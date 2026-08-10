import assert from "node:assert/strict";
import test from "node:test";

import {
  createRendererReadyController,
  registerRendererReadyHandler,
  RENDERER_READY_CHANNEL,
} from "../src/ipc/renderer-ready.mjs";
import { resolveRendererTarget } from "../src/window/security-policy.mjs";

function fixture() {
  const mainFrame = { url: "app://yuance/" };
  const webContents = { mainFrame, isDestroyed: () => false };
  const window = { webContents, isDestroyed: () => false };
  const accepted = [];
  const controller = createRendererReadyController({
    getMainWindow: () => window,
    rendererTarget: resolveRendererTarget({ isPackaged: true }),
    onReady: (value) => accepted.push(value),
  });
  return { accepted, controller, event: { sender: webContents, senderFrame: mainFrame }, mainFrame, webContents, window };
}

test("accepts one payload-free readiness signal for the current committed navigation", () => {
  const value = fixture();
  value.controller.didStart({ url: "app://yuance/", isMainFrame: true });
  assert.equal(value.controller.accept(value.event), false);
  assert.equal(value.controller.didCommit("app://yuance/"), true);
  assert.equal(value.controller.accept(value.event), true);
  assert.equal(value.controller.accept(value.event), false);
  assert.deepEqual(value.accepted, [{ generation: 1 }]);
});

test("rejects payloads, subframes, stale generations, and untrusted URLs", () => {
  const value = fixture();
  value.controller.didStart({ url: "app://yuance/", isMainFrame: true });
  value.controller.didCommit("app://yuance/");
  assert.equal(value.controller.accept(value.event, ["payload"]), false);
  assert.equal(value.controller.accept({ ...value.event, senderFrame: { url: "app://yuance/" } }), false);
  value.mainFrame.url = "https://attacker.example";
  assert.equal(value.controller.accept(value.event), false);
  value.mainFrame.url = "app://yuance/";
  value.controller.didStart({ url: "app://yuance/projects", isMainFrame: true });
  assert.equal(value.controller.accept(value.event), false);
});

test("ignores in-page and subframe navigation without invalidating the committed generation", () => {
  const value = fixture();
  value.controller.didStart({ url: "app://yuance/", isMainFrame: true });
  value.controller.didCommit("app://yuance/");
  assert.equal(value.controller.didStart({ url: "app://yuance/projects", isMainFrame: true, isInPlace: true }), false);
  assert.equal(value.controller.didStart({ url: "app://yuance/projects", isMainFrame: false }), false);
  assert.equal(value.controller.accept(value.event), true);
});

test("keeps IPC readiness after SPA query and hash navigation", () => {
  const value = fixture();
  value.controller.didStart({ url: "app://yuance/", isMainFrame: true });
  value.controller.didCommit("app://yuance/");
  assert.equal(value.controller.didStart({ url: "app://yuance/messages?filter=unread", isMainFrame: true, isInPlace: true }), false);
  assert.equal(value.controller.didCommit("app://yuance/messages?filter=unread"), true);
  value.mainFrame.url = "app://yuance/messages?filter=unread";
  assert.equal(value.controller.accept(value.event), true);

  const hashValue = fixture();
  hashValue.controller.didStart({ url: "app://yuance/", isMainFrame: true });
  hashValue.controller.didCommit("app://yuance/");
  hashValue.mainFrame.url = "app://yuance/work-items/YCE-TASK-2#comment-42";
  assert.equal(hashValue.controller.didCommit("app://yuance/work-items/YCE-TASK-2#comment-42"), true);
  assert.equal(hashValue.controller.accept(hashValue.event), true);
});

test("registers and disposes the fixed readiness channel", () => {
  const listeners = new Map();
  const ipcMain = {
    on(channel, listener) { listeners.set(channel, listener); },
    removeListener(channel, listener) { if (listeners.get(channel) === listener) listeners.delete(channel); },
  };
  const value = fixture();
  const dispose = registerRendererReadyHandler({ ipcMain, controller: value.controller });
  assert.equal(typeof listeners.get(RENDERER_READY_CHANNEL), "function");
  dispose();
  assert.equal(listeners.has(RENDERER_READY_CHANNEL), false);
});
