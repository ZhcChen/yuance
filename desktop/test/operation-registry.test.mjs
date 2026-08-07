import assert from "node:assert/strict";
import test from "node:test";

import { createOperationRegistry } from "../src/network/operation-registry.mjs";

test("registers fixed Device operations and rejects request primitive injection", () => {
  const registry = createOperationRegistry();
  assert.deepEqual(registry.resolve("session.probe", {}), {
    idempotent: true,
    method: "GET",
    path: "/api/v1/device-session",
    parse: registry.resolve("session.probe", {}).parse,
  });
  assert.deepEqual(Object.fromEntries(["upload", "download"].map((purpose) => {
    const operation = registry.resolve(`file.canary${purpose}`, {});
    return [purpose, { idempotent: operation.idempotent, method: operation.method, path: operation.path }];
  })), {
    upload: { idempotent: false, method: "POST", path: "/api/v1/device-file-transfer/canary/upload-request" },
    download: { idempotent: true, method: "GET", path: "/api/v1/device-file-transfer/canary/download-request" },
  });
  for (const [name, input] of [
    ["session.unknown", {}],
    ["identity.current", { url: "https://evil.example" }],
    ["project.list", { method: "POST" }],
    ["notification.list", { headers: { Authorization: "Bearer forged" } }],
    ["workitem.detail", { itemKey: "DEMO-1", origin: "https://evil.example" }],
    ["session.probe", JSON.parse('{"__proto__":{"polluted":true}}')],
    ["session.probe/../logout", {}],
  ]) assert.throws(() => registry.resolve(name, input), /operation|input/i);
});

test("builds fixed read-only business paths from validated domain input", () => {
  const registry = createOperationRegistry();
  const cases = [
    ["identity.current", {}, "/api/v1/auth/me"],
    ["identity.profile", {}, "/api/v1/me/profile"],
    ["shell.topbar", {}, "/api/v1/topbar/status"],
    ["search.list", { q: " 登录失败 ", page: 2, perPage: 20 }, "/api/v1/search?q=%E7%99%BB%E5%BD%95%E5%A4%B1%E8%B4%A5&page=2&per_page=20"],
    ["project.list", {}, "/api/v1/projects"],
    ["project.list", { status: "in_progress", page: 2, perPage: 25 }, "/api/v1/projects?status=in_progress&page=2&per_page=25"],
    ["project.current", {}, "/api/v1/current-project"],
    ["notification.list", {}, "/api/v1/notifications?filter=all"],
    ["notification.list", { filter: "unread", limit: 20, page: 2, perPage: 10 }, "/api/v1/notifications?limit=20&filter=unread&page=2&per_page=10"],
    ["notification.target", { notificationId: 9 }, "/api/v1/notifications/9/target"],
    ["workitem.list", {}, "/api/v1/work-items"],
    ["workitem.list", {
      assigneeUsername: " alice ", itemType: "bug", page: 3, perPage: 50,
      priority: "P1", projectKey: "DEMO", q: " crash ", status: "in_progress",
    }, "/api/v1/work-items?item_type=bug&q=crash&status=in_progress&priority=P1&assignee_username=alice&project_key=DEMO&page=3&per_page=50"],
    ["workitem.detail", { itemKey: "DEMO-1" }, "/api/v1/work-items/DEMO-1"],
    ["workitem.comments", { itemKey: "DEMO-1" }, "/api/v1/work-items/DEMO-1/comments"],
    ["workitem.attachments", { itemKey: "DEMO-1" }, "/api/v1/work-items/DEMO-1/attachments"],
    ["workitem.commentattachments", { itemKey: "DEMO-1", commentId: 7 }, "/api/v1/work-items/DEMO-1/comments/7/attachments"],
  ];
  for (const [name, input, path] of cases) {
    const operation = registry.resolve(name, input);
    assert.deepEqual({ idempotent: operation.idempotent, method: operation.method, path: operation.path }, {
      idempotent: true, method: "GET", path,
    });
  }
  assert.equal(registry.resolve("workitem.comments", { itemKey: "DEMO-1" }).dataKind, "array");
  assert.equal(registry.resolve("workitem.attachments", { itemKey: "DEMO-1" }).dataKind, "array");
  assert.equal(registry.resolve("project.current", {}).dataKind, "nullable-object");
});

