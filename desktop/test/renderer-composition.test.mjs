import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createDesktopAuthState, normalizePublicAuthState } from "../src/renderer/platform/auth-state.js";
import { createDesktopNetworkState, normalizePublicNetworkState } from "../src/renderer/platform/network-state.js";
import { createDesktopRouter, normalizeDesktopRoute } from "../src/renderer/platform/router.js";
import { createDesktopAppFiles, createDesktopFiles } from "../src/renderer/platform/files.js";
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

test("auth commands and network state adapters remain semantic and fail closed", async () => {
  const calls = [];
  const auth = createDesktopAuthState({}, {
    authorize: async () => calls.push("authorize"), retry: async () => calls.push("retry"), logout: async () => calls.push("logout"),
  });
  await auth.authorize(); await auth.retry(); await auth.logout();
  assert.deepEqual(calls, ["authorize", "retry", "logout"]);
  await assert.rejects(createDesktopAuthState().authorize(), /unavailable/);
  assert.deepEqual(normalizePublicNetworkState({ status: "online", token: "secret" }), { status: "online" });
  assert.deepEqual(createDesktopNetworkState().getSnapshot(), { status: "fatal" });
  /** @type {((state: unknown) => void) | undefined} */
  let listener;
  const network = createDesktopNetworkState({ getSnapshot: () => ({ status: "offline" }), subscribe(callback) { listener = callback; return () => { listener = undefined; }; } });
  assert.deepEqual(network.getSnapshot(), { status: "offline" });
  const values = []; const unsubscribe = network.subscribe((value) => values.push(value));
  assert.ok(listener);
  listener({ status: "online", endpoint: "secret" }); assert.deepEqual(values, [{ status: "online" }]); unsubscribe();
});

test("desktop router translates shared app paths and rejects absolute or encoded paths", () => {
  assert.equal(normalizeDesktopRoute("/projects/YCE"), "/projects/YCE");
  assert.equal(normalizeDesktopRoute("/projects/YCE/resources/9"), "/projects/YCE/resources/9");
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
    location: { pathname: "/projects", search: "?page=2", hash: "" },
    history: { pushState(_state, _title, value) { calls.push(value); }, replaceState(_state, _title, _value) {} },
    eventTarget,
  });
  let updates = 0;
  const unsubscribe = router.subscribe(() => { updates += 1; });
  assert.equal(router.currentPath(), "/web/app/projects?page=2");
  assert.deepEqual(router.currentRoute(), {
    id: "projects", owner: "app", pathname: "/web/app/projects", search: "?page=2",
    status: "", page: 2, perPage: 10, title: "项目列表",
  });
  router.navigate("/web/app/messages?filter=unread");
  router.navigate("/web/app/projects/YCE/resources/9");
  assert.deepEqual(calls, ["/messages?filter=unread", "/projects/YCE/resources/9"]);
  assert.equal(updates, 2);
  assert.throws(() => router.navigate("https://attacker.test"), /not allowed/);
  assert.throws(() => router.navigate("/web/projects"), /not allowed/);
  assert.throws(() => router.navigate("/web/app/unknown"), /not allowed/);
  unsubscribe();
});

test("network and file adapters fail closed", () => {
  assert.throws(() => createUnavailableNetworkAdapter().request(), /network is not available/);
  assert.throws(() => createUnavailableFileAdapter().select(), /file is not available/);
});

test("desktop file adapter delegates opaque intents and normalizes results", async () => {
  const calls = [];
  const files = createDesktopFiles({
    choose: async () => ({ capability: `yfc_${"a".repeat(32)}`, filename: "a.txt", contentType: "text/plain", byteSize: 1, path: "/secret" }),
    uploadCanary: async (capability) => { calls.push(capability); return { status: "completed", byteSize: 1, url: "https://secret" }; },
    downloadCanary: async () => ({ status: "cancelled", path: "/secret" }),
  });
  const selected = await files.chooseFile();
  assert.ok(selected);
  assert.deepEqual(selected, { capability: `yfc_${"a".repeat(32)}`, filename: "a.txt", contentType: "text/plain", byteSize: 1 });
  assert.deepEqual(await files.uploadCanary(selected.capability), { status: "completed", byteSize: 1 });
  assert.deepEqual(await files.downloadCanary(), { status: "cancelled" });
  assert.deepEqual(calls, [`yfc_${"a".repeat(32)}`]);
});

