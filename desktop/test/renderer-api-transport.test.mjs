import assert from "node:assert/strict";
import test from "node:test";

import { ApiError, createApiClient } from "@yuance/frontend-api-client";
import { createDesktopApiTransport } from "../src/renderer/platform/api-transport.js";

const resourceFixture = { id: 9, project_key: "DEMO", title: "Release", category: "development", body: "Body", body_format: "markdown", summary: "Summary", status: "active", is_protected: false, tags: [], related_work_item: null, related_cycle: null, created_by: "Alice", updated_by: "Alice", created_at: "2026-08-07T00:00:00Z", updated_at: "2026-08-07T00:00:00Z", url: "/web/projects/DEMO/resources/9" };
const attachmentFixture = { id: 8, filename: "resource.txt", content_type: "text/plain", byte_size: 12, status: "deleted", created_by: "Alice", created_at: "2026-08-07T00:00:00Z" };

test("desktop API transport maps only known read routes to domain operations", async () => {
  const calls = [];
  const transport = createDesktopApiTransport({ execute: async (operation, input) => {
    calls.push([operation, input]);
    return { ok: true, data: { operation } };
  } });
  /** @type {Array<[string, string, Record<string, unknown>]>} */
  const cases = [
    ["/api/v1/auth/me", "identity.current", {}],
    ["/api/v1/me/profile", "identity.profile", {}],
    ["/api/v1/topbar/status", "shell.topbar", {}],
    ["/api/v1/current-project", "project.current", {}],
    ["/api/v1/projects?status=in_progress&page=2&per_page=25", "project.list", { status: "in_progress", page: 2, perPage: 25 }],
    ["/api/v1/projects/DEMO", "project.detail", { projectKey: "DEMO" }],
    ["/api/v1/projects/DEMO/members", "project.members", { projectKey: "DEMO" }],
    ["/api/v1/projects/DEMO/cycles", "project.cycles", { projectKey: "DEMO" }],
    ["/api/v1/projects/DEMO/cycles/7", "project.cycledetail", { projectKey: "DEMO", cycleId: 7 }],
    ["/api/v1/projects/DEMO/my-analysis", "project.personalanalysis", { projectKey: "DEMO" }],
    ["/api/v1/projects/DEMO/attachments", "project.attachments", { projectKey: "DEMO" }],
    ["/api/v1/projects/DEMO/resources?q=release&category=development&related_cycle_id=7", "project.resources", { projectKey: "DEMO", q: "release", category: "development", relatedCycleId: "7" }],
    ["/api/v1/projects/DEMO/resources/9", "project.resourcedetail", { projectKey: "DEMO", resourceId: 9 }],
    ["/api/v1/projects/DEMO/resources/9/attachments?access=grant-token", "project.resourceattachments", { projectKey: "DEMO", resourceId: 9, accessToken: "grant-token" }],
    ["/api/v1/search?q=crash&page=2&per_page=20", "search.list", { q: "crash", page: 2, perPage: 20 }],
    ["/api/v1/notifications?filter=unread&limit=10", "notification.list", { filter: "unread", limit: 10 }],
    ["/api/v1/notifications/7/target", "notification.target", { notificationId: 7 }],
    ["/api/v1/work-items?item_type=bug&q=crash&priority=P1&project_key=DEMO&cycle_id=7&sort=priority_desc", "workitem.list", { itemType: "bug", q: "crash", priority: "P1", projectKey: "DEMO", cycleId: 7, sort: "priority_desc" }],
    ["/api/v1/work-item-list-view?item_type=bug&project_key=DEMO&page=2", "workitem.listview", { itemType: "bug", projectKey: "DEMO", page: 2 }],
    ["/api/v1/work-items/DEMO-1", "workitem.detail", { itemKey: "DEMO-1" }],
    ["/api/v1/work-items/DEMO-1/comments", "workitem.comments", { itemKey: "DEMO-1" }],
    ["/api/v1/work-items/DEMO-1/attachments", "workitem.attachments", { itemKey: "DEMO-1" }],
    ["/api/v1/work-items/DEMO-1/comments/9/attachments", "workitem.commentattachments", { itemKey: "DEMO-1", commentId: 9 }],
  ];
  for (const [url, operation] of cases) assert.deepEqual(await transport.request(url), { operation });
  assert.deepEqual(calls, cases.map(([, operation, input]) => [operation, input]));
});