test("rejects invalid business identifiers, filters and pagination", () => {
  const registry = createOperationRegistry();
  for (const [name, input] of [
    ["project.list", { status: "deleted" }],
    ["project.list", { page: 0 }],
    ["project.list", { perPage: 101 }],
    ["notification.list", { filter: "secret" }],
    ["notification.list", { limit: 101 }],
    ["notification.target", { notificationId: 0 }],
    ["search.list", { q: "x".repeat(129) }],
    ["workitem.list", { projectKey: "demo" }],
    ["workitem.list", { itemType: "incident" }],
    ["workitem.list", { priority: "urgent" }],
    ["workitem.list", { q: "x".repeat(121) }],
    ["workitem.list", { status: "x".repeat(49) }],
    ["workitem.list", { assigneeUsername: "x".repeat(65) }],
    ["workitem.detail", { itemKey: "bad/key" }],
    ["workitem.comments", { itemKey: "A" }],
    ["workitem.commentattachments", { itemKey: "DEMO-1", commentId: -1 }],
  ]) assert.throws(() => registry.resolve(name, input), /invalid/i, `${name} should reject invalid input`);
});

test("normalizes and freezes allowlisted business response DTOs", () => {
  const registry = createOperationRegistry();
  const user = registry.resolve("identity.current", {}).parse({
    id: 7, username: "alice", display_name: "Alice", is_super_admin: false,
    access_token: "yuance_dat_leak", object_key: "private/object", signed_url: "https://signed.example",
  });
  assert.deepEqual(user, { id: 7, username: "alice", display_name: "Alice", is_super_admin: false });
  assert.equal(Object.isFrozen(user), true);
  const profile = registry.resolve("identity.profile", {}).parse({
    id: 7, username: "alice", display_name: "Alice", email: "alice@example.com", mobile: "13800000000",
    status: "active", is_super_admin: false, roles: "成员", created_at: "2026-08-01", updated_at: "2026-08-07",
    password_hash: "leak",
  });
  assert.equal(profile.email, "alice@example.com");
  assert.equal("password_hash" in profile, false);

  const page = registry.resolve("workitem.list", {}).parse({
    items: [{
      key: "DEMO-1", item_type: "bug", title: "Crash", status: "open", priority: "P1",
      project_key: "DEMO", project_name: "Demo", assignee: "Alice", updated_at: "2026-08-03T00:00:00Z",
      authorization: "Bearer leak", local_path: "/tmp/leak",
    }],
    pagination: { page: 1, per_page: 20, total_items: 1, total_pages: 1, next_url: "https://evil.example" },
    response_headers: { authorization: "Bearer leak" },
  });
  assert.equal(Object.isFrozen(page), true);
  assert.equal(Object.isFrozen(page.items), true);
  assert.equal(Object.isFrozen(page.items[0]), true);
  assert.equal(Object.isFrozen(page.pagination), true);
  assert.equal("authorization" in page.items[0], false);
  assert.equal("local_path" in page.items[0], false);
  assert.equal("next_url" in page.pagination, false);
  assert.equal("response_headers" in page, false);

  const search = registry.resolve("search.list", { q: "crash" }).parse({
    items: [{ kind: "bug", key: "DEMO-1", title: "Crash", context: "Details", target: "/web/work-items/DEMO-1", updated_at: "2026-08-07T00:00:00Z", signed_url: "https://evil.example" }],
    pagination: { page: 1, per_page: 10, total_items: 1, total_pages: 1 },
  });
  assert.deepEqual(search.items[0], { kind: "bug", key: "DEMO-1", title: "Crash", context: "Details", target: "/web/work-items/DEMO-1", updated_at: "2026-08-07T00:00:00Z" });

  const attachments = registry.resolve("workitem.attachments", { itemKey: "DEMO-1" }).parse([{
    id: 3, filename: "report.txt", content_type: "text/plain", byte_size: 12,
    status: "uploaded", created_by: "Alice", created_at: "2026-08-03T00:00:00Z",
    object_key: "private/object", signed_url: "https://signed.example", headers: { authorization: "secret" },
  }]);
  assert.deepEqual(attachments[0], {
    id: 3, filename: "report.txt", content_type: "text/plain", byte_size: 12,
    status: "uploaded", created_by: "Alice", created_at: "2026-08-03T00:00:00Z",
  });
  assert.equal(Object.isFrozen(attachments), true);
  assert.equal(Object.isFrozen(attachments[0]), true);
});

