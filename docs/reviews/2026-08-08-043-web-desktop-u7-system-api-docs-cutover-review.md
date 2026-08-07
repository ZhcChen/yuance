---
title: Web 与 Desktop U7 系统 API Docs 切换复核
type: review
status: completed
date: 2026-08-08
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U7 系统 API Docs 切换复核

## 结论

正式 `GET /web/system/api-docs` 已接入共享 React 应用。开关开启时 Rust 在返回静态入口前完成认证和 `system.api_tokens.view` 权限校验；关闭时继续返回原 Scalar HTML，保留可验证回滚路径。

## 路由与权限

- 正式路径与 Desktop 的 app-owner 路径由同一 route model 解析，Token 管理入口保持当前宿主 owner。
- 未登录访问跳转 `/web/login`，`return_to` 精确保留正式 API Docs 路径。
- 普通成员直接访问正式 URL 返回 403，不能先获得共享 bundle 再依赖客户端隐藏。
- 开关关闭时，生产有数据库的运行时仍执行同一权限门，不会恢复历史上的公开系统文档页面。

## 回滚

- `YUANCE_WEB_APP_SHELL_V1` 关闭时正式 GET 返回原 Scalar HTML、system OpenAPI 地址和 Token 管理摘要，不引用 `/web/app/assets/`。
- 开关开启时 routing smoke 证明正式入口与 `/web/app` 返回同一 bundle。
- system OpenAPI JSON 继续由仓库构建时内置，切换和回滚不需要数据迁移。

## 验证

- `cargo test -p yuance-api --test routing_smoke system_api_docs_page_embeds_scalar_and_system_token_summary`
- `cargo test -p yuance-api --test routing_smoke web_shell_owner_serves_migrated_routes_from_same_app_entry`
- `cargo test -p yuance-api --test auth_security_flow web_app_system_api_docs_owner`
- `npx playwright test e2e/app-shell.spec.mjs --grep "shared system API docs"`
- `node --test frontend/test/experience-manifest.test.mjs`

## 后续

U7 系统页面迁移已结束。旧 Scalar system handler 暂不删除，待 U8 稳定窗口、回滚演练和全路由审计完成后统一退役。
