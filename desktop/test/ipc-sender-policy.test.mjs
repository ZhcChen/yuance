import assert from "node:assert/strict";
import test from "node:test";

import {
  createIpcSenderPolicy,
  createRendererReadinessTracker,
} from "../src/ipc/sender-policy.mjs";
import { resolveRendererTarget } from "../src/window/security-policy.mjs";

function senderFixture() {
  const mainFrame = { url: "app://yuance/projects/p-1" };
  const sender = { mainFrame, isDestroyed: () => false };
  const window = { webContents: sender, isDestroyed: () => false };
  const event = { sender, senderFrame: mainFrame };
  return { event, mainFrame, sender, window };
}

test("accepts only the current trusted top-level renderer outside navigation", () => {
  const fixture = senderFixture();
  let navigationPending = false;
  const assertSender = createIpcSenderPolicy({
    getMainWindow: () => fixture.window,
    isNavigationPending: () => navigationPending,
    rendererTarget: resolveRendererTarget({ isPackaged: true }),
  });
  assert.equal(assertSender(fixture.event), true);

  navigationPending = true;
  assert.throws(() => assertSender(fixture.event), /Untrusted renderer/);
});

test("cancelled external navigation preserves the last committed trusted document", () => {
  const rendererTarget = resolveRendererTarget({ isPackaged: true });
  const tracker = createRendererReadinessTracker(rendererTarget);
  assert.equal(tracker.isPending(), true);
  assert.equal(tracker.didCommit("app://yuance/projects/p-1"), true);
  assert.equal(tracker.isPending(), false);

  tracker.didStart({ url: "https://example.com", isMainFrame: true });
  assert.equal(tracker.isPending(), false);
  tracker.didCancelOrFail();
  assert.equal(tracker.isPending(), false);

  tracker.didStart({ url: "app://yuance/messages", isMainFrame: true });
  assert.equal(tracker.isPending(), true);
  tracker.didCancelOrFail();
  assert.equal(tracker.isPending(), true);

  tracker.reset();
  tracker.didCancelOrFail();
  assert.equal(tracker.isPending(), true);
});

test("late failures and unrelated external cancellation cannot reopen a newer navigation", () => {
  const tracker = createRendererReadinessTracker(resolveRendererTarget({ isPackaged: true }));
  tracker.didCommit("app://yuance/projects");
  tracker.didStart({ url: "app://yuance/messages", isMainFrame: true });
  tracker.didStart({ url: "app://yuance/work-items", isMainFrame: true });
  tracker.didCancelOrFail();
  assert.equal(tracker.isPending(), true);

  tracker.didStart({ url: "https://example.com", isMainFrame: true });
  tracker.didCancelOrFail();
  assert.equal(tracker.isPending(), true);
  assert.equal(tracker.didCommit("app://yuance/work-items"), true);
});

test("trusted same-document route commits reopen IPC after pushState navigation", () => {
  const tracker = createRendererReadinessTracker(resolveRendererTarget({ isPackaged: true }));
  tracker.didCommit("app://yuance/");
  tracker.didStart({ url: "app://yuance/tasks", isMainFrame: true });
  assert.equal(tracker.isPending(), true);
  assert.equal(tracker.didCommit("app://yuance/tasks"), true);
  assert.equal(tracker.isPending(), false);

  tracker.didStart({ url: "app://yuance/unknown", isMainFrame: true });
  assert.equal(tracker.didCommit("app://yuance/unknown"), false);
  assert.equal(tracker.isPending(), true);
});

test("rejects subframes, stale windows, destroyed senders, and invalid routes", () => {
  const fixture = senderFixture();
  const assertSender = createIpcSenderPolicy({
    getMainWindow: () => fixture.window,
    isNavigationPending: () => false,
    rendererTarget: resolveRendererTarget({ isPackaged: true }),
  });

  for (const mutate of [
    () => { fixture.event.senderFrame = { url: "app://yuance/projects/p-1" }; },
    () => { fixture.window.webContents = { isDestroyed: () => false }; },
    () => { fixture.sender.isDestroyed = () => true; },
    () => { fixture.mainFrame.url = "app://other/projects/p-1"; },
    () => { fixture.mainFrame.url = "app://yuance/unknown"; },
  ]) {
    const current = senderFixture();
    Object.assign(fixture, current);
    mutate();
    assert.throws(() => assertSender(fixture.event), /Untrusted renderer/);
  }
});