test("rejects malformed or oversized business responses", () => {
  const registry = createOperationRegistry();
  const projectParser = registry.resolve("project.list", {}).parse;
  assert.throws(() => projectParser({ items: [], pagination: { page: 1 } }), /invalid/i);
  assert.throws(() => projectParser({
    items: Array.from({ length: 501 }, () => ({})),
    pagination: { page: 1, per_page: 20, total_items: 501, total_pages: 26 },
  }), /invalid/i);
  assert.throws(() => registry.resolve("identity.current", {}).parse({
    id: 1, username: "x".repeat(257), display_name: "Alice", is_super_admin: false,
  }), /invalid/i);
  assert.throws(() => registry.resolve("workitem.detail", { itemKey: "DEMO-1" }).parse({}), /invalid/i);
  assert.throws(() => registry.resolve("workitem.comments", { itemKey: "DEMO-1" }).parse("not-an-array"), /invalid/i);
  assert.throws(() => registry.resolve("notification.list", {}).parse({
    items: Array.from({ length: 101 }, () => ({})), unread_count: 0, pending_count: 0,
    filter: "all", page: 1, per_page: 20, total_items: 101, total_pages: 6,
  }), /invalid/i);
});

test("builds non-idempotent mutation descriptors from bounded domain payloads", () => {
  const registry = createOperationRegistry();
  const cases = [
    ["identity.profileupdate", { displayName: "Alice", email: "alice@example.com", mobile: "13800000000" }, "PATCH", "/api/v1/me/profile", { display_name: "Alice", email: "alice@example.com", mobile: "13800000000" }],
    ["project.select", { projectKey: "DEMO" }, "PATCH", "/api/v1/current-project", { project_key: "DEMO" }],
    ["notification.read", { notificationId: 7 }, "POST", "/api/v1/notifications/7/read", undefined],
    ["notification.readall", {}, "POST", "/api/v1/notifications/read-all", undefined],
    ["workitem.update", { itemKey: "DEMO-1", payload: { title: "Updated", description: "Body", status: "in_progress", priority: "P1", assigneeUsername: "alice", dueDate: "2026-08-31", parentItemKey: "" } }, "PATCH", "/api/v1/work-items/DEMO-1", { title: "Updated", description: "Body", status: "in_progress", priority: "P1", assignee_username: "alice", due_date: "2026-08-31", parent_item_key: "" }],
    ["workitem.handoff", { itemKey: "DEMO-1", payload: { status: "in_progress", assigneeUsername: "alice", body: "Continue", sourceCommentId: null } }, "POST", "/api/v1/work-items/DEMO-1/handoff", { status: "in_progress", assignee_username: "alice", body: "Continue", source_comment_id: null }],
    ["workitem.commentcreate", { itemKey: "DEMO-1", payload: { body: "Comment", bodyFormat: "plain" } }, "POST", "/api/v1/work-items/DEMO-1/comments", { body: "Comment", body_format: "plain" }],
    ["workitem.commentupdate", { itemKey: "DEMO-1", commentId: 9, payload: { body: "Edited", bodyFormat: "plain", parentCommentId: null } }, "PATCH", "/api/v1/work-items/DEMO-1/comments/9", { body: "Edited", body_format: "plain", parent_comment_id: null }],
  ];
  for (const [name, input, method, path, body] of cases) {
    const operation = registry.resolve(name, input);
    assert.equal(operation.idempotent, false);
    assert.equal(operation.method, method);
    assert.equal(operation.path, path);
    assert.deepEqual(operation.body === undefined ? undefined : JSON.parse(operation.body), body);
    assert.equal(operation.body === undefined ? operation.contentType : operation.contentType, body === undefined ? undefined : "application/json");
  }
});

