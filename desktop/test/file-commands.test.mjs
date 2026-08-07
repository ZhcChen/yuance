import assert from "node:assert/strict";
import test from "node:test";

import { FILE_CHANNELS, registerFileCommandHandlers } from "../src/ipc/file-commands.mjs";

function fixture() {
  const handlers = new Map();
  const calls = [];
  const senderListeners = new Map();
  const event = { sender: { id: 7, send: (...args) => calls.push(["send", ...args]), once: (name, listener) => senderListeners.set(name, listener), removeListener: (name, listener) => { if (senderListeners.get(name) === listener) senderListeners.delete(name); }, isDestroyed: () => false }, senderFrame: { routingId: 11 } };
  const dispose = registerFileCommandHandlers({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler), removeHandler: (channel) => handlers.delete(channel) },
    assertSender: (actual) => { calls.push(["sender", actual]); if (actual !== event) throw new Error("untrusted secret"); },
    getBinding: (_event, purpose) => ({ profileEpoch: 1, authorizationVersion: 2, webContentsId: 7, frameRoutingId: 11, purpose }),
    getWindow: () => ({ id: "window" }),
    fileDialog: { choose: async (input) => { calls.push(["choose", input]); return { capability: `yfc_${"a".repeat(32)}`, filename: "canary.txt", contentType: "text/plain", byteSize: 34, privatePath: "/secret" }; } },
    issueTransferGrant: async (purpose, binding) => { calls.push(["grant", purpose, binding]); return `ytg_${purpose}`; },
    uploadExecutor: { execute: async (input) => { calls.push(["upload", input]); return { status: "completed", byteSize: 34, url: "https://secret" }; } },
    downloadExecutor: { execute: async (input) => { calls.push(["download", input]); return { status: "completed", byteSize: 34, filename: "canary.txt", path: "/secret" }; } },
    attachmentCoordinator: {
      uploadWorkItemAttachment: async (input) => { calls.push(["attachment-upload", input]); input.onStage("registering"); input.onStage("uploading"); return { created: attachment("pending"), uploaded: attachment("uploaded") }; },
      uploadWorkItemCommentAttachment: async (input) => { calls.push(["comment-attachment-upload", input]); return { created: attachment("pending"), uploaded: attachment("uploaded") }; },
      uploadProjectAttachment: async (input) => { calls.push(["project-attachment-upload", input]); input.onStage("registering"); return { created: attachment("pending"), uploaded: attachment("uploaded") }; },
      uploadProjectResourceAttachment: async (input) => { calls.push(["resource-attachment-upload", input]); input.onStage("registering"); return { created: attachment("pending"), uploaded: attachment("uploaded") }; },
      downloadWorkItemAttachment: async (input) => { calls.push(["attachment-download", input]); return { status: "completed", filename: "report.txt", byteSize: 12, revealCapability: `yrd_${"b".repeat(32)}`, path: "/secret" }; },
      downloadWorkItemCommentAttachment: async (input) => { calls.push(["comment-attachment-download", input]); return { status: "cancelled" }; },
      downloadProjectAttachment: async (input) => { calls.push(["project-attachment-download", input]); return { status: "completed", filename: "project.txt", byteSize: 12 }; },
      downloadProjectResourceAttachment: async (input) => { calls.push(["resource-attachment-download", input]); return { status: "completed", filename: "resource.txt", byteSize: 12 }; },
    },
    previewCoordinator: {
      openProjectAttachmentPreview: async (input) => { calls.push(["preview-open", input]); return { capability: `ypv_${"c".repeat(32)}`, source: `app://yuance/.preview/ypv_${"c".repeat(32)}`, contentType: "application/pdf", byteSize: 12, attachment: attachment("uploaded"), preview: { kind: "document", strategy: "pdf", file_type: "pdf", kind_label: "PDF", is_experimental: false, legacy_preview_enabled: false, content_enabled: true }, navigation: { position: 1, total: 1, previous: null, next: null }, privatePath: "/secret" }; },
      openWorkItemAttachmentPreview: async (input) => { calls.push(["work-item-preview-open", input]); return { capability: `ypv_${"e".repeat(32)}`, source: `app://yuance/.preview/ypv_${"e".repeat(32)}`, contentType: "application/pdf", byteSize: 12, attachment: attachment("uploaded"), preview: { kind: "document", strategy: "pdf", file_type: "pdf", kind_label: "PDF", is_experimental: false, legacy_preview_enabled: false, content_enabled: true }, navigation: { position: 1, total: 1, previous: null, next: null }, privatePath: "/secret" }; },
      openWorkItemCommentAttachmentPreview: async (input) => { calls.push(["comment-preview-open", input]); return { capability: `ypv_${"f".repeat(32)}`, source: `app://yuance/.preview/ypv_${"f".repeat(32)}`, contentType: "application/pdf", byteSize: 12, attachment: attachment("uploaded"), preview: { kind: "document", strategy: "pdf", file_type: "pdf", kind_label: "PDF", is_experimental: false, legacy_preview_enabled: false, content_enabled: true }, navigation: { position: 1, total: 1, previous: null, next: null }, privatePath: "/secret" }; },
      openProjectResourceAttachmentPreview: async (input) => { calls.push(["resource-preview-open", input]); return { capability: `ypv_${"d".repeat(32)}`, source: `app://yuance/.preview/ypv_${"d".repeat(32)}`, contentType: "application/pdf", byteSize: 12, attachment: attachment("uploaded"), preview: { kind: "document", strategy: "pdf", file_type: "pdf", kind_label: "PDF", is_experimental: false, legacy_preview_enabled: false, content_enabled: true }, navigation: { position: 1, total: 1, previous: null, next: null }, privatePath: "/secret" }; },
      releaseProjectAttachmentPreview: (input) => { calls.push(["preview-release", input]); return { status: "released" }; },
    },
    revealController: { reveal: async (capability, binding) => { calls.push(["reveal", capability, binding]); return { status: "revealed", path: "/secret" }; } },
  });
  return { handlers, calls, event, dispose };
}

