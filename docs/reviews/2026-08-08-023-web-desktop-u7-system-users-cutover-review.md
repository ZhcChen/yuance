---
title: Web 与 Desktop U7 系统用户管理切换复核
type: review
status: completed
date: 2026-08-08
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U7 系统用户管理切换复核

## 结论

正式 `/web/system/users` GET 已切换到共享 React 应用。Browser 与 Desktop 现在使用同一用户分页、角色与项目候选状态、管理弹窗、业务操作和反馈状态；旧 SSR handler 与模板仅在 `YUANCE_WEB_APP_SHELL_V1` 关闭时保留为 U8 稳定窗口前的回滚入口。

## 安全与回滚证据

- Rust 在返回共享 shell 前继续校验 `system.users.view`，普通成员直接访问正式路由仍返回 403。
- 匿名请求把完整 `/web/system/users?page=2&per_page=20` query 编码为同源 `return_to` 后跳转登录。
- 管理员通过正式 Web 路由进入与 Desktop 相同的共享页面树，页面数据由固定 `/api/v1/system/users-view` 契约读取。
- 开关关闭时 `system_users_page_renders_accounts_and_roles_for_admin` 和 `system_users_page_renders_project_assignment_controls` 继续证明旧 SSR 用户管理可用。
- 旧模板和表单 handler 暂不删除，待 U8 稳定窗口与全量 route cutover 完成后统一退役。

## 验证

- `routing_smoke::web_shell_owner_serves_migrated_routes_from_same_app_entry`：正式用户管理路由返回统一共享入口并保留 query。
- `auth_security_flow::web_app_system_users_owner_redirects_unauthenticated_request_with_safe_return_to`：匿名完整 query 安全回跳通过。
- `auth_security_flow::web_app_system_users_owner_keeps_rust_permission_gate`：普通成员在 cutover 状态仍为 403。
- `system_management_flow::system_users_page_renders_accounts_and_roles_for_admin`：关闭开关时旧 SSR 页面仍可回滚。
- Browser 与 Desktop 复用 `SystemUsersPage`、共享 API client 和显式 Desktop operation registry，无宿主专属用户管理组件或业务状态分叉。

## 后续

`page.system.users` 已提升为 `cutover`。下一切片按 U7 顺序迁移角色与权限管理，并继续执行共享实现、双宿主证据、正式入口切换和独立提交。
