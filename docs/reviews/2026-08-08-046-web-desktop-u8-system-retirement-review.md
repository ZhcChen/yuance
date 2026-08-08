---
title: Web 与 Desktop U8 系统管理旧实现退役复核
type: review
status: completed
date: 2026-08-08
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U8 系统管理旧实现退役复核

## 结论

系统 dashboard、用户、角色与权限、存储、OpenAPI token、版本发布、数据库统计、审计和 API docs 的正式 Web GET 已永久进入共享 React 入口。对应 Askama 模板、SSR view model、Web form mutation handler、旧 Scalar 页面和业务静态资源均已删除；Browser 与 Desktop 继续使用同一组件树、状态模型、样式和 `/api/v1/**` contract，本切片通过。

## 退役范围

- 永久共享入口：`/web/system` 及 users、roles、permissions、storage、openapi、releases、database-stats、audit、api-docs 子路由。
- 删除 `api/templates/web/system/`、旧系统 renderer/form DTO、所有 `/web/system/**` form mutation route，以及只服务旧 HTML 的测试。
- 删除已无业务消费者的 `api/templates/layouts/web.html`、分页 partial、`api/static/app.js` 和 `api/static/app.css`。
- 认证、初始化和设备授权边界页改用独立 `api/static/auth.css`，不再加载已退役业务脚本、通知 modal 或业务 selector。
- parity manifest 的系统页面与动作更新为 `retired`，inventory 与 interaction classification 已重新生成；旧 `app.js` interaction marker 清零。

## 权限与安全边界

- 正式系统 GET 在返回共享 app entry 前仍由 Rust 执行登录、精确 `return_to` 和页面权限检查；普通用户直接访问继续返回 `403` 并写入权限拒绝审计。
- Browser mutation 使用 Cookie/CSRF，Desktop mutation 使用逐动作 operation registry 和 device auth；不存在通用 system fetch。
- token 明文只在创建响应展示一次，存储凭据保持脱敏，版本发布状态机、资产签名 URL 与下载授权仍由服务端控制。
- `/web/system/releases/{release_id}/assets/{asset_id}/download` 保留为 Rust 文件安全边界，不属于重复业务 UI。
- 未引入 macOS Keychain 或 Electron `safeStorage`。

## 验证

- `cargo fmt --all -- --check`
- `cargo check -p yuance-api`
- `cargo test -p yuance-api --test routing_smoke`：30 passed
- `cargo test -p yuance-api --test auth_security_flow -- --test-threads=1`：45 passed
- `cargo test -p yuance-api --test system_management_flow -- --test-threads=1`：19 passed
- `cargo test -p yuance-api --test storage_config_flow -- --test-threads=1`：9 passed
- `cargo test -p yuance-api --test audit_flow -- --test-threads=1`：5 passed
- `npm --prefix frontend run check`：通过，manifest/inventory 42 项测试通过
- `npm --prefix web run check`：41 passed
- `npm --prefix desktop run check`：通过并完成 renderer production build
- `npm --prefix web run test:e2e -- --grep 'system|database stats'`：18 passed
- `node --test desktop/test/renderer-api-transport.test.mjs desktop/test/renderer-composition.test.mjs desktop/test/operation-registry.test.mjs`：47 passed

## 残留项

- `/web/current-project` 及其旧 form DTO/handler 尚待移除。
- `YUANCE_WEB_APP_SHELL_V1` 迁移开关及 manifest 回滚证据尚待最终收口。
- 登录、初始化、设备授权、Desktop 下载和文档预览 6 个 Askama 边界页需完成共享 token、视觉和安全审核。
- U8 最终仍需执行全量双宿主、截图、异常、权限、文件和迁移 Gate，并形成逐项映射 R1-R23、F1-F7、AE1-AE7 的最终 review。