test("file commands bind fixed intents and return only public fields", async () => {
  const value = fixture();
  const capability = `yfc_${"a".repeat(32)}`;
  assert.deepEqual(await value.handlers.get(FILE_CHANNELS.choose)(value.event), { capability, filename: "canary.txt", contentType: "text/plain", byteSize: 34 });
  assert.deepEqual(await value.handlers.get(FILE_CHANNELS.uploadCanary)(value.event, capability), { status: "completed", byteSize: 34 });
  assert.deepEqual(await value.handlers.get(FILE_CHANNELS.downloadCanary)(value.event), { status: "completed", byteSize: 34, filename: "canary.txt" });
  assert.equal(JSON.stringify(value.calls).includes("/secret"), false);
  assert.equal(JSON.stringify(value.calls.filter(([name]) => name === "grant")).includes("authorizationVersion"), true);
  value.dispose();
  assert.equal(value.handlers.size, 0);
});

test("sender validation precedes payload and dependency access", async () => {
  const value = fixture();
  await assert.rejects(value.handlers.get(FILE_CHANNELS.uploadCanary)({}, { path: "/secret" }), (error) => error.code === "file_unavailable" && !error.message.includes("secret"));
  assert.deepEqual(value.calls.map(([name]) => name), ["sender"]);
});

test("file commands reject extensible payloads and invalid opaque IDs", async () => {
  const value = fixture();
  await assert.rejects(value.handlers.get(FILE_CHANNELS.choose)(value.event, {}), (error) => error.code === "file_unavailable");
  await assert.rejects(value.handlers.get(FILE_CHANNELS.downloadCanary)(value.event, {}), (error) => error.code === "file_unavailable");
  await assert.rejects(value.handlers.get(FILE_CHANNELS.uploadCanary)(value.event, "C:\\secret"), (error) => error.code === "file_capability_invalid");
  assert.equal(value.calls.some(([name]) => ["choose", "grant", "upload", "download"].includes(name)), false);
});

test("business attachment commands publish bounded progress and public results", async () => {
  const value = fixture();
  const operationId = "12345678-1234-4123-8123-123456789abc";
  const result = await value.handlers.get(FILE_CHANNELS.uploadWorkItemAttachment)(value.event, { operationId, input: { itemKey: "YCE-TASK-2", fileCapability: `yfc_${"a".repeat(32)}` } });
  assert.deepEqual(result, { created: attachment("pending"), uploaded: attachment("uploaded") });
  assert.deepEqual(value.calls.filter(([name]) => name === "send"), [
    ["send", FILE_CHANNELS.attachmentProgress, { operationId, stage: "registering" }],
    ["send", FILE_CHANNELS.attachmentProgress, { operationId, stage: "uploading" }],
  ]);
  assert.deepEqual(await value.handlers.get(FILE_CHANNELS.downloadWorkItemAttachment)(value.event, { itemKey: "YCE-TASK-2", attachmentId: 9, suggestedFilename: "ignored.txt" }), { status: "completed", filename: "report.txt", byteSize: 12, revealCapability: `yrd_${"b".repeat(32)}` });
  assert.deepEqual(await value.handlers.get(FILE_CHANNELS.uploadProjectAttachment)(value.event, { operationId, input: { projectKey: "YCE", fileCapability: `yfc_${"a".repeat(32)}` } }), { created: attachment("pending"), uploaded: attachment("uploaded") });
  assert.deepEqual(await value.handlers.get(FILE_CHANNELS.downloadProjectAttachment)(value.event, { projectKey: "YCE", attachmentId: 9, suggestedFilename: "ignored.txt" }), { status: "completed", filename: "project.txt", byteSize: 12 });
  assert.equal(JSON.stringify(result).includes("/secret"), false);
});

