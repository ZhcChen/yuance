import assert from "node:assert/strict";
import test from "node:test";

import { createBusinessAttachmentCoordinator } from "../src/files/business-attachment-coordinator.mjs";

const binding = Object.freeze({ profileEpoch: 3, authorizationVersion: 7, webContentsId: 9, frameRoutingId: 2 });
const capability = `yfc_${"a".repeat(32)}`;
const metadata = Object.freeze({ filename: "report.txt", contentType: "text/plain", byteSize: 12, sha256: "b".repeat(64) });

test("coordinates work item upload without exposing private transfer data", async () => {
  const calls = [];
  const stages = [];
  const coordinator = fixture({ calls });
  const result = await coordinator.uploadWorkItemAttachment({ itemKey: "YCE-TASK-2", fileCapability: capability, binding, onStage: (stage) => stages.push(stage), signal: undefined });
  assert.deepEqual(stages, ["registering", "signing", "uploading", "confirming"]);
  assert.deepEqual(calls.map(([name]) => name), ["describe", "attachment.workitemcreate", "attachment.workitemuploadsign", "issue", "upload", "attachment.workitemconfirm"]);
  assert.deepEqual(result, { created: attachment("pending"), uploaded: attachment("uploaded") });
  assert.equal(JSON.stringify(result).includes("test-storage"), false);
});

test("coordinates comment upload with fixed business references", async () => {
  const calls = [];
  await fixture({ calls }).uploadWorkItemCommentAttachment({ itemKey: "YCE-TASK-2", commentId: 4, fileCapability: capability, binding, onStage: () => {}, signal: undefined });
  assert.deepEqual(calls[1], ["attachment.commentcreate", { itemKey: "YCE-TASK-2", commentId: 4, metadata }]);
  assert.deepEqual(calls[2], ["attachment.commentuploadsign", { itemKey: "YCE-TASK-2", commentId: 4, attachmentId: 9 }]);
  assert.deepEqual(calls[5], ["attachment.commentconfirm", { itemKey: "YCE-TASK-2", commentId: 4, attachmentId: 9 }]);
});

test("fails closed on signed metadata drift before issuing a grant", async () => {
  const calls = [];
  const coordinator = fixture({ calls, signedAttachment: { ...attachment("pending"), byte_size: 13 } });
  await assert.rejects(
    coordinator.uploadWorkItemAttachment({ itemKey: "YCE-TASK-2", fileCapability: capability, binding, onStage: () => {}, signal: undefined }),
    (error) => error.code === "attachment_upload_partial" && error.created.id === 9,
  );
  assert.equal(calls.some(([name]) => name === "issue"), false);
  assert.equal(calls.some(([name]) => name === "upload"), false);
});

test("distinguishes uncertain registration and uncertain confirmation", async () => {
  const createUncertain = fixture({ executeError: ["attachment.workitemcreate", "mutation_result_uncertain"] });
  await assert.rejects(
    createUncertain.uploadWorkItemAttachment({ itemKey: "YCE-TASK-2", fileCapability: capability, binding, onStage: () => {}, signal: undefined }),
    (error) => error.code === "attachment_create_uncertain" && error.created === undefined,
  );
  const confirmUncertain = fixture({ executeError: ["attachment.workitemconfirm", "mutation_result_uncertain"] });
  await assert.rejects(
    confirmUncertain.uploadWorkItemAttachment({ itemKey: "YCE-TASK-2", fileCapability: capability, binding, onStage: () => {}, signal: undefined }),
    (error) => error.code === "attachment_confirm_uncertain" && error.created.id === 9,
  );
});

test("downloads using the server filename and returns only public result fields", async () => {
  const calls = [];
  const result = await fixture({ calls, signedAttachment: attachment("uploaded") }).downloadWorkItemCommentAttachment({ itemKey: "YCE-TASK-2", commentId: 4, attachmentId: 9, binding, signal: undefined, window: Object.freeze({ id: 1 }) });
  assert.deepEqual(calls[0], ["attachment.commentdownloadsign", { itemKey: "YCE-TASK-2", commentId: 4, attachmentId: 9 }]);
  assert.equal(calls[2][1].suggestedFilename, "report.txt");
  assert.deepEqual(result, { status: "completed", filename: "report.txt", byteSize: 12 });
});

test("rejects download grants for attachments that are not uploaded", async () => {
  const calls = [];
  await assert.rejects(
    fixture({ calls }).downloadWorkItemAttachment({ itemKey: "YCE-TASK-2", attachmentId: 9, binding, signal: undefined, window: Object.freeze({ id: 1 }) }),
    (error) => error.code === "attachment_download_unavailable",
  );
  assert.equal(calls.some(([name]) => name === "issue"), false);
  assert.equal(calls.some(([name]) => name === "download"), false);
});

function fixture({ calls = [], signedAttachment = attachment("pending"), executeError } = {}) {
  const transfer = signedTransfer("upload");
  const restTransport = {
    async execute(name, input) {
      calls.push([name, input]);
      if (executeError?.[0] === name) throw Object.assign(new Error("failed"), { code: executeError[1] });
      if (name.endsWith("create")) return attachment("pending");
      if (name.endsWith("confirm")) return attachment("uploaded");
      if (name.endsWith("uploadsign")) return { attachment: signedAttachment, transfer };
      if (name.endsWith("downloadsign")) return { attachment: signedAttachment, transfer: signedTransfer("download") };
      throw new Error(`Unexpected operation: ${name}`);
    },
  };
  return createBusinessAttachmentCoordinator({
    restTransport,
    fileVault: { describe(value, valueBinding) { calls.push(["describe", { value, valueBinding }]); return metadata; } },
    grantVault: { issue(contract, valueBinding) { calls.push(["issue", { contract, valueBinding }]); return { grant: `ytg_${"c".repeat(32)}` }; } },
    uploadExecutor: { async execute(input) { calls.push(["upload", input]); return { status: "completed", byteSize: 12 }; } },
    downloadExecutor: { async execute(input) { calls.push(["download", input]); return { status: "completed", filename: input.suggestedFilename, byteSize: 12 }; } },
    apiOrigin: "http://127.0.0.1:3000",
    allowLoopbackHttp: true,
    allowedRelativePaths: { upload: "/api/v1/test-storage/upload", download: "/api/v1/test-storage/download" },
  });
}

function attachment(status) {
  return Object.freeze({ id: 9, filename: "report.txt", content_type: "text/plain", byte_size: 12, status, created_by: "Alice", created_at: "2026-08-03T00:00:00Z" });
}

function signedTransfer(purpose) {
  return Object.freeze({
    schema_version: 1,
    purpose,
    request: Object.freeze({ method: purpose === "upload" ? "PUT" : "GET", url: `/api/v1/test-storage/${purpose}?object_key=private`, headers: Object.freeze(purpose === "upload" ? [Object.freeze(["content-type", "text/plain"])] : []) }),
    expected_bytes: 12,
    content_type: "text/plain",
    sha256: "b".repeat(64),
    expires_in_seconds: 60,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  });
}
