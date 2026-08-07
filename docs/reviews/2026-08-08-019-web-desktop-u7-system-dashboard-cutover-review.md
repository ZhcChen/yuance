---
title: Web 与 Desktop U7 系统管理首页切换复核
type: review
status: completed
date: 2026-08-08
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U7 系统管理首页切换复核

## 结论

正式 `/web/system` GET 已接入共享 React 应用门禁。开关启用时 Browser 正式入口和 Desktop 使用同一 dashboard；关闭时原 Askama 页面仍可回滚。系统高权限入口在返回共享 shell 前继续由 Rust 校验 `system.dashboard.view`，没有把授权延迟到客户端。

## 安全与回滚证据

- 匿名请求保留 `/web/system` 作为安全 `return_to` 并跳转登录。
- 普通成员在开关启用时仍由 Rust 返回 403，不能通过取得空 shell 绕过正式 route permission。
- 管理员在开关启用时取得与其他迁移页面相同的 no-store React 入口，再由固定 dashboard API 返回逐项授权链接。
- 开关关闭时 `system_dashboard` 原 SSR handler 和模板保持可用，供 U8 稳定窗口前回滚。

## 验证

- `routing_smoke::web_shell_owner_serves_migrated_routes_from_same_app_entry`：`/web/system` 返回统一共享入口。
- `auth_security_flow::web_app_system_owner_redirects_unauthenticated_request_with_safe_return_to`：匿名回跳通过。
- `auth_security_flow::web_app_system_owner_keeps_rust_permission_gate`：普通成员在 cutover 状态仍为 403。
- `system_management_flow::system_dashboard_keeps_ssr_rollback_when_shared_shell_is_disabled`：默认关闭开关时旧 SSR dashboard 仍可工作。
- manifest、共享前端、Browser、Desktop renderer 与 Rust 聚焦检查通过。

## 后续

`page.system.dashboard` 已提升为 `cutover`。下一切片迁移用户管理读取、筛选、分页和用户创建/状态/角色/密码/项目分配动作；dashboard 旧模板和 handler 在 U8 稳定窗口后统一退役。