test("desktop app file adapter delegates business attachments and rejects signed requests", async () => {
  const calls = [];
  const bridge = {
    choose: async () => ({ capability: `yfc_${"a".repeat(32)}`, filename: "a.txt", contentType: "text/plain", byteSize: 1 }),
    uploadCanary: async () => ({ status: "completed" }),
    downloadCanary: async () => ({ status: "completed" }),
    uploadWorkItemAttachment: async (input, onStage) => { calls.push(input); onStage("uploading"); return { created: attachment("pending"), uploaded: attachment("uploaded"), url: "https://secret" }; },
    uploadWorkItemCommentAttachment: async () => ({ created: attachment("pending"), uploaded: attachment("uploaded") }),
    uploadProjectAttachment: async () => ({ created: attachment("pending"), uploaded: attachment("uploaded") }),
    uploadProjectResourceAttachment: async () => ({ created: attachment("pending"), uploaded: attachment("uploaded") }),
    downloadWorkItemAttachment: async () => ({ status: "completed", filename: "a.txt", byteSize: 1, revealCapability: `yrd_${"b".repeat(32)}`, path: "/secret" }),
    downloadWorkItemCommentAttachment: async () => ({ status: "cancelled" }),
    downloadProjectAttachment: async () => ({ status: "cancelled" }),
    downloadProjectResourceAttachment: async () => ({ status: "cancelled" }),
    openProjectAttachmentPreview: async () => ({ capability: `ypv_${"c".repeat(32)}`, source: `app://yuance/.preview/ypv_${"c".repeat(32)}`, contentType: "image/png", byteSize: 1, attachment: attachment("uploaded"), preview: { kind: "image", file_type: "png" }, navigation: { position: 1, total: 1, previous: null, next: null }, privatePath: "/secret" }),
    openProjectResourceAttachmentPreview: async () => ({ capability: `ypv_${"d".repeat(32)}`, source: `app://yuance/.preview/ypv_${"d".repeat(32)}`, contentType: "image/png", byteSize: 1, attachment: attachment("uploaded"), preview: { kind: "image", file_type: "png" }, navigation: { position: 1, total: 1, previous: null, next: null }, privatePath: "/secret" }),
    releaseProjectAttachmentPreview: async (capability) => { calls.push(capability); return { status: "released", privatePath: "/secret" }; },
    revealDownload: async (capability) => { calls.push(capability); return { status: "revealed", path: "/secret" }; },
  };
  const platform = createDesktopAppFiles(bridge);
  const stages = [];
  const fileCapability = /** @type {import('@yuance/frontend-platform-contract').FileCapability} */ (/** @type {unknown} */ ("opaque"));
  const result = await platform.attachments.uploadWorkItemAttachment({ itemKey: "DEMO-1", fileCapability }, (stage) => stages.push(stage));
  assert.deepEqual(result, { created: attachment("pending"), uploaded: attachment("uploaded") });
  assert.deepEqual(stages, ["uploading"]);
  const downloaded = await platform.attachments.downloadWorkItemAttachment({ itemKey: "DEMO-1", attachmentId: 9, suggestedFilename: "ignored" });
  assert.equal(downloaded.status, "completed");
  assert.equal(typeof downloaded.revealCapability, "string");
  assert.ok(downloaded.revealCapability);
  assert.deepEqual(await platform.attachments.revealDownload(downloaded.revealCapability), { status: "revealed" });
  const preview = await platform.attachments.openProjectAttachmentPreview({ projectKey: "YCE", attachmentId: 9 });
  assert.equal(preview.source, `app://yuance/.preview/${preview.capability}`);
  assert.equal(preview.preview.kind, "image");
  assert.equal(JSON.stringify(preview).includes("secret"), false);
  const resourcePreview = await platform.attachments.openProjectResourceAttachmentPreview({ projectKey: "YCE", resourceId: 8, attachmentId: 9, accessToken: "grant" });
  assert.equal(resourcePreview.source, `app://yuance/.preview/ypv_${"d".repeat(32)}`);
  assert.deepEqual(await platform.attachments.releaseProjectAttachmentPreview(preview.capability), { status: "released" });
  assert.throws(() => platform.transfers.authorizeSignedRequest(), /unavailable/);
  assert.equal(JSON.stringify(result).includes("secret"), false);
  assert.equal(calls.length, 3);
});

