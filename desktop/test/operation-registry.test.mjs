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
    ["project.detail", { projectKey: "DEMO" }, "/api/v1/projects/DEMO"],
    ["project.members", { projectKey: "DEMO" }, "/api/v1/projects/DEMO/members"],
    ["project.cycles", { projectKey: "DEMO" }, "/api/v1/projects/DEMO/cycles"],
    ["project.cycledetail", { projectKey: "DEMO", cycleId: 7 }, "/api/v1/projects/DEMO/cycles/7"],
    ["project.personalanalysis", { projectKey: "DEMO" }, "/api/v1/projects/DEMO/my-analysis"],
    ["project.resources", { projectKey: "DEMO", q: "发布", category: "development", relatedCycleId: 7 }, "/api/v1/projects/DEMO/resources?q=%E5%8F%91%E5%B8%83&category=development&related_cycle_id=7"],
    ["project.resourcedetail", { projectKey: "DEMO", resourceId: 9 }, "/api/v1/projects/DEMO/resources/9"],
    ["project.resourceattachments", { projectKey: "DEMO", resourceId: 9, accessToken: "grant-token" }, "/api/v1/projects/DEMO/resources/9/attachments?access=grant-token"],
    ["project.resourceattachmentpreview", { projectKey: "DEMO", resourceId: 9, attachmentId: 11, accessToken: "grant token" }, "/api/v1/projects/DEMO/resources/9/attachments/11/preview?access=grant+token"],
    ["project.current", {}, "/api/v1/current-project"],
    ["notification.list", {}, "/api/v1/notifications?filter=all"],
    ["notification.list", { filter: "unread", limit: 20, page: 2, perPage: 10 }, "/api/v1/notifications?limit=20&filter=unread&page=2&per_page=10"],
    ["notification.target", { notificationId: 9 }, "/api/v1/notifications/9/target"],
    ["workitem.list", {}, "/api/v1/work-items"],
    ["workitem.listview", {}, "/api/v1/work-item-list-view"],
    ["workitem.list", {
      assigneeUsername: " alice ", itemType: "bug", page: 3, perPage: 50,
      priority: "P1", projectKey: "DEMO", q: " crash ", status: "in_progress", cycleId: 7, sort: "priority_desc",
    }, "/api/v1/work-items?item_type=bug&q=crash&status=in_progress&priority=P1&assignee_username=alice&project_key=DEMO&cycle_id=7&sort=priority_desc&page=3&per_page=50"],
    ["workitem.detail", { itemKey: "DEMO-1" }, "/api/v1/work-items/DEMO-1"],
    ["workitem.detailview", { itemKey: "DEMO-1" }, "/api/v1/work-item-detail-view/DEMO-1"],
    ["workitem.comments", { itemKey: "DEMO-1" }, "/api/v1/work-items/DEMO-1/comments"],
    ["workitem.attachments", { itemKey: "DEMO-1" }, "/api/v1/work-items/DEMO-1/attachments"],
    ["workitem.attachmentpreview", { itemKey: "DEMO-1", attachmentId: 3 }, "/api/v1/work-items/DEMO-1/attachments/3/preview"],
    ["workitem.commentattachments", { itemKey: "DEMO-1", commentId: 7 }, "/api/v1/work-items/DEMO-1/comments/7/attachments"],
    ["workitem.commentattachmentpreview", { itemKey: "DEMO-1", commentId: 7, attachmentId: 3 }, "/api/v1/work-items/DEMO-1/comments/7/attachments/3/preview"],
  ];
  for (const [name, input, path] of cases) {
    const operation = registry.resolve(name, input);
    assert.deepEqual({ idempotent: operation.idempotent, method: operation.method, path: operation.path }, {
      idempotent: true, method: "GET", path,
    });
  }
  assert.equal(registry.resolve("workitem.comments", { itemKey: "DEMO-1" }).dataKind, "array");
  assert.equal(registry.resolve("project.members", { projectKey: "DEMO" }).dataKind, "array");
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
    ["workitem.list", { cycleId: 0 }],
    ["workitem.list", { sort: "random" }],
    ["workitem.listview", { sort: "random" }],
    ["workitem.detail", { itemKey: "bad/key" }],
    ["workitem.detailview", { itemKey: "bad/key" }],
    ["workitem.restore", { itemKey: "bad/key" }],
    ["workitem.comments", { itemKey: "A" }],
    ["workitem.commentattachments", { itemKey: "DEMO-1", commentId: -1 }],
    ["workitem.commentattachmentpreview", { itemKey: "DEMO-1", commentId: 7, attachmentId: 0 }],
  ]) assert.throws(() => registry.resolve(name, input), /invalid/i, `${name} should reject invalid input`);
  assert.throws(
    () => registry.resolve("workitem.commentattachmentpreview", { itemKey: "DEMO-1", commentId: 7, attachmentId: 3, url: "https://evil.example" }),
    /unknown fields/i,
  );
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

  const listView = registry.resolve("workitem.listview", { itemType: "bug" }).parse({
    items: page.items,
    pagination: page.pagination,
    summary: { total_items: 1, active_items: 1, high_priority_items: 1, private_count: 99 },
    filters: { item_type: "bug", q: "", status: "", priority: "", project_key: "DEMO", assignee_username: "", cycle_id: "", sort: "updated_desc", token: "leak" },
    assignees: [{ username: "alice", display_name: "Alice", email: "private@example.com" }],
    cycles: [{ id: 7, name: "Sprint 1", is_closed: false, internal_note: "leak" }],
    parent_options: [{ key: "DEMO-REQ-1", title: "Requirement", project_id: 9 }],
    saved_views: [{ id: 3, name: "Active", filters: { item_type: "bug", q: "", status: "open", priority: "", project_key: "DEMO", assignee_username: "", cycle_id: "7", sort: "updated_desc" }, per_page: 20, is_default: true, owner_id: 9 }],
    can_manage_work_items: true,
    internal_path: "/tmp/private",
  });
  assert.equal(Object.isFrozen(listView.saved_views), true);
  assert.equal(Object.isFrozen(listView.saved_views[0].filters), true);
  assert.equal("email" in listView.assignees[0], false);
  assert.equal("internal_note" in listView.cycles[0], false);
  assert.equal("project_id" in listView.parent_options[0], false);
  assert.equal("owner_id" in listView.saved_views[0], false);
  assert.equal("internal_path" in listView, false);
  const batchResult = registry.resolve("workitem.batchupdate", { projectKey: "DEMO", itemType: "task", itemKeys: ["DEMO-1", "DEMO-2"], action: "priority", status: "", assigneeUsername: "", priority: "P1", cycleId: null }).parse({
    updated_count: 1, updated_item_keys: ["DEMO-1"], failed_count: 1,
    failed_items: [{ item_key: "DEMO-2", code: "conflict", message: "State changed", private_trace: "leak" }],
    internal_request: "leak",
  });
  assert.equal(Object.isFrozen(batchResult), true);
  assert.equal(Object.isFrozen(batchResult.failed_items[0]), true);
  assert.equal("private_trace" in batchResult.failed_items[0], false);
  assert.equal("internal_request" in batchResult, false);
  const detailView = registry.resolve("workitem.detailview", { itemKey: "DEMO-1" }).parse({
    item: {
      key: "DEMO-1", item_type: "task", title: "Task", description: "Body", status: "in_progress", priority: "P1",
      project_key: "DEMO", project_name: "Demo", parent_item_key: "DEMO-REQ-1", parent_title: "Requirement",
      assignee_username: "alice", assignee: "Alice", reporter: "Bob", due_date: "", created_at: "2026-08-07", updated_at: "2026-08-07", deleted_at: "",
    },
    primary_post: null,
    cycle: { value: "7", label: "Sprint 1" },
    assignees: [{ value: "alice", label: "Alice" }],
    parent_options: [{ key: "DEMO-REQ-1", title: "Requirement" }],
    status_options: [{ value: "in_progress", label: "进行中" }],
    permissions: { can_manage_work_items: true, can_edit_primary_post: false, can_close_work_item: true, can_reopen_work_item: false, can_restore_work_item: false },
    navigation: { previous: null, next: { item_key: "DEMO-2", title: "Next" } },
    flow_history: { items: [{ source_kind: "flow", actor: "Alice", created_at: "2026-08-07", summary: "状态：待处理 → 进行中" }], pagination: { page: 1, per_page: 10, total_items: 1, total_pages: 1 } },
  });
  assert.equal(Object.isFrozen(detailView), true);
  assert.equal(Object.isFrozen(detailView.permissions), true);
  assert.equal(detailView.navigation.next.item_key, "DEMO-2");
  assert.throws(() => registry.resolve("workitem.detailview", { itemKey: "DEMO-1" }).parse({ ...detailView, private_token: "leak" }), /fields|invalid/i);

  const search = registry.resolve("search.list", { q: "crash" }).parse({
    items: [{ kind: "bug", key: "DEMO-1", title: "Crash", context: "Details", target: "/web/work-items/DEMO-1", updated_at: "2026-08-07T00:00:00Z", signed_url: "https://evil.example" }],
    pagination: { page: 1, per_page: 10, total_items: 1, total_pages: 1 },
  });
  assert.deepEqual(search.items[0], { kind: "bug", key: "DEMO-1", title: "Crash", context: "Details", target: "/web/work-items/DEMO-1", updated_at: "2026-08-07T00:00:00Z" });

  const analysis = registry.resolve("project.personalanalysis", { projectKey: "DEMO" }).parse({
    username: "alice", display_name: "Alice", joined_at: "2026-08-01T00:00:00Z",
    completed_total: 4, completed_requirements: 1, completed_tasks: 2, completed_bugs: 1,
    completed_last_30_days: 3, pending: { requirements: 2, tasks: 3, bugs: 1 },
    daily_average: 0.5, daily_peak: 2, daily_peak_date: "2026-08-06",
    monthly_average: 2, monthly_peak: 4, monthly_peak_month: "2026-08",
    active_days: 5, comment_count: 8, handoff_count: 2,
    recent_completions: [{ key: "DEMO-4", item_type: "task", title: "Ship", completed_at: "2026-08-07T00:00:00Z" }],
    access_token: "leak",
  });
  assert.equal(Object.isFrozen(analysis), true);
  assert.equal(Object.isFrozen(analysis.pending), true);
  assert.equal(Object.isFrozen(analysis.recent_completions), true);
  assert.equal("access_token" in analysis, false);

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
  const resourcePreview = registry.resolve("project.resourceattachmentpreview", { projectKey: "DEMO", resourceId: 9, attachmentId: 3, accessToken: "grant" }).parse({
    attachment: { id: 3, filename: "report.txt", content_type: "text/plain", byte_size: 12, status: "uploaded", created_by: "Alice", created_at: "2026-08-03T00:00:00Z" },
    preview: { kind: "document", strategy: "text", file_type: "txt", kind_label: "文本", is_experimental: false, legacy_preview_enabled: false, content_enabled: true },
    navigation: { position: 1, total: 2, previous: null, next: { id: 4, title: "next.txt", url: "/api/v1/projects/DEMO/resources/9/attachments/4/preview?access=private-grant" } },
    content_url: "/api/v1/projects/DEMO/resources/9/attachments/3/preview/content?access=private-grant",
    download_url: "/api/v1/projects/DEMO/resources/9/attachments/3/download-url?access=private-grant",
  });
  assert.deepEqual(resourcePreview.navigation.next, { id: 4, title: "next.txt" });
  assert.equal(JSON.stringify(resourcePreview.navigation).includes("private-grant"), false);
  const workItemPreview = registry.resolve("workitem.attachmentpreview", { itemKey: "DEMO-1", attachmentId: 3 }).parse({
    attachment: { id: 3, filename: "report.txt", content_type: "text/plain", byte_size: 12, status: "uploaded", created_by: "Alice", created_at: "2026-08-03T00:00:00Z" },
    preview: { kind: "document", strategy: "text", file_type: "txt", kind_label: "文本", is_experimental: false, legacy_preview_enabled: false, content_enabled: true },
    navigation: { position: 1, total: 1, previous: null, next: null },
    content_url: "/api/v1/work-items/DEMO-1/attachments/3/preview/content",
    download_url: "/api/v1/work-items/DEMO-1/attachments/3/download-url",
  });
  assert.equal(workItemPreview.attachment.id, 3);
  assert.equal(workItemPreview.content_url, "/api/v1/work-items/DEMO-1/attachments/3/preview/content");
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
  assert.throws(() => registry.resolve("workitem.detailview", { itemKey: "DEMO-1" }).parse({}), /invalid/i);
  assert.throws(() => registry.resolve("workitem.comments", { itemKey: "DEMO-1" }).parse("not-an-array"), /invalid/i);
  assert.throws(() => registry.resolve("workitem.batchupdate", { projectKey: "DEMO", itemType: "task", itemKeys: ["DEMO-1"], action: "priority", status: "", assigneeUsername: "", priority: "P1", cycleId: null }).parse({ updated_count: 2, updated_item_keys: ["DEMO-1"], failed_count: 0, failed_items: [] }), /invalid/i);
  assert.throws(() => registry.resolve("notification.list", {}).parse({
    items: Array.from({ length: 101 }, () => ({})), unread_count: 0, pending_count: 0,
    filter: "all", page: 1, per_page: 20, total_items: 101, total_pages: 6,
  }), /invalid/i);
  const validAnalysis = {
    username: "alice", display_name: "Alice", joined_at: "2026-08-01T00:00:00Z",
    completed_total: 0, completed_requirements: 0, completed_tasks: 0, completed_bugs: 0,
    completed_last_30_days: 0, pending: { requirements: 0, tasks: 0, bugs: 0 },
    daily_average: 0, daily_peak: 0, daily_peak_date: "",
    monthly_average: 0, monthly_peak: 0, monthly_peak_month: "",
    active_days: 0, comment_count: 0, handoff_count: 0, recent_completions: [],
  };
  const analysisParser = registry.resolve("project.personalanalysis", { projectKey: "DEMO" }).parse;
  for (const payload of [
    { ...validAnalysis, daily_average: Number.NaN },
    { ...validAnalysis, daily_average: -1 },
    { ...validAnalysis, pending: { requirements: 0, tasks: 0 } },
    { ...validAnalysis, recent_completions: Array.from({ length: 9 }, () => ({ key: "DEMO-1", item_type: "task", title: "Done", completed_at: "2026-08-07T00:00:00Z" })) },
  ]) assert.throws(() => analysisParser(payload), /invalid/i);
});

