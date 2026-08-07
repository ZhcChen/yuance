import assert from "node:assert/strict";
import test from "node:test";

import { createProjectAttachmentPreviewCoordinator } from "../src/files/project-attachment-preview-coordinator.mjs";

const binding = Object.freeze({ profileEpoch: 3, authorizationVersion: 7, webContentsId: 9, frameRoutingId: 2 });
const attachment = Object.freeze({ id: 7, filename: "design.pdf", content_type: "application/pdf", byte_size: 12, status: "uploaded", created_by: "Alice", created_at: "2026-08-07T00:00:00Z" });

test("derives the exact content request from trusted metadata and issues a public capability", async () => {
  const calls = [];
  const snapshot = Object.freeze({ privatePath: "/private/preview", contentType: "application/pdf", byteSize: 12, remove: async () => {} });
  const coordinator = createProjectAttachmentPreviewCoordinator({
    restTransport: { execute: async (operation, input) => { calls.push([operation, input]); return { attachment, preview: { kind: "document", content_enabled: true }, navigation: { position: 1, total: 1, previous: null, next: null }, content_url: "/api/v1/projects/YCE/attachments/7/preview/content" }; } },
    loader: { load: async (input) => { calls.push(["load", input]); return snapshot; } },
    vault: { issue: (value, actualBinding) => { assert.equal(value, snapshot); assert.equal(actualBinding, binding); return { capability: "ypv_public", source: "app://yuance/.preview/ypv_public", contentType: "application/pdf", byteSize: 12 }; }, release: () => {} },
  });
  const result = await coordinator.openProjectAttachmentPreview({ projectKey: "YCE", attachmentId: 7, binding, signal: undefined });
  assert.equal(result.source, "app://yuance/.preview/ypv_public");
  assert.deepEqual(calls[0], ["project.attachmentpreview", { projectKey: "YCE", attachmentId: 7 }]);
  assert.equal(calls[1][1].contentPath, "/api/v1/projects/YCE/attachments/7/preview/content");
});

test("rejects disabled or substituted content metadata before loading bytes", async () => {
  let loaded = false;
  const coordinator = createProjectAttachmentPreviewCoordinator({ restTransport: { execute: async () => ({ attachment, preview: { kind: "document", content_enabled: true }, navigation: {}, content_url: "/api/v1/projects/OTHER/attachments/7/preview/content" }) }, loader: { load: async () => { loaded = true; } }, vault: { issue: () => {}, release: () => {} } });
  await assert.rejects(coordinator.openProjectAttachmentPreview({ projectKey: "YCE", attachmentId: 7, binding, signal: undefined }), (error) => error.code === "preview_unavailable");
  assert.equal(loaded, false);
});

test("work item preview derives content only from its fixed semantic reference", async () => {
  const calls = [];
  const snapshot = Object.freeze({ privatePath: "/private/work-item-preview", contentType: "application/pdf", byteSize: 12, remove: async () => {} });
  const coordinator = createProjectAttachmentPreviewCoordinator({
    restTransport: { execute: async (operation, input) => { calls.push([operation, input]); return { attachment, preview: { kind: "document", content_enabled: true }, navigation: { position: 1, total: 1, previous: null, next: null }, content_url: "/api/v1/work-items/YCE-TASK-2/attachments/7/preview/content", download_url: "https://ignored.example/private" }; } },
    loader: { load: async (input) => { calls.push(["load", input]); return snapshot; } },
    vault: { issue: () => ({ capability: "ypv_work_item", source: "app://yuance/.preview/ypv_work_item", contentType: "application/pdf", byteSize: 12 }), release: () => {} },
  });
  const result = await coordinator.openWorkItemAttachmentPreview({ itemKey: "YCE-TASK-2", attachmentId: 7, binding, signal: undefined });
  assert.equal(result.source, "app://yuance/.preview/ypv_work_item");
  assert.deepEqual(calls[0], ["workitem.attachmentpreview", { itemKey: "YCE-TASK-2", attachmentId: 7 }]);
  assert.equal(calls[1][1].contentPath, "/api/v1/work-items/YCE-TASK-2/attachments/7/preview/content");
  assert.equal(JSON.stringify(result).includes("ignored.example"), false);
  await assert.rejects(coordinator.openWorkItemAttachmentPreview({ itemKey: "YCE-TASK-2", attachmentId: 7, binding, signal: undefined, url: "https://evil.example" }), /invalid/);
});

test("resource preview binds the access grant to metadata and content paths", async () => {
  const calls = [];
  const snapshot = Object.freeze({ privatePath: "/private/resource-preview", contentType: "application/pdf", byteSize: 12, remove: async () => {} });
  const contentPath = "/api/v1/projects/YCE/resources/8/attachments/7/preview/content?access=grant+token";
  const coordinator = createProjectAttachmentPreviewCoordinator({
    restTransport: { execute: async (operation, input) => { calls.push([operation, input]); return { attachment, preview: { kind: "document", content_enabled: true }, navigation: { position: 1, total: 1, previous: null, next: null }, content_url: contentPath }; } },
    loader: { load: async (input) => { calls.push(["load", input]); return snapshot; } },
    vault: { issue: () => ({ capability: "ypv_resource", source: "app://yuance/.preview/ypv_resource", contentType: "application/pdf", byteSize: 12 }), release: () => {} },
  });
  const result = await coordinator.openProjectResourceAttachmentPreview({ projectKey: "YCE", resourceId: 8, attachmentId: 7, accessToken: "grant token", binding, signal: undefined });
  assert.equal(result.source, "app://yuance/.preview/ypv_resource");
  assert.deepEqual(calls[0], ["project.resourceattachmentpreview", { projectKey: "YCE", resourceId: 8, attachmentId: 7, accessToken: "grant token" }]);
  assert.equal(calls[1][1].contentPath, contentPath);
});
