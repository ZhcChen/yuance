---
title: Web 与 Desktop U7 系统角色读取复核
type: review
status: completed
date: 2026-08-08
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U7 系统角色读取复核

## 结论

角色分页、选中角色和权限集合已进入唯一共享 React 页面。Browser 与 Desktop 使用同一 route model、`roles-view` 原子读取契约、角色表格、权限状态和分页交互，不再分别拼接角色与权限请求。

## 契约与边界

- `GET /api/v1/system/roles-view` 要求 `system.roles.view`，默认每页 10 条。
- 响应一次返回当前分页角色、选中角色、完整权限集合、分页和服务端计算的管理能力。
- query 指定跨页角色时仍返回该角色；角色不存在或编码非法时回退当前页首项。
- 系统内置角色始终返回 `can_edit_permissions=false`，共享页面明确展示只读状态。
- Desktop 只开放 `system.rolesview` 语义 operation，并封闭校验角色、权限和分页 DTO。

## 验证

- `api/tests/system_management_flow.rs`：默认分页、跨页选择、授权标记、管理能力和系统角色只读通过。
- `frontend/packages/app-core/test/routes.test.mjs`：Browser/Desktop owner、选中角色和分页 route 一致。
- `frontend/packages/api-client/test/system.test.mjs`：固定 `roles-view` path/query 通过。
- `desktop/test/operation-registry.test.mjs`、`desktop/test/renderer-api-transport.test.mjs`：固定 operation 和封闭 transport 通过。
- `desktop/test/renderer-composition.test.mjs`、`web/e2e/app-shell.spec.mjs`：两宿主共享页面、选中角色和权限状态通过。

## 后续

本切片只把 `page.system.roles` 提升为 `shared`。角色创建、启停、权限树编辑和正式 Web cutover 留在后续独立切片，相关 action 与独立权限路由仍保持 `baseline`。
