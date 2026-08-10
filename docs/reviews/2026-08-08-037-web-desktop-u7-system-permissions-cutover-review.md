---
title: Web 与 Desktop U7 权限目录切换复核
type: review
status: completed
date: 2026-08-08
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U7 权限目录切换复核

## 结论

正式 `GET /web/system/permissions` 已接入共享 React 应用。`YUANCE_WEB_APP_SHELL_V1` 开启时，Rust 在返回静态入口前完成认证和 `system.roles.view` 权限校验；关闭时继续渲染原 Askama 权限树，保留可验证回滚路径。

## 路由与权限

- 正式路径保留 `q` 搜索参数，并由共享 owner-aware route model 驱动过滤和清除。
- 未登录访问跳转 `/web/login`，`return_to` 精确保留正式路径与搜索参数。
- 普通成员直接访问正式 URL 返回 403，不能先获得共享 bundle 再依赖客户端隐藏。
- 角色工作台和权限目录互相提供共享导航入口，Browser 与 Desktop 使用各自 owner 路径。

## 回滚

- 开关关闭时正式 GET 返回原 SSR “全部权限点”页面和权限树，不引用 `/web/app/assets/`。
- 开关开启时 routing smoke 证明正式入口与 `/web/app` 返回同一 bundle。
- 回滚不涉及数据迁移，权限目录始终来自同一 core seed 与 RBAC domain。

## 验证

- `cargo test -p yuance-api --test routing_smoke web_shell_owner_serves_migrated_routes_from_same_app_entry`：正式权限目录同源 bundle 通过。
- `cargo test -p yuance-api --test auth_security_flow web_app_system_permissions_owner`：未登录回跳和 Rust 权限拒绝通过。
- `cargo test -p yuance-api --test system_management_flow system_permissions_keep_ssr_rollback_when_shared_shell_is_disabled`：SSR 回滚通过。
- `npm --prefix web run test:e2e -- --grep "shared system permissions"`：正式路径搜索与清除通过。
- `node --test frontend/test/experience-manifest.test.mjs`：cutover flag、回滚证据和 route 引用闭合通过。

## 后续

旧权限目录模板和 GET handler 暂不删除，待 U8 稳定窗口与全路由回滚演练完成后统一退役。U7 下一依赖单元迁移数据库统计。