test("project resources accept the complete unpaginated server response", () => {
  const registry = createOperationRegistry();
  const resource = {
    id: 1, project_key: "DEMO", title: "Resource", category: "development", body: "", body_format: "markdown",
    summary: "", status: "active", is_protected: false, tags: [], related_work_item: null, related_cycle: null,
    created_by: "Alice", updated_by: "Alice", created_at: "2026-08-07T00:00:00Z", updated_at: "2026-08-07T00:00:00Z",
    url: "/web/projects/DEMO/resources/1",
  };
  const payload = Array.from({ length: 501 }, (_, index) => ({ ...resource, id: index + 1, url: `/web/projects/DEMO/resources/${index + 1}` }));
  const resources = registry.resolve("project.resources", { projectKey: "DEMO" }).parse(payload);
  assert.equal(resources.length, 501);
  assert.equal(resources[500].id, 501);
  assert.equal(Object.isFrozen(resources), true);
});

test("builds non-idempotent mutation descriptors from bounded domain payloads", () => {
  const registry = createOperationRegistry();
  const cases = [
    ["identity.profileupdate", { displayName: "Alice", email: "alice@example.com", mobile: "13800000000" }, "PATCH", "/api/v1/me/profile", { display_name: "Alice", email: "alice@example.com", mobile: "13800000000" }],
    ["identity.passwordupdate", { currentPassword: "OldPass2026!", newPassword: "NewPass2026!", newPasswordConfirm: "NewPass2026!" }, "PATCH", "/api/v1/me/password", { current_password: "OldPass2026!", new_password: "NewPass2026!", new_password_confirm: "NewPass2026!" }],
    ["identity.tokencreate", { name: "Agent", scopes: ["project:read"], projectScope: "all", expiresAt: "" }, "POST", "/api/v1/me/tokens", { name: "Agent", scopes: ["project:read"], project_scope: "all", expires_at: "" }],
    ["identity.tokenupdate", { tokenId: 7, name: "Agent 2", scopes: ["work_item:read"], projectScope: "projects:DEMO" }, "PATCH", "/api/v1/me/tokens/7", { name: "Agent 2", scopes: ["work_item:read"], project_scope: "projects:DEMO" }],
    ["identity.tokendelete", { tokenId: 7 }, "DELETE", "/api/v1/me/tokens/7", undefined],
    ["identity.devicesessionrevoke", { familyId: "family-1" }, "DELETE", "/api/v1/me/device-sessions/family-1", undefined],
    ["project.create", { name: "New project", description: "Description", status: "not_started", startDate: "2026-08-08", dueDate: "2026-08-31" }, "POST", "/api/v1/projects", { name: "New project", description: "Description", status: "not_started", start_date: "2026-08-08", due_date: "2026-08-31" }],
    ["project.update", { projectKey: "DEMO", name: "Updated", ownerUsername: "alice", status: "in_progress" }, "PATCH", "/api/v1/projects/DEMO", { name: "Updated", owner_username: "alice", status: "in_progress" }],
    ["project.memberadd", { projectKey: "DEMO", username: "bob", memberRole: "member" }, "POST", "/api/v1/projects/DEMO/members", { username: "bob", member_role: "member" }],
    ["project.memberroleupdate", { projectKey: "DEMO", username: "bob", memberRole: "maintainer" }, "PATCH", "/api/v1/projects/DEMO/members/bob", { member_role: "maintainer" }],
    ["project.memberremove", { projectKey: "DEMO", username: "bob" }, "DELETE", "/api/v1/projects/DEMO/members/bob", undefined],
    ["project.cyclecreate", { projectKey: "DEMO", name: "Sprint", goal: "Ship", description: "Cycle", ownerUsername: "alice", startDate: "2026-08-01", endDate: "2026-08-31" }, "POST", "/api/v1/projects/DEMO/cycles", { name: "Sprint", goal: "Ship", description: "Cycle", owner_username: "alice", start_date: "2026-08-01", end_date: "2026-08-31" }],
    ["project.cycleupdate", { projectKey: "DEMO", cycleId: 7, name: "Sprint", goal: "Ship", description: "Cycle", ownerUsername: "", startDate: "2026-08-01", endDate: "2026-08-31" }, "PATCH", "/api/v1/projects/DEMO/cycles/7", { name: "Sprint", goal: "Ship", description: "Cycle", owner_username: "", start_date: "2026-08-01", end_date: "2026-08-31" }],
    ["project.cycleclose", { projectKey: "DEMO", cycleId: 7 }, "POST", "/api/v1/projects/DEMO/cycles/7/close", undefined],
    ["project.resourcecreate", { projectKey: "DEMO", title: "Runbook", category: "other", body: "Body", bodyFormat: "plain", accessPassword: "", tags: ["ops"], relatedWorkItemKey: "", relatedCycleId: null }, "POST", "/api/v1/projects/DEMO/resources", { title: "Runbook", category: "other", body: "Body", body_format: "plain", access_password: "", tags: ["ops"], related_work_item_key: "", related_cycle_id: null }],
    ["project.resourceupdate", { projectKey: "DEMO", resourceId: 9, title: "Runbook 2", category: "integration", body: "Updated", bodyFormat: "plain", accessPasswordAction: "set", accessPassword: "safe-pass", tags: [], relatedWorkItemKey: "DEMO-1", relatedCycleId: 7 }, "PATCH", "/api/v1/projects/DEMO/resources/9", { title: "Runbook 2", category: "integration", body: "Updated", body_format: "plain", access_password_action: "set", access_password: "safe-pass", tags: [], related_work_item_key: "DEMO-1", related_cycle_id: 7 }],
    ["project.resourcearchive", { projectKey: "DEMO", resourceId: 9 }, "DELETE", "/api/v1/projects/DEMO/resources/9", undefined],
    ["project.resourcepasswordreset", { projectKey: "DEMO", resourceId: 9, accessPasswordAction: "set", accessPassword: "safe-pass" }, "POST", "/api/v1/projects/DEMO/resources/9/password/reset", { access_password_action: "set", access_password: "safe-pass" }],
    ["project.resourceattachmentdelete", { projectKey: "DEMO", resourceId: 9, attachmentId: 11 }, "DELETE", "/api/v1/projects/DEMO/resources/9/attachments/11", undefined],
    ["project.select", { projectKey: "DEMO" }, "PATCH", "/api/v1/current-project", { project_key: "DEMO" }],
    ["notification.read", { notificationId: 7 }, "POST", "/api/v1/notifications/7/read", undefined],
    ["notification.readall", {}, "POST", "/api/v1/notifications/read-all", undefined],
    ["workitem.create", { projectKey: "DEMO", itemType: "task", title: "Implement", description: "Body", priority: "P1", assigneeUsername: "alice", cycleId: 7, dueDate: "2026-08-31", parentItemKey: "DEMO-REQ-1" }, "POST", "/api/v1/work-items", { project_key: "DEMO", item_type: "task", title: "Implement", description: "Body", priority: "P1", assignee_username: "alice", cycle_id: 7, due_date: "2026-08-31", parent_item_key: "DEMO-REQ-1" }],
    ["workitem.batchupdate", { projectKey: "DEMO", itemType: "task", itemKeys: ["DEMO-1", "DEMO-2"], action: "priority", status: "", assigneeUsername: "", priority: "P1", cycleId: null }, "POST", "/api/v1/work-items/batch", { project_key: "DEMO", item_type: "task", item_keys: ["DEMO-1", "DEMO-2"], action: "priority", status: "", assignee_username: "", priority: "P1", cycle_id: null }],
    ["workitem.savedviewcreate", { projectKey: "DEMO", itemType: "task", name: "Focus", q: "", status: "open", priority: "P1", assigneeUsername: "alice", cycleId: "7", sort: "updated_desc", perPage: 20, isDefault: true }, "POST", "/api/v1/work-item-saved-views", { project_key: "DEMO", item_type: "task", name: "Focus", q: "", status: "open", priority: "P1", assignee_username: "alice", cycle_id: "7", sort: "updated_desc", per_page: 20, is_default: true }],
    ["workitem.savedviewrename", { savedViewId: 7, name: "Focus 2" }, "PATCH", "/api/v1/work-item-saved-views/7", { name: "Focus 2" }],
    ["workitem.savedviewdefault", { savedViewId: 7 }, "POST", "/api/v1/work-item-saved-views/7/default", undefined],
    ["workitem.savedviewdelete", { savedViewId: 7 }, "DELETE", "/api/v1/work-item-saved-views/7", undefined],
    ["workitem.update", { itemKey: "DEMO-1", payload: { title: "Updated", description: "Body", status: "in_progress", priority: "P1", assigneeUsername: "alice", dueDate: "2026-08-31", parentItemKey: "" } }, "PATCH", "/api/v1/work-items/DEMO-1", { title: "Updated", description: "Body", status: "in_progress", priority: "P1", assignee_username: "alice", due_date: "2026-08-31", parent_item_key: "" }],
    ["workitem.primarypostupdate", { itemKey: "DEMO-1", payload: { body: "<p>Updated</p>", bodyFormat: "html" } }, "PATCH", "/api/v1/work-items/DEMO-1/primary-post", { body: "<p>Updated</p>", body_format: "html" }],
    ["workitem.handoff", { itemKey: "DEMO-1", payload: { status: "in_progress", assigneeUsername: "alice", body: "Continue", sourceCommentId: null } }, "POST", "/api/v1/work-items/DEMO-1/handoff", { status: "in_progress", assignee_username: "alice", body: "Continue", source_comment_id: null }],
    ["workitem.restore", { itemKey: "DEMO-1" }, "POST", "/api/v1/work-items/DEMO-1/restore", undefined],
    ["workitem.commentcreate", { itemKey: "DEMO-1", payload: { body: "Comment", bodyFormat: "plain" } }, "POST", "/api/v1/work-items/DEMO-1/comments", { body: "Comment", body_format: "plain" }],
    ["workitem.commentdraftcreate", { itemKey: "DEMO-1", payload: { body: "", bodyFormat: "html" } }, "POST", "/api/v1/work-items/DEMO-1/comments/draft", { body: "", body_format: "html" }],
    ["workitem.commentdraftpublish", { itemKey: "DEMO-1", commentId: 9, payload: { body: "<p>Comment</p>", bodyFormat: "html" } }, "POST", "/api/v1/work-items/DEMO-1/comments/9/publish", { body: "<p>Comment</p>", body_format: "html" }],
    ["workitem.commentdraftcancel", { itemKey: "DEMO-1", commentId: 9 }, "DELETE", "/api/v1/work-items/DEMO-1/comments/9/draft", undefined],
    ["workitem.commentupdate", { itemKey: "DEMO-1", commentId: 9, payload: { body: "Edited", bodyFormat: "plain", parentCommentId: null } }, "PATCH", "/api/v1/work-items/DEMO-1/comments/9", { body: "Edited", body_format: "plain", parent_comment_id: null }],
    ["workitem.commentattachmentdelete", { itemKey: "DEMO-1", commentId: 9, attachmentId: 7 }, "DELETE", "/api/v1/work-items/DEMO-1/comments/9/attachments/7", undefined],
    ["workitem.primarypostattachmentdelete", { itemKey: "DEMO-1", commentId: 9, attachmentId: 7 }, "DELETE", "/api/v1/work-items/DEMO-1/comments/9/attachments/7", undefined],
  ];
  for (const [name, input, method, path, body] of cases) {
    const operation = registry.resolve(name, input);
    assert.equal(operation.idempotent, false);
    assert.equal(operation.method, method);
    assert.equal(operation.path, path);
    assert.deepEqual(operation.body === undefined ? undefined : JSON.parse(operation.body), body);
    assert.equal(operation.body === undefined ? operation.contentType : operation.contentType, body === undefined ? undefined : "application/json");
  }
  assert.equal(registry.resolve("project.memberremove", { projectKey: "DEMO", username: "bob" }).allowNoContent, true);
  assert.equal(registry.resolve("workitem.savedviewdelete", { savedViewId: 7 }).allowNoContent, true);
  assert.equal(registry.resolve("workitem.commentattachmentdelete", { itemKey: "DEMO-1", commentId: 9, attachmentId: 7 }).editorContext, "work-item-comment-edit");
  assert.equal(registry.resolve("workitem.primarypostattachmentdelete", { itemKey: "DEMO-1", commentId: 9, attachmentId: 7 }).editorContext, "work-item-primary-post");
});