test("desktop preview adapter rejects a content source that is not bound to its capability", async () => {
  const bridge = {
    choose: async () => null,
    uploadCanary: async () => ({ status: "cancelled" }),
    downloadCanary: async () => ({ status: "cancelled" }),
    uploadWorkItemAttachment: async () => ({ created: attachment("pending"), uploaded: attachment("uploaded") }),
    uploadWorkItemCommentAttachment: async () => ({ created: attachment("pending"), uploaded: attachment("uploaded") }),
    uploadProjectAttachment: async () => ({ created: attachment("pending"), uploaded: attachment("uploaded") }),
    uploadProjectResourceAttachment: async () => ({ created: attachment("pending"), uploaded: attachment("uploaded") }),
    downloadWorkItemAttachment: async () => ({ status: "cancelled" }),
    downloadWorkItemCommentAttachment: async () => ({ status: "cancelled" }),
    downloadProjectAttachment: async () => ({ status: "cancelled" }),
    downloadProjectResourceAttachment: async () => ({ status: "cancelled" }),
    openProjectAttachmentPreview: async () => ({ capability: `ypv_${"c".repeat(32)}`, source: "https://example.test/private", contentType: "image/png", byteSize: 1, attachment: attachment("uploaded"), preview: { kind: "image" }, navigation: {} }),
    openProjectResourceAttachmentPreview: async () => ({ capability: `ypv_${"c".repeat(32)}`, source: "https://example.test/private", contentType: "image/png", byteSize: 1, attachment: attachment("uploaded"), preview: { kind: "image" }, navigation: {} }),
    releaseProjectAttachmentPreview: async () => ({ status: "released" }),
    revealDownload: async () => ({ status: "revealed" }),
  };
  await assert.rejects(createDesktopAppFiles(bridge).attachments.openProjectAttachmentPreview({ projectKey: "YCE", attachmentId: 9 }), /preview result is invalid/);
});

function attachment(status) {
  return { id: 9, filename: "a.txt", content_type: "text/plain", byte_size: 1, status, created_by: "Alice", created_at: "2026-08-03T00:00:00Z" };
}

test("renderer composition uses shared components and contracts without Browser transports", async () => {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/renderer");
  const files = ["main.jsx", "app.jsx", "platform/api-transport.js", "platform/auth-state.js", "platform/events.js", "platform/network-state.js", "platform/router.js", "platform/files.js", "platform/unavailable.js"];
  const source = (await Promise.all(files.map((file) => fs.readFile(path.join(sourceRoot, file), "utf8")))).join("\n");
  assert.match(source, /normalizeHostAuthState/);
  assert.match(source, /defineRouterCapabilities/);
  assert.match(source, /HostStatusShell/);
  assert.match(source, /SharedApp/);
  assert.match(source, /createApiClient/);
  assert.match(source, /services\.auth\.authorize/);
  assert.match(source, /services\.network\.subscribe/);
  assert.doesNotMatch(source, /document\.cookie|EventSource|fetch\s*\(|localStorage|sessionStorage/);
});
