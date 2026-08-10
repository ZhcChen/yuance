---
title: Web 与 Desktop U7 系统 OpenAPI Token 复核
type: review
status: completed
date: 2026-08-08
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U7 系统 OpenAPI Token 复核

## 结论

Browser 与 Desktop 已共用同一套 React 系统 Token 列表、创建、编辑和删除交互，以及同一组 API client 方法和最终状态刷新规则。Desktop renderer 只可提交四个固定业务操作，不具备通用请求能力；页面和所有非创建响应均不包含 Token 明文。

## 行为与安全边界

- `GET /api/v1/system/openapi-view` 要求 `system.api_tokens.view`，原子返回脱敏列表、Token 上限和管理能力。
- 创建、更新和删除要求 `system.api_tokens.manage`，并执行 Browser CSRF 或 Desktop device 写入鉴权及审计记录。
- scope 仅允许 `system_release:read` 和 `system_release:write`；Desktop registry 拒绝未知字段、非法 ID、未知 scope 和越界 DTO。
- 只有创建成功响应包含一次 `raw_token`；列表、更新和删除响应均拒绝该字段，读取和创建响应使用 `Cache-Control: private, no-store`。
- 一次性明文只保存在共享 React 内存状态；编辑、删除、重新加载或离开页面后不再展示。
- 写操作使用单飞锁，提交后读取服务端最终状态；写入成功但刷新失败会保留成功结论并单独提示。
- API Docs 尚未迁移到共享路由，当前只在 Browser 显示 SSR 文档入口，Desktop 不生成不存在的 `/web/app/system/api-docs` 链接。
- `docs/openapi/yuance-system.openapi.json` 是 system bearer token 可调用的版本管理契约，管理员会话下的 Token 管理 API 不属于该外部契约。

## Manifest

- `page.system.openapi` 从 `baseline` 提升为 `shared`，登记原子读取 API、权限、状态和双宿主证据。
- `action.system.openapi.create`、`action.system.openapi.update`、`action.system.openapi.delete` 从 `baseline` 提升为 `shared`。
- 清理旧基线中未实现的项目范围、有效期和启停字段，固定为当前 `name + scopes` domain contract。
- 正式 `/web/system/openapi` cutover、登录回跳和 flag-off SSR 回滚留在下一独立切片。

## 验证

- `cargo test -p yuance-api --test system_management_flow api_system_openapi_view_enforces_permissions_and_plaintext_once`：1 项通过。
- `npm --prefix frontend run check:packages`：API client 43 项、app-core 57 项、app-shell 4 项、platform contract 8 项和 UI 39 项通过。
- `node --test desktop/test/operation-registry.test.mjs desktop/test/renderer-api-transport.test.mjs desktop/test/renderer-composition.test.mjs`：39 项通过。
- `npm --prefix web test -- --test-name-pattern "system OpenAPI token lifecycle"`：Browser API facade 契约通过。
- `npm --prefix web run test:e2e -- --grep "shared system OpenAPI tokens"`：一次性明文、编辑清除、删除确认和最终刷新通过。
- `node --test frontend/test/experience-manifest.test.mjs`：schema、引用闭合、状态和宿主差异 8 项通过。

## 后续

下一切片切换正式 `/web/system/openapi`，补齐服务端权限拒绝、登录回跳、正式路径 E2E 和 feature flag 回滚证据，再将页面提升为 `cutover`。
