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
  });

  const unsubscribe = events.openTopbarEvents({
    onEvent: (event) => calls.push(["event", event]),
  });
  listener({ type: "topbar" });
  listener({ type: "release-version", version: "0.2.0" });
  listener({ type: "notification-target", path: "/web/app/work-items/YCE-TASK-2#comment-3" });
  listener({ type: "unknown", path: "https://evil.example" });
  unsubscribe();

  assert.deepEqual(calls, [
    ["event", { type: "stream-connected", connectionId: "topbar", sequence: 1 }],
    ["event", { type: "release-version", connectionId: "topbar", sequence: 2, version: "0.2.0" }],
    ["event", { type: "notification-target", path: "/web/app/work-items/YCE-TASK-2#comment-3" }],
  ]);
  assert.equal(unsubscribed, true);
});

test("desktop events degrade to a no-op without the restricted bridge", () => {
  assert.doesNotThrow(() => createDesktopEvents(undefined).openTopbarEvents({})());
});
