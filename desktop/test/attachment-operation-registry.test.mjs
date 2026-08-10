import assert from "node:assert/strict";
import test from "node:test";

import { createAttachmentOperationRegistry } from "../src/network/attachment-operation-registry.mjs";
import { createOperationRegistry } from "../src/network/operation-registry.mjs";

const metadata = Object.freeze({ filename: "report.txt", contentType: "text/plain", byteSize: 12, sha256: "a".repeat(64) });

test("builds fixed main-only work item and comment attachment descriptors", () => {
  const registry = createAttachmentOperationRegistry();
  const itemCreate = registry.resolve("attachment.workitemcreate", { itemKey: "YCE-TASK-2", metadata });
  assert.equal(itemCreate.path, "/api/v1/work-items/YCE-TASK-2/attachments");
  assert.equal(itemCreate.method, "POST");
  assert.equal(itemCreate.idempotent, false);
  assert.deepEqual(JSON.parse(itemCreate.body), {
    original_filename: "report.txt", content_type: "text/plain", byte_size: 12, checksum_sha256: "a".repeat(64),
  });
  assert.equal(
    registry.resolve("attachment.commentuploadsign", { itemKey: "YCE-TASK-2", commentId: 7, attachmentId: 9 }).path,
    "/api/v1/work-items/YCE-TASK-2/comments/7/attachments/9/upload-url?expires_in_seconds=60",
  );
  assert.equal(
    registry.resolve("attachment.workitemdownloadsign", { itemKey: "YCE-TASK-2", attachmentId: 9 }).path,
    "/api/v1/work-items/YCE-TASK-2/attachments/9/download-url?expires_in_seconds=60",
  );
  assert.equal(registry.resolve("attachment.projectcreate", { projectKey: "YCE", metadata }).path, "/api/v1/projects/YCE/attachments");
  assert.equal(registry.resolve("attachment.projectuploadsign", { projectKey: "YCE", attachmentId: 9 }).path, "/api/v1/projects/YCE/attachments/9/upload-url?expires_in_seconds=60");
  assert.equal(registry.resolve("attachment.projectdownloadsign", { projectKey: "YCE", attachmentId: 9 }).path, "/api/v1/projects/YCE/attachments/9/download-url?expires_in_seconds=60");
  assert.equal(registry.resolve("attachment.resourcecreate", { projectKey: "YCE", resourceId: 8, metadata }).path, "/api/v1/projects/YCE/resources/8/attachments");
  assert.equal(registry.resolve("attachment.resourceuploadsign", { projectKey: "YCE", resourceId: 8, attachmentId: 9 }).path, "/api/v1/projects/YCE/resources/8/attachments/9/upload-url?expires_in_seconds=60");
  assert.equal(registry.resolve("attachment.resourcedownloadsign", { projectKey: "YCE", resourceId: 8, attachmentId: 9, accessToken: "grant-token" }).path, "/api/v1/projects/YCE/resources/8/attachments/9/download-url?expires_in_seconds=60&access=grant-token");
  assert.equal(createOperationRegistry().resolve("project.attachments", { projectKey: "YCE" }).path, "/api/v1/projects/YCE/attachments");
  const preview = createOperationRegistry().resolve("project.attachmentpreview", { projectKey: "YCE", attachmentId: 9 });
  assert.equal(preview.path, "/api/v1/projects/YCE/attachments/9/preview");
  assert.equal(preview.method, "GET");
  assert.equal(createOperationRegistry().resolve("project.attachmentarchive", { projectKey: "YCE", attachmentId: 9 }).method, "DELETE");
});

test("signed responses become private transfer inputs and public attachment DTOs", () => {
  const descriptor = createAttachmentOperationRegistry().resolve("attachment.workitemuploadsign", { itemKey: "YCE-TASK-2", attachmentId: 9 });
  const parsed = descriptor.parse({
    attachment: rawAttachment(),
    request: { method: "PUT", url: "/api/v1/test-storage/upload?object_key=private", headers: [["content-type", "text/plain"]] },
    expires_in_seconds: 60,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    checksum_sha256: "a".repeat(64),
  });
  assert.deepEqual(parsed.attachment, {
    id: 9, filename: "report.txt", content_type: "text/plain", byte_size: 12,
    status: "pending", created_by: "Alice", created_at: "2026-08-03T00:00:00Z",
  });
  assert.equal(parsed.transfer.sha256, "a".repeat(64));
  assert.equal(JSON.stringify(parsed.attachment).includes("private"), false);
});

