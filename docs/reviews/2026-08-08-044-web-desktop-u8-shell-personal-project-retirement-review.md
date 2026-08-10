---
title: Web 与 Desktop U8 全局壳、个人与项目域旧实现退役复核
type: review
status: completed
date: 2026-08-08
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U8 全局壳、个人与项目域旧实现退役复核

## 结论

正式全局壳、个人页、搜索页和项目域页面已永久进入共享 React 入口，不再受 `YUANCE_WEB_APP_SHELL_V1` 控制；对应 Askama 业务模板、SSR renderer 和已被 `/api/v1/**` 替代的 Web mutation handler 已删除。Browser 与 Desktop 继续复用同一组件树、状态模型和 API client，本切片通过。

## 退役范围

- 永久共享入口：`/web`、`/web/me`、`/web/search`、项目列表、项目详情、周期详情、资源详情和个人分析。
- 删除 dashboard、个人、搜索、项目列表、项目详情、周期、资源、个人分析及项目创建弹窗模板。
- 删除个人资料、密码、API Token，以及项目、成员、周期、附件和资源的 legacy Web mutation 路由与 handler。
- parity manifest 中对应页面和动作更新为 `retired`，共享动作指向实际 `/api/v1/**` contract；legacy inventory 与 interaction classification 已重新生成。
- API contract runbook 补齐系统 API Docs、OpenAPI 和系统 Token 路径，路由覆盖测试保持双向校验。

## 权限与边界

- 永久共享 GET 入口仍在 Rust 侧执行 bootstrap、登录和 CSRF cookie 处理，并精确保留 `return_to`；业务数据和写操作继续由共享 API 的 RBAC、CSRF 或 device auth fail-closed。
- 项目附件与资源附件的下载、预览 GET 仍由 Rust 提供签名 URL 和文件边界能力，不属于重复业务 UI。
- `/web/current-project` 暂时保留：消息、工作项和系统 legacy 模板仍继承 `layouts/web.html`，其项目切换表单依赖该路由。复核中发现该路由被提前删除会导致 404，已恢复原 CSRF、权限和安全 return-to 语义，并增加注册状态断言；待最后一个 legacy layout 使用者退役后删除。
- 未引入 macOS Keychain 或 Electron `safeStorage`。

## 验证

- `cargo fmt --all -- --check`
- `cargo check -p yuance-api`
- `cargo test -p yuance-api --test routing_smoke`：31 passed
- `cargo test -p yuance-api --test auth_security_flow -- --test-threads=1`：50 passed
- `cargo test -p yuance-api --test project_management_flow -- --test-threads=1`：140 passed
- `node --test frontend/test/experience-manifest.test.mjs frontend/test/extract-legacy-experience.test.mjs`
- `npm --prefix frontend run check`
- `npm --prefix web run check`
- `npm --prefix desktop run check`
- `npx playwright test e2e/app-shell.spec.mjs --grep 'browser shell supports root navigation|app-owner global search|shared profile page|project list can switch|shared project'`：19 passed

## 残留项

- `api/static/app.js` 和 `api/static/app.css` 仍同时服务工作项、消息和系统 legacy 模板。本批不按孤立 selector 猜测删除，后续两个纵向切片退役模板后统一做引用清零。
- `project_management_flow.rs` 在删除大量 legacy 页面测试时保留测试发生重排，造成较大文本 diff；测试集合、完整执行结果和新增退役路由断言证明语义范围，后续切片不再继续重排该文件。
- U8 尚需退役工作项与消息、系统管理旧实现，随后移除迁移开关并执行最终全量 Gate。
