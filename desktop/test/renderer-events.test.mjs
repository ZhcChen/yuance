import assert from "node:assert/strict";
import test from "node:test";

import { createDesktopEvents } from "../src/renderer/platform/events.js";

test("desktop events map fixed host facts to shared callbacks and internal navigation", () => {
  /** @type {(fact: { type: string, version?: string, path?: string }) => void} */
  let listener = () => {};
  let unsubscribed = false;
  const calls = [];
  const events = createDesktopEvents({
    subscribe(callback) {
      listener = callback;
      return () => { unsubscribed = true; };
    },
  }, {
    assign: (path) => calls.push(["assign", path]),
  });

  const unsubscribe = events.openTopbarEvents({
    onRefresh: () => calls.push(["refresh"]),
    onReleaseVersion: (version) => calls.push(["release", version]),
  });
  listener({ type: "topbar" });
  listener({ type: "release-version", version: "0.2.0" });
  listener({ type: "notification-target", path: "/web/app/work-items/YCE-TASK-2#comment-3" });
  listener({ type: "unknown", path: "https://evil.example" });
  unsubscribe();

  assert.deepEqual(calls, [
    ["refresh"],
    ["release", "0.2.0"],
    ["assign", "/web/app/work-items/YCE-TASK-2#comment-3"],
  ]);
  assert.equal(unsubscribed, true);
});

test("desktop events degrade to a no-op without the restricted bridge", () => {
  assert.doesNotThrow(() => createDesktopEvents(undefined, undefined).openTopbarEvents({})());
});
