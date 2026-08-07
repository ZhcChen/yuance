---
title: Web 与 Desktop U7 系统 OpenAPI 页面切换复核
type: review
status: completed
date: 2026-08-08
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U7 系统 OpenAPI 页面切换复核

## 结论

正式 `GET /web/system/openapi` 已接入共享 React 应用。`YUANCE_WEB_APP_SHELL_V1` 开启时，Rust 先完成 bootstrap、认证和 `system.api_tokens.view` 权限校验，再返回与 `/web/app` 相同的静态入口；关闭时继续渲染原 Askama 页面，保留可验证回滚路径。

## 路由与权限

- 未登录访问会跳转 `/web/login`，`return_to` 精确保留正式 OpenAPI 路径。
- Rust 权限 Gate 位于静态 bundle 返回之前，普通成员直接访问正式 URL 返回 403。
- Browser E2E 使用正式 `/web/system/openapi`，创建、编辑、删除后均停留在正式 owner，不退回 `/web/app`。
- 旧 POST 创建、编辑和删除 route 保留，用于 SSR 回滚和兼容，不与共享 JSON mutation owner 冲突。

## 回滚

- 开关关闭时正式 GET 返回原 SSR Token 表单，不引用 `/web/app/assets/`。
- 开关开启时 routing smoke 证明正式入口与 `/web/app` 返回同一 bundle。
- 回滚不涉及数据迁移，两套入口使用同一系统 Token domain、权限和审计数据。

## 验证

- `cargo test -p yuance-api --test routing_smoke web_shell_owner_serves_migrated_routes_from_same_app_entry`：正式 OpenAPI 路径同源 bundle 通过。
- `cargo test -p yuance-api --test auth_security_flow web_app_system_openapi_owner`：未登录安全回跳和 Rust 权限拒绝通过。
- `cargo test -p yuance-api --test system_management_flow system_openapi_keeps_ssr_rollback_when_shared_shell_is_disabled`：SSR 回滚通过。
- `npm --prefix web run test:e2e -- --grep "shared system OpenAPI tokens"`：正式路径完整生命周期通过。
- `node --test frontend/test/experience-manifest.test.mjs`：cutover flag、回滚证据和 route 引用闭合通过。

## 后续

旧 OpenAPI 模板和 GET handler 暂不删除，待 U8 稳定窗口与全路由回滚演练完成后统一退役。U7 下一依赖单元迁移权限目录。