test("rejects invalid mutation fields before a descriptor is created", () => {
  const registry = createOperationRegistry();
  for (const [name, input] of [
    ["project.select", { projectKey: "demo" }],
    ["identity.profileupdate", { displayName: " ", email: "", mobile: "" }],
    ["notification.read", { notificationId: 0 }],
    ["workitem.update", { itemKey: "DEMO-1", payload: {} }],
    ["workitem.update", { itemKey: "DEMO-1", payload: { title: " " } }],
    ["workitem.update", { itemKey: "DEMO-1", payload: { title: "x".repeat(161) } }],
    ["workitem.update", { itemKey: "DEMO-1", payload: { description: "x".repeat(5_001) } }],
    ["workitem.update", { itemKey: "DEMO-1", payload: { status: "unknown" } }],
    ["workitem.update", { itemKey: "DEMO-1", payload: { priority: "P9" } }],
    ["workitem.update", { itemKey: "DEMO-1", payload: { dueDate: "2026-99-99" } }],
    ["workitem.handoff", { itemKey: "DEMO-1", payload: { status: "open", assigneeUsername: "", body: "x", url: "https://evil.example" } }],
    ["workitem.commentcreate", { itemKey: "DEMO-1", payload: { body: "" } }],
    ["workitem.commentcreate", { itemKey: "DEMO-1", payload: { body: "x".repeat(5_001) } }],
    ["workitem.commentcreate", { itemKey: "DEMO-1", payload: { body: "x", bodyFormat: "html" } }],
    ["workitem.commentupdate", { itemKey: "DEMO-1", commentId: 0, payload: { body: "x" } }],
  ]) assert.throws(() => registry.resolve(name, input), /invalid|unknown/i);
});

test("normalizes a probe response without credentials", () => {
  const operation = createOperationRegistry().resolve("session.probe", {});
  const value = operation.parse({
    user_id: 7,
    username: "alice",
    display_name: "Alice",
    device_id: "device-1",
    family_id: "family-1",
    generation: 2,
    authorization_version: 3,
    access_expires_at: "2026-08-02T12:00:00Z",
    server_instance_id: "server-1",
  }, { serverInstanceId: "server-1" });
  assert.equal(value.username, "alice");
  assert.equal(Object.isFrozen(value), true);
  assert.equal("access_token" in value, false);
  assert.throws(() => operation.parse({
    user_id: 7, username: "alice", display_name: "Alice", device_id: "device-1", family_id: "family-1",
    generation: 2, authorization_version: 3, access_expires_at: "2026-08-02T12:00:00Z",
    server_instance_id: "server-1", access_token: "yuance_dat_leak",
  }, { serverInstanceId: "server-1" }), /identity/i);
});

test("tracks only fixed file operations with a bounded abort lifecycle", () => {
  const registry = createOperationRegistry({ maxActiveOperations: 2 });
  const first = new AbortController();
  const second = new AbortController();
  const finish = registry.begin("file.upload", first);
  const finishSecond = registry.begin("file.download", second);
  assert.deepEqual(registry.snapshot(), { active: 2 });
  assert.throws(() => registry.begin("file.upload", new AbortController()), (error) => error.code === "file_transfer_concurrency_limit");
  assert.throws(() => registry.begin("network.generic", new AbortController()), /active operation/);
  registry.abortAll();
  assert.equal(first.signal.aborted, true);
  assert.equal(second.signal.aborted, true);
  assert.deepEqual(registry.snapshot(), { active: 2 });
  finish();
  finishSecond();
  assert.deepEqual(registry.snapshot(), { active: 0 });
  assert.throws(() => createOperationRegistry({ maxActiveOperations: 5 }), /fixed safety limit/);
});