test("project attachment upload accepts a bounded retry attachment id", async () => {
  const value = fixture();
  const operationId = "12345678-1234-4123-8123-123456789abc";
  assert.deepEqual(await value.handlers.get(FILE_CHANNELS.uploadProjectAttachment)(value.event, { operationId, input: { projectKey: "YCE", attachmentId: 9, fileCapability: `yfc_${"a".repeat(32)}` } }), { created: attachment("pending"), uploaded: attachment("uploaded") });
  assert.equal(value.calls.some(([name, input]) => name === "project-attachment-upload" && input.attachmentId === 9), true);
});

test("work item attachment upload accepts a bounded retry attachment id", async () => {
  const value = fixture();
  const operationId = "12345678-1234-4123-8123-123456789abc";
  assert.deepEqual(await value.handlers.get(FILE_CHANNELS.uploadWorkItemAttachment)(value.event, { operationId, input: { itemKey: "YCE-TASK-2", attachmentId: 9, fileCapability: `yfc_${"a".repeat(32)}` } }), { created: attachment("pending"), uploaded: attachment("uploaded") });
  assert.equal(value.calls.some(([name, input]) => name === "attachment-upload" && input.attachmentId === 9), true);
});

test("reveal command binds the opaque capability to the current sender", async () => {
  const value = fixture();
  const capability = `yrd_${"b".repeat(32)}`;
  assert.deepEqual(await value.handlers.get(FILE_CHANNELS.revealDownload)(value.event, capability), { status: "revealed" });
  assert.deepEqual(value.calls.find(([name]) => name === "reveal"), ["reveal", capability, { profileEpoch: 1, authorizationVersion: 2, webContentsId: 7, frameRoutingId: 11, purpose: "reveal-download" }]);
  await assert.rejects(value.handlers.get(FILE_CHANNELS.revealDownload)(value.event, "/private/report.txt"), (error) => error.code === "file_reveal_invalid");
});

test("project preview commands bind sender and expose only opaque content sources", async () => {
  const value = fixture();
  const result = await value.handlers.get(FILE_CHANNELS.openProjectAttachmentPreview)(value.event, { projectKey: "YCE", attachmentId: 9 });
  assert.match(result.capability, /^ypv_/u);
  assert.equal(result.source, `app://yuance/.preview/${result.capability}`);
  assert.equal(JSON.stringify(result).includes("/secret"), false);
  assert.equal(value.calls.find(([name]) => name === "preview-open")[1].binding.webContentsId, 7);
  const workItemResult = await value.handlers.get(FILE_CHANNELS.openWorkItemAttachmentPreview)(value.event, { itemKey: "YCE-TASK-2", attachmentId: 9 });
  assert.equal(workItemResult.source, `app://yuance/.preview/ypv_${"e".repeat(32)}`);
  assert.equal(value.calls.find(([name]) => name === "work-item-preview-open")[1].binding.webContentsId, 7);
  const commentResult = await value.handlers.get(FILE_CHANNELS.openWorkItemCommentAttachmentPreview)(value.event, { itemKey: "YCE-TASK-2", commentId: 8, attachmentId: 9 });
  assert.equal(commentResult.source, `app://yuance/.preview/ypv_${"f".repeat(32)}`);
  assert.equal(value.calls.find(([name]) => name === "comment-preview-open")[1].binding.webContentsId, 7);
  const resourceResult = await value.handlers.get(FILE_CHANNELS.openProjectResourceAttachmentPreview)(value.event, { projectKey: "YCE", resourceId: 8, attachmentId: 9, accessToken: "grant" });
  assert.equal(resourceResult.source, `app://yuance/.preview/ypv_${"d".repeat(32)}`);
  assert.equal(JSON.stringify(resourceResult).includes("/secret"), false);
  assert.equal(value.calls.find(([name]) => name === "resource-preview-open")[1].binding.webContentsId, 7);
  assert.deepEqual(await value.handlers.get(FILE_CHANNELS.releaseProjectAttachmentPreview)(value.event, result.capability), { status: "released" });
});

test("business attachment commands reject injected primitives before coordinator access", async () => {
  const value = fixture();
  const channel = value.handlers.get(FILE_CHANNELS.uploadWorkItemAttachment);
  await assert.rejects(channel(value.event, { operationId: "not-random", input: { itemKey: "YCE-TASK-2", fileCapability: `yfc_${"a".repeat(32)}` } }), (error) => error.code === "file_unavailable");
  await assert.rejects(channel(value.event, { operationId: "12345678-1234-4123-8123-123456789abc", input: { itemKey: "YCE-TASK-2", fileCapability: `yfc_${"a".repeat(32)}`, url: "https://secret" } }), (error) => error.code === "file_unavailable");
  assert.equal(value.calls.some(([name]) => name === "attachment-upload"), false);
});

function attachment(status) {
  return { id: 9, filename: "report.txt", content_type: "text/plain", byte_size: 12, status, created_by: "Alice", created_at: "2026-08-03T00:00:00Z" };
}
