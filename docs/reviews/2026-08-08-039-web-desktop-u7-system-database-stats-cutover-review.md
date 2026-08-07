---
title: Web 与 Desktop U7 数据库统计切换复核
type: review
status: completed
date: 2026-08-08
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U7 数据库统计切换复核

## 结论

正式 `GET /web/system/database-stats` 已接入共享 React 应用。开关开启时 Rust 在返回静态入口前完成认证和 `system.database_stats.view` 权限校验；关闭时继续渲染原 Askama 缓存页，保留可验证回滚路径。

## 路由与权限

- 正式路径与 Desktop 的 app-owner 路径由同一 route model 解析，页面不会自行拼接宿主 URL。
- 未登录访问跳转 `/web/login`，`return_to` 精确保留正式数据库统计路径。
- 普通成员直接访问正式 URL 返回 403，不能先获得共享 bundle 再依赖客户端隐藏。
- API 继续独立执行 `system.database_stats.view` 权限校验，Desktop 只增加固定只读 operation。

## 回滚

- `YUANCE_WEB_APP_SHELL_V1` 关闭时正式 GET 返回原 SSR 缓存页及 `data-database-stats-page`，不引用 `/web/app/assets/`。
- 开关开启时 routing smoke 证明正式入口与 `/web/app` 返回同一 bundle。
- 回滚不涉及数据迁移，Browser 与 Desktop 缓存文件均可被新旧实现忽略或覆盖。

## 验证

- `cargo test -p yuance-api --test routing_smoke web_shell_owner_serves_migrated_routes_from_same_app_entry`
- `cargo test -p yuance-api --test auth_security_flow web_app_system_database_stats_owner`
- `cargo test -p yuance-api --test system_management_flow system_database_stats`
- `npx playwright test e2e/app-shell.spec.mjs --grep "shared database stats"`
- `node --test frontend/test/experience-manifest.test.mjs`

## 后续

旧数据库统计模板和 JS handler 暂不删除，待 U8 稳定窗口与全路由回滚演练完成后统一退役。U7 下一依赖单元迁移审计日志。
