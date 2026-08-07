---
title: Web 与 Desktop U7 系统发布页面切换复核
type: review
status: completed
date: 2026-08-08
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U7 系统发布页面切换复核

## 结论

正式 `GET /web/system/releases` 已接入共享 React 应用。`YUANCE_WEB_APP_SHELL_V1` 开启时，Rust 先完成 bootstrap、认证和 `system.releases.view` 权限校验，再返回与 `/web/app` 相同的静态入口；关闭时继续渲染原 Askama 页面，保留可验证回滚路径。

## 路由与权限

- 正式路径完整保留 `page/per_page` 查询参数，由共享 route model 解析并继续在正式 owner 下导航。
- 未登录访问会跳转 `/web/login`，`return_to` 精确保留正式路径和查询参数。
- Rust 权限 Gate 位于静态 bundle 返回之前，不能通过直接访问 URL 绕过系统发布查看权限。
- 旧 POST 设置、创建、编辑 route 和资产下载 route 保留，用于 SSR 回滚和兼容，不与共享 API mutation owner 冲突。

## 回滚

- 开关关闭时 `GET /web/system/releases` 返回原 SSR 页面、设置表单和 CSRF 字段，不引用 `/web/app/assets/`。
- 开关开启时 routing smoke 证明正式入口与 `/web/app` 返回同一 bundle。
- 回滚不涉及数据迁移，切换前后的发布记录、资产和审计数据使用同一数据库与领域服务。

## 验证

- `cargo test -p yuance-api --test routing_smoke web_shell_owner_serves_migrated_routes_from_same_app_entry`：正式发布路径同源 bundle 通过。
- `cargo test -p yuance-api --test auth_security_flow web_app_system_releases_owner_preserves_unauthenticated_return_path`：未登录安全回跳通过。
- `cargo test -p yuance-api --test system_management_flow system_releases_keep_ssr_rollback_when_shared_shell_is_disabled`：SSR 回滚通过。
- `npm --prefix web run test:e2e -- --grep "shared system releases view"`：正式路径分页和共享页面 Browser E2E 通过。
- `node --test frontend/test/experience-manifest.test.mjs`：cutover flag、回滚证据和 route 引用闭合通过。

## 后续

旧发布模板和 handler 暂不删除，待 U8 稳定窗口与全路由回滚演练完成后统一退役。U7 下一依赖单元继续迁移 OpenAPI Token、数据库统计和审计页面。