test("rejects invalid mutation fields before a descriptor is created", () => {
  const registry = createOperationRegistry();
  for (const [name, input] of [
    ["project.select", { projectKey: "demo" }],
    ["project.create", { name: "Project", description: "", status: "all", startDate: "", dueDate: "" }],
    ["project.create", { name: "Project", description: "", status: "not_started", startDate: "2026-09-01", dueDate: "2026-08-01" }],
    ["project.update", { projectKey: "demo", name: "Project" }],
    ["project.update", { projectKey: "DEMO" }],
    ["project.memberadd", { projectKey: "DEMO", username: "bad/name", memberRole: "member" }],
    ["project.memberroleupdate", { projectKey: "DEMO", username: "bob", memberRole: "owner" }],
    ["project.cyclecreate", { projectKey: "DEMO", name: "Sprint", goal: "", description: "", ownerUsername: "", startDate: "2026-09-01", endDate: "2026-08-01" }],
    ["project.cycledetail", { projectKey: "DEMO", cycleId: 0 }],
    ["project.resourcecreate", { projectKey: "DEMO", title: "Runbook", category: "other", body: "", bodyFormat: "plain", accessPassword: "x", tags: [], relatedWorkItemKey: "", relatedCycleId: null }],
    ["project.resourceupdate", { projectKey: "DEMO", resourceId: 9, title: "Runbook", category: "other", body: "", bodyFormat: "plain", accessPasswordAction: "keep", accessPassword: "leak", tags: [], relatedWorkItemKey: "", relatedCycleId: null }],
    ["project.resourcepasswordreset", { projectKey: "DEMO", resourceId: 9, accessPasswordAction: "keep", accessPassword: "" }],
    ["project.resourcepasswordreset", { projectKey: "DEMO", resourceId: 9, accessPasswordAction: "set", accessPassword: "x" }],
    ["project.resourcepasswordreset", { projectKey: "DEMO", resourceId: 9, accessPasswordAction: "clear", accessPassword: "leak" }],
    ["workitem.primarypostupdate", { itemKey: "DEMO-1", payload: { body: "<p>x</p>", bodyFormat: "plain" } }],
    ["workitem.primarypostupdate", { itemKey: "DEMO-1", payload: { body: "x".repeat(20_001), bodyFormat: "html" } }],
    ["identity.profileupdate", { displayName: " ", email: "", mobile: "" }],
    ["notification.read", { notificationId: 0 }],
    ["workitem.create", { projectKey: "demo", itemType: "task", title: "Implement", description: "", priority: "P2", assigneeUsername: "", cycleId: null, dueDate: "", parentItemKey: "" }],
    ["workitem.create", { projectKey: "DEMO", itemType: "incident", title: "Implement", description: "", priority: "P2", assigneeUsername: "", cycleId: null, dueDate: "", parentItemKey: "" }],
    ["workitem.create", { projectKey: "DEMO", itemType: "task", title: " ", description: "", priority: "P2", assigneeUsername: "", cycleId: null, dueDate: "", parentItemKey: "" }],
    ["workitem.batchupdate", { projectKey: "DEMO", itemType: "task", itemKeys: [], action: "priority", status: "", assigneeUsername: "", priority: "P1", cycleId: null }],
    ["workitem.batchupdate", { projectKey: "DEMO", itemType: "task", itemKeys: ["DEMO-1", "DEMO-1"], action: "priority", status: "", assigneeUsername: "", priority: "P1", cycleId: null }],
    ["workitem.batchupdate", { projectKey: "DEMO", itemType: "task", itemKeys: ["DEMO-1"], action: "priority", status: "open", assigneeUsername: "", priority: "P1", cycleId: null }],
    ["workitem.savedviewcreate", { projectKey: "demo", itemType: "task", name: "Focus", q: "", status: "", priority: "", assigneeUsername: "", cycleId: "", sort: "", perPage: 20, isDefault: false }],
    ["workitem.savedviewcreate", { projectKey: "DEMO", itemType: "incident", name: "Focus", q: "", status: "", priority: "", assigneeUsername: "", cycleId: "", sort: "", perPage: 20, isDefault: false }],
    ["workitem.savedviewcreate", { projectKey: "DEMO", itemType: "task", name: " ", q: "", status: "", priority: "", assigneeUsername: "", cycleId: "", sort: "", perPage: 20, isDefault: false }],
    ["workitem.savedviewrename", { savedViewId: 0, name: "Focus" }],
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
    ["workitem.commentdraftcreate", { itemKey: "DEMO-1", payload: { body: "", bodyFormat: "plain" } }],
    ["workitem.commentdraftpublish", { itemKey: "DEMO-1", commentId: 9, payload: { body: "", bodyFormat: "html" } }],
    ["workitem.commentdraftcancel", { itemKey: "DEMO-1", commentId: 0 }],
    ["workitem.commentattachmentdelete", { itemKey: "DEMO-1", commentId: 9, attachmentId: 7, headers: {} }],
    ["workitem.primarypostattachmentdelete", { itemKey: "DEMO-1", commentId: 9, attachmentId: 7, editorContext: "forged" }],
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

test("normalizes account security DTOs without accepting private fields", () => {
  const registry = createOperationRegistry();
  const tokens = registry.resolve("identity.tokens", {}).parse([{
    id: 7, name: "Agent", scopes: ["project:read"], project_scope: "all", token_suffix: "abcd",
    expires_at: "", revoked_at: "", last_used_at: "", created_at: "2026-08-07T00:00:00Z", updated_at: "2026-08-07T00:00:00Z",
  }]);
  assert.equal(tokens[0].name, "Agent");
  assert.equal(Object.hasOwn(tokens[0], "raw_token"), false);
  const stripped = registry.resolve("identity.tokens", {}).parse([{ ...tokens[0], raw_token: "secret" }]);
  assert.equal(Object.hasOwn(stripped[0], "raw_token"), false);
  const sessions = registry.resolve("identity.devicesessions", {}).parse([{
    family_id: "family-1", device_id: "device-1", device_name: "Desktop", platform: "darwin",
    client_version: "0.1.0", status: "active", generation: 1, last_seen_at: "2026-08-07T00:00:00Z",
    created_at: "2026-08-07T00:00:00Z", is_current: true,
  }]);
  assert.equal(sessions[0].is_current, true);
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
