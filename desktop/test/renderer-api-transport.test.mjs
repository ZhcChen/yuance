import assert from "node:assert/strict";
import test from "node:test";

import { ApiError } from "@yuance/frontend-api-client";
import { createDesktopApiTransport } from "../src/renderer/platform/api-transport.js";

test("desktop API transport maps only known read routes to domain operations", async () => {
  const calls = [];
  const transport = createDesktopApiTransport({ execute: async (operation, input) => {
    calls.push([operation, input]);
    return { ok: true, data: { operation } };
  } });
  /** @type {Array<[string, string, Record<string, unknown>]>} */
  const cases = [
    ["/api/v1/auth/me", "identity.current", {}],
    ["/api/v1/topbar/status", "shell.topbar", {}],
    ["/api/v1/current-project", "project.current", {}],
    ["/api/v1/projects?status=in_progress&page=2&per_page=25", "project.list", { status: "in_progress", page: 2, perPage: 25 }],
    ["/api/v1/notifications?filter=unread&limit=10", "notification.list", { filter: "unread", limit: 10 }],
    ["/api/v1/notifications/7/target", "notification.target", { notificationId: 7 }],
    ["/api/v1/work-items?item_type=bug&q=crash&priority=P1&project_key=DEMO", "workitem.list", { itemType: "bug", q: "crash", priority: "P1", projectKey: "DEMO" }],
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
