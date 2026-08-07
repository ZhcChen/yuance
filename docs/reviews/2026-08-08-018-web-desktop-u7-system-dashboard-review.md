---
title: Web 与 Desktop U7 系统管理首页复核
type: review
status: completed
date: 2026-08-08
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U7 系统管理首页复核

## 结论

系统管理首页已进入唯一共享 React 实现。Browser 与 Desktop 使用同一 `system-dashboard` route、API client、组件树和可见入口 DTO；入口集合由服务端逐项检查当前主体 RBAC 后返回，前端不根据 `is_super_admin` 猜测业务权限。

## 权限与宿主边界

- `GET /api/v1/system/dashboard` 先要求 `system.dashboard.view`，再逐项检查 users、roles、storage、OpenAPI token、releases、database stats 和 audit 的 view 权限。
- 响应仅包含固定 `id/title/description/path`，不返回角色明细、密钥、token 或服务端内部配置。
- Desktop 只增加无输入的 `system.dashboard` GET operation；顶层和 link DTO 均拒绝未知字段，路径仅允许 `/web/system[/slug]`。
- Desktop app protocol 只增加 `/system` 路由前缀，不开放任意 URL 或通用 system fetch。
- 当前页面为 `shared`，正式 `/web/system` 尚未切换；SSR 回滚和正式入口 cutover 在下一独立切片完成。

## 验证

- `api/tests/system_management_flow.rs::api_system_dashboard_returns_only_fixed_authorized_links`：超级管理员得到七个固定入口和闭合字段。
- `frontend/packages/api-client/test/system.test.mjs` 与 `frontend/packages/app-core/test/routes.test.mjs`：固定 API 与双 owner route 通过。
- `web/e2e/app-shell.spec.mjs`：Browser shared owner 渲染七个权限过滤入口。
- `desktop/test/operation-registry.test.mjs`：固定路径、闭合 DTO、外部 URL 和未知字段拒绝通过。
- `desktop/test/renderer-api-transport.test.mjs` 与 `renderer-composition.test.mjs`：renderer 只映射固定 operation，Desktop `/system` route 可达。
- `npm --prefix frontend run check`、`npm --prefix web run check`、`npm --prefix desktop run check:renderer` 与 Rust 聚焦测试通过。

## 后续

下一切片切换正式 `/web/system` GET 到共享应用并验证权限、登录回跳与关闭开关后的 SSR 回滚，然后进入用户管理页面与动作。
