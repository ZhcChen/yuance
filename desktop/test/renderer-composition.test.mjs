import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createDesktopAuthState, normalizePublicAuthState } from "../src/renderer/platform/auth-state.js";
import { createDesktopRouter, normalizeDesktopRoute } from "../src/renderer/platform/router.js";
import { createUnavailableFileAdapter, createUnavailableNetworkAdapter } from "../src/renderer/platform/unavailable.js";

test("normalizes every public auth state and fails closed for unknown values", () => {
  for (const status of ["starting", "unauthenticated", "authorizing", "authenticated", "locked", "reauthorization_required", "fatal"]) {
    assert.equal(normalizePublicAuthState({ status }).status, status);
  }
  assert.equal(normalizePublicAuthState({ status: "admin" }).status, "fatal");
  assert.equal(normalizePublicAuthState(null).status, "fatal");
  assert.equal(createDesktopAuthState().getSnapshot().status, "fatal");
});

test("auth adapter normalizes snapshots and subscriptions", () => {
  /** @type {((state: unknown) => void) | undefined} */
  let listener;
  const values = [];
  const auth = createDesktopAuthState({
    getSnapshot: () => ({ status: "authenticated", token: "not-forwarded" }),
    subscribe: (callback) => { listener = callback; return () => { listener = undefined; }; },
  });
  assert.deepEqual(auth.getSnapshot(), { status: "authenticated" });
  const unsubscribe = auth.subscribe((state) => values.push(state));
  assert.ok(listener);
  listener?.({ status: "locked", reason: "secret" });
  assert.deepEqual(values, [{ status: "locked" }]);
  unsubscribe();
  assert.equal(listener, undefined);
});

test("desktop router accepts semantic paths and rejects absolute or encoded paths", () => {
  assert.equal(normalizeDesktopRoute("/projects/YCE"), "/projects/YCE");
  for (const value of ["https://attacker.test", "//attacker.test", "/projects/%2e%2e/auth", "/unknown", "/projects//YCE", "/projects/x?admin", "/projects/x#admin", "/projects/\0admin", "/projects/／admin", "/projects/⁄admin", "/projects/∕admin", "/projects/项目", "/projects/é", "/projects/\nadmin"]) {
    assert.equal(normalizeDesktopRoute(value), "/", value);
  }

  const calls = [];
  const listeners = new Map();
  const eventTarget = {
    addEventListener(type, callback) { listeners.set(type, callback); },
    removeEventListener(type) { listeners.delete(type); },
    dispatchEvent() { listeners.get("popstate")?.(); },
  };
  const router = createDesktopRouter({
    location: { pathname: "/projects" },
    history: { pushState(_state, _title, value) { calls.push(value); }, replaceState(_state, _title, _value) {} },
    eventTarget,
  });
  let updates = 0;
  const unsubscribe = router.subscribe(() => { updates += 1; });
  router.navigate("/messages");
  assert.deepEqual(calls, ["/messages"]);
  assert.equal(updates, 1);
  assert.throws(() => router.navigate("https://attacker.test"), /not allowed/);
  unsubscribe();
});

test("network and file adapters fail closed", () => {
  assert.throws(() => createUnavailableNetworkAdapter().request(), /network is not available/);
  assert.throws(() => createUnavailableFileAdapter().select(), /file is not available/);
});

test("renderer composition uses shared components and contracts without Browser transports", async () => {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/renderer");
  const files = ["main.jsx", "app.jsx", "platform/auth-state.js", "platform/router.js", "platform/unavailable.js"];
  const source = (await Promise.all(files.map((file) => fs.readFile(path.join(sourceRoot, file), "utf8")))).join("\n");
  assert.match(source, /normalizeHostAuthState/);
  assert.match(source, /defineRouterCapabilities/);
  assert.match(source, /HostStatusShell/);
  assert.doesNotMatch(source, /document\.cookie|EventSource|fetch\s*\(|localStorage|sessionStorage/);
});