test("rejects request primitive injection and keeps attachment operations out of renderer registry", () => {
  const registry = createAttachmentOperationRegistry();
  for (const input of [
    { itemKey: "YCE-TASK-2", metadata, url: "https://attacker.invalid" },
    { itemKey: "../secret", metadata },
    { itemKey: "YCE-TASK-2", metadata: { ...metadata, sha256: "A".repeat(64) } },
    { itemKey: "YCE-TASK-2", metadata: { ...metadata, path: "/secret" } },
  ]) assert.throws(() => registry.resolve("attachment.workitemcreate", input));
  assert.throws(() => registry.resolve("attachment.resourcedownloadsign", { projectKey: "YCE", resourceId: 8, attachmentId: 9, accessToken: "ok", url: "https://attacker.invalid" }));
  assert.throws(() => createOperationRegistry().resolve("attachment.workitemcreate", { itemKey: "YCE-TASK-2", metadata }), /unknown operation/);
});

test("builds fixed release asset lifecycle descriptors and strips signed storage fields", () => {
  const registry = createAttachmentOperationRegistry();
  const create = registry.resolve("attachment.releasecreate", { releaseId: 7, platform: "windows", architecture: "x64", artifactKind: "installer", metadata });
  assert.equal(create.path, "/api/v1/system/releases/7/assets");
  assert.deepEqual(JSON.parse(create.body), { platform: "windows", architecture: "x64", artifact_kind: "installer", original_filename: "report.txt", content_type: "text/plain", byte_size: 12, checksum_sha256: "a".repeat(64) });
  assert.equal(registry.resolve("attachment.releaseuploadsign", { releaseId: 7, attachmentId: 19 }).path, "/api/v1/system/releases/7/assets/19/upload-url?expires_in_seconds=60");
  assert.equal(registry.resolve("attachment.releaseconfirm", { releaseId: 7, attachmentId: 19 }).path, "/api/v1/system/releases/7/assets/19/uploaded");
  const download = registry.resolve("attachment.releasedownloadsign", { releaseId: 7, attachmentId: 19 });
  assert.equal(download.path, "/api/v1/system/releases/7/assets/19/download-url?expires_in_seconds=60");
  const parsed = download.parse({ attachment: { ...rawAttachment(), id: 19, created_by: "" }, request: { method: "GET", url: "/api/v1/test-storage/download?object_key=private", headers: [] }, expires_in_seconds: 60, expires_at: new Date(Date.now() + 60_000).toISOString(), checksum_sha256: "a".repeat(64) });
  assert.deepEqual(Object.keys(parsed.attachment).sort(), ["byte_size", "content_type", "created_at", "created_by", "filename", "id", "status"]);
  assert.equal(JSON.stringify(parsed.attachment).includes("object_key"), false);
  for (const input of [{ releaseId: 0, platform: "windows", architecture: "x64", artifactKind: "installer", metadata }, { releaseId: 7, platform: "darwin", architecture: "x64", artifactKind: "installer", metadata }, { releaseId: 7, platform: "windows", architecture: "ia32", artifactKind: "installer", metadata }, { releaseId: 7, platform: "windows", architecture: "x64", artifactKind: "binary", metadata }]) assert.throws(() => registry.resolve("attachment.releasecreate", input));
});

function rawAttachment() {
  return {
    id: 9,
    file_object_id: 11,
    object_key: "private/object/key",
    filename: "report.txt",
    content_type: "text/plain",
    byte_size: 12,
    status: "pending",
    created_by: "Alice",
    created_at: "2026-08-03T00:00:00Z",
  };
}