test("desktop API transport rejects request primitives and ambiguous routes before IPC", async () => {
  let calls = 0;
  const transport = createDesktopApiTransport({ execute: async () => { calls += 1; return { ok: true, data: {} }; } });
  /** @type {Array<[string, ({ method?: string, headers?: Record<string, string>, body?: string } | undefined)?]>} */
  const rejected = [
    ["https://evil.example/api/v1/auth/me"],
    ["//evil.example/api/v1/auth/me"],
    ["/api/v1/auth/me#secret"],
    ["/api/v1/auth/me?url=https://evil.example"],
    ["/api/v1/projects?page=1&page=2"],
    ["/api/v1/work-items/DEMO-1?token=secret"],
    ["/api/v1/work-items/DEMO%2f1"],
    ["/api/v1/work-items/DEMO-1", { method: "PATCH" }],
    ["/api/v1/work-items/DEMO-1", { method: "GET", headers: { Authorization: "Bearer forged" } }],
    ["/api/v1/work-items/DEMO-1", { method: "GET", body: "{}" }],
  ];
  for (const [url, options] of rejected) await assert.rejects(transport.request(url, options), ApiError);
  assert.equal(calls, 0);
});

test("desktop API transport validates public IPC envelopes", async () => {
  const success = createDesktopApiTransport({ execute: async () => ({ ok: true, data: { id: 7 } }) });
  assert.deepEqual(await success.request("/api/v1/auth/me", { method: "GET" }), { id: 7 });
  const failure = createDesktopApiTransport({ execute: async () => ({ ok: false, error: { code: "project_access_denied", status: 403 } }) });
  await assert.rejects(failure.request("/api/v1/auth/me"), (error) => error instanceof ApiError && error.code === "project_access_denied" && error.status === 403 && !error.message.includes("secret"));
  for (const response of [null, {}, { ok: true, data: {}, token: "secret" }, { ok: false, error: { code: "bad" }, stack: "secret" }]) {
    const invalid = createDesktopApiTransport({ execute: async () => response });
    await assert.rejects(invalid.request("/api/v1/auth/me"), (error) => error instanceof ApiError && error.code === "invalid_response");
  }
  await assert.rejects(createDesktopApiTransport().request("/api/v1/auth/me"), (error) => error instanceof ApiError && error.code === "business_unavailable");
});

