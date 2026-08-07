---
title: Web 与 Desktop U7 权限目录复核
type: review
status: completed
date: 2026-08-08
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U7 权限目录复核

## 结论

Browser 与 Desktop 已共用同一套 React 权限目录、搜索和角色工作台入口。页面使用既有 `GET /api/v1/system/permissions` 固定读取契约，权限目录只由服务端 core seed 提供，客户端不具备创建、编辑或删除权限点的能力。

## 行为与边界

- 服务端要求 `system.roles.view`，普通成员不能通过 API 或页面路径读取权限目录。
- API 一次返回完整目录；名称、权限键、资源类型和资源键搜索均由共享 route state 派生，不产生宿主差异。
- 搜索词保存在 owner-aware URL，Browser 使用 `/web/system/permissions`，Desktop 使用 `/web/app/system/permissions`。
- Desktop renderer 只能调用 `system.permissions` 固定 GET；operation registry 拒绝输入字段、超过 500 项的目录和含额外字段的 DTO。
- 权限目录保持只读，角色授权仍由已迁移的角色工作台承担，避免建立第二套权限编辑交互。

## Manifest

- `page.system.permissions` 从 `baseline` 提升为 `shared`。
- 修正旧基线中不存在的 `system.permission.read` 为运行时实际权限 `system.roles.view`。
- 正式 `/web/system/permissions` cutover、登录回跳和 flag-off SSR 回滚留在下一独立切片。

## 验证

- `npm --prefix frontend run check:packages`：共享 API、路由和 React packages 通过。
- `node --test desktop/test/operation-registry.test.mjs desktop/test/renderer-api-transport.test.mjs desktop/test/renderer-composition.test.mjs`：固定 Desktop operation 和组合边界通过。
- `npm --prefix web run test:e2e -- --grep "shared system permissions"`：Desktop owner 搜索、清除和固定读取通过。
- `node --test frontend/test/experience-manifest.test.mjs`：schema、引用闭合和状态 Gate 通过。

## 后续

下一切片切换正式 `/web/system/permissions`，补齐 Rust 权限拒绝、登录回跳、routing smoke 和 SSR rollback 证据，再将页面提升为 `cutover`。