test("api-client mutations map to fixed domain operations without request primitives", async () => {
  const calls = [];
  const transport = createDesktopApiTransport({ execute: async (operation, input) => {
    calls.push([operation, input]);
    return { ok: true, data: operation === "notification.readall" ? { affected: 1 } : ["project.resources"].includes(operation) ? [resourceFixture] : operation === "project.resourceattachments" ? [] : ["project.resourcedetail", "project.resourceunlock", "project.resourcecreate", "project.resourceupdate", "project.resourcearchive", "project.resourcepasswordreset"].includes(operation) ? resourceFixture : operation === "project.resourceattachmentdelete" ? attachmentFixture : {} };
  } });
  const client = createApiClient({ request: transport.request });
  await client.updateOwnProfile({ displayName: "Alice", email: "alice@example.com", mobile: "13800000000" });
  await client.createProject({ name: "New project", description: "Description", status: "not_started", startDate: "2026-08-08", dueDate: "2026-08-31" });
  await client.getProject("DEMO");
  await client.getProjectMembers("DEMO");
  await client.updateProject("DEMO", { name: "Updated", ownerUsername: "alice" });
  await client.addProjectMember("DEMO", { username: "bob", memberRole: "member" });
  await client.updateProjectMemberRole("DEMO", "bob", "maintainer");
  await client.removeProjectMember("DEMO", "bob");
  const cycle = { name: "Sprint", goal: "Ship", description: "Cycle", ownerUsername: "alice", startDate: "2026-08-01", endDate: "2026-08-31" };
  await client.getProjectCycles("DEMO"); await client.getProjectCycle("DEMO", 7); await client.createProjectCycle("DEMO", cycle); await client.updateProjectCycle("DEMO", 7, cycle); await client.closeProjectCycle("DEMO", 7);
  await client.getProjectPersonalAnalysis("DEMO");
  await client.getProjectAttachments("DEMO"); await client.archiveProjectAttachment("DEMO", 8);
  await client.getProjectResources("DEMO", { q: "release" }); await client.getProjectResource("DEMO", 9); await client.unlockProjectResource("DEMO", 9, "vault-pass");
  const resourcePayload = { title: "Runbook", category: "other", body: "Body", bodyFormat: "plain", accessPassword: "", tags: ["ops"], relatedWorkItemKey: "", relatedCycleId: null };
  await client.createProjectResource("DEMO", resourcePayload); await client.updateProjectResource("DEMO", 9, { ...resourcePayload, accessPasswordAction: "keep" }); await client.archiveProjectResource("DEMO", 9); await client.resetProjectResourcePassword("DEMO", 9, { accessPasswordAction: "clear", accessPassword: "" });
  await client.getProjectResourceAttachments("DEMO", 9, "grant-token"); await client.deleteProjectResourceAttachment("DEMO", 9, 8);
  await client.updateOwnPassword({ currentPassword: "OldPass2026!", newPassword: "NewPass2026!", newPasswordConfirm: "NewPass2026!" });
  await client.createApiToken({ name: "Agent", scopes: ["project:read"], projectScope: "all" });
  await client.updateApiToken(7, { name: "Agent 2", scopes: ["work_item:read"], projectScope: "all" });
  await client.deleteApiToken(7);
  await client.revokeDeviceSession("family-1");
  await client.updateCurrentProject("DEMO");
  await client.markNotificationRead(7);
  await client.markAllNotificationsRead();
  await client.createWorkItem({ projectKey: "DEMO", itemType: "task", title: "Implement", description: "Body", priority: "P1", assigneeUsername: "alice", cycleId: 7, dueDate: "2026-08-31", parentItemKey: "DEMO-REQ-1" });
  await client.batchUpdateWorkItems({ projectKey: "DEMO", itemType: "task", itemKeys: ["DEMO-1", "DEMO-2"], action: "priority", priority: "P1" });
  await client.createWorkItemSavedView({ projectKey: "DEMO", itemType: "task", name: "Focus", status: "open", cycleId: "7", sort: "updated_desc", perPage: 20, isDefault: true });
  await client.renameWorkItemSavedView(7, "Focus 2");
  await client.setDefaultWorkItemSavedView(7);
  await client.deleteWorkItemSavedView(7);
  await client.updateWorkItem("DEMO-1", { title: "Updated", description: "Body", priority: "P1" });
  await client.handoffWorkItem("DEMO-1", { status: "in_progress", assigneeUsername: "alice", body: "Please continue" });
  await client.createWorkItemComment("DEMO-1", { body: "New comment" });
  await client.updateWorkItemComment("DEMO-1", 9, { body: "Edited", parentCommentId: null });
  assert.deepEqual(calls, [
    ["identity.profileupdate", { displayName: "Alice", email: "alice@example.com", mobile: "13800000000" }],
    ["project.create", { name: "New project", description: "Description", status: "not_started", startDate: "2026-08-08", dueDate: "2026-08-31" }],
    ["project.detail", { projectKey: "DEMO" }],
    ["project.members", { projectKey: "DEMO" }],
    ["project.update", { projectKey: "DEMO", name: "Updated", ownerUsername: "alice" }],
    ["project.memberadd", { projectKey: "DEMO", username: "bob", memberRole: "member" }],
    ["project.memberroleupdate", { projectKey: "DEMO", username: "bob", memberRole: "maintainer" }],
    ["project.memberremove", { projectKey: "DEMO", username: "bob" }],
    ["project.cycles", { projectKey: "DEMO" }],
    ["project.cycledetail", { projectKey: "DEMO", cycleId: 7 }],
    ["project.cyclecreate", { projectKey: "DEMO", ...cycle }],
    ["project.cycleupdate", { projectKey: "DEMO", cycleId: 7, ...cycle }],
    ["project.cycleclose", { projectKey: "DEMO", cycleId: 7 }],
    ["project.personalanalysis", { projectKey: "DEMO" }],
    ["project.attachments", { projectKey: "DEMO" }],
    ["project.attachmentarchive", { projectKey: "DEMO", attachmentId: 8 }],
    ["project.resources", { projectKey: "DEMO", q: "release" }],
    ["project.resourcedetail", { projectKey: "DEMO", resourceId: 9 }],
    ["project.resourceunlock", { projectKey: "DEMO", resourceId: 9, accessPassword: "vault-pass" }],
    ["project.resourcecreate", { projectKey: "DEMO", ...resourcePayload }],
    ["project.resourceupdate", { projectKey: "DEMO", resourceId: 9, ...resourcePayload, accessPasswordAction: "keep" }],
    ["project.resourcearchive", { projectKey: "DEMO", resourceId: 9 }],
    ["project.resourcepasswordreset", { projectKey: "DEMO", resourceId: 9, accessPasswordAction: "clear", accessPassword: "" }],
    ["project.resourceattachments", { projectKey: "DEMO", resourceId: 9, accessToken: "grant-token" }],
    ["project.resourceattachmentdelete", { projectKey: "DEMO", resourceId: 9, attachmentId: 8 }],
    ["identity.passwordupdate", { currentPassword: "OldPass2026!", newPassword: "NewPass2026!", newPasswordConfirm: "NewPass2026!" }],
    ["identity.tokencreate", { name: "Agent", scopes: ["project:read"], projectScope: "all", expiresAt: "" }],
    ["identity.tokenupdate", { tokenId: 7, name: "Agent 2", scopes: ["work_item:read"], projectScope: "all" }],
    ["identity.tokendelete", { tokenId: 7 }],
    ["identity.devicesessionrevoke", { familyId: "family-1" }],
    ["project.select", { projectKey: "DEMO" }],
    ["notification.read", { notificationId: 7 }],
    ["notification.readall", {}],
    ["workitem.create", { projectKey: "DEMO", itemType: "task", title: "Implement", description: "Body", priority: "P1", assigneeUsername: "alice", cycleId: 7, dueDate: "2026-08-31", parentItemKey: "DEMO-REQ-1" }],
    ["workitem.batchupdate", { projectKey: "DEMO", itemType: "task", itemKeys: ["DEMO-1", "DEMO-2"], action: "priority", status: "", assigneeUsername: "", priority: "P1", cycleId: null }],
    ["workitem.savedviewcreate", { projectKey: "DEMO", itemType: "task", name: "Focus", q: "", status: "open", priority: "", assigneeUsername: "", cycleId: "7", sort: "updated_desc", perPage: 20, isDefault: true }],
    ["workitem.savedviewrename", { savedViewId: 7, name: "Focus 2" }],
    ["workitem.savedviewdefault", { savedViewId: 7 }],
    ["workitem.savedviewdelete", { savedViewId: 7 }],
    ["workitem.update", { itemKey: "DEMO-1", payload: { title: "Updated", description: "Body", priority: "P1" } }],
    ["workitem.handoff", { itemKey: "DEMO-1", payload: { status: "in_progress", assigneeUsername: "alice", body: "Please continue" } }],
    ["workitem.commentcreate", { itemKey: "DEMO-1", payload: { body: "New comment", bodyFormat: "plain" } }],
    ["workitem.commentupdate", { itemKey: "DEMO-1", commentId: 9, payload: { body: "Edited", bodyFormat: "plain", parentCommentId: null } }],
  ]);
  assert.equal(JSON.stringify(calls).includes("content-type"), false);
  assert.equal(JSON.stringify(calls).includes("/api/v1/"), false);
});

test("mutation adapter rejects malformed JSON contracts before IPC", async () => {
  let calls = 0;
  const transport = createDesktopApiTransport({ execute: async () => { calls += 1; return { ok: true, data: {} }; } });
  const json = (body, headers = { "content-type": "application/json" }) => ({ method: "PATCH", headers, body });
  /** @type {Array<[string, { method: string, headers: Record<string, string>, body: string }]>} */
  const rejected = [
    ["/api/v1/current-project", json("not-json")],
    ["/api/v1/current-project", json('{"project_key":"DEMO","url":"https://evil.example"}')],
    ["/api/v1/current-project", json('{"project_key":"DEMO"}', { "content-type": "text/plain" })],
    ["/api/v1/work-items/DEMO-1", { ...json('{"title":"x"}'), headers: { "content-type": "application/json", Authorization: "Bearer forged" } }],
    ["/api/v1/work-items/DEMO-1/comments/draft", { method: "POST", headers: { "content-type": "application/json" }, body: '{"body":"x"}' }],
  ];
  for (const [url, options] of rejected) await assert.rejects(transport.request(url, options), (error) => error instanceof ApiError);
  assert.equal(calls, 0);
});
