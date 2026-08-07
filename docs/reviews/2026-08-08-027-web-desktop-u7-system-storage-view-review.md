---
title: Web 与 Desktop U7 系统存储读取复核
type: review
status: completed
date: 2026-08-08
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U7 系统存储读取复核

## 结论

对象存储的当前脱敏配置、Bucket 初始化检查和配置版本分页已进入唯一共享 React 页面。Browser 与 Desktop 使用同一 route model、`storage-view` 原子读取契约、检查表、版本表和分页交互，不再分别拼接配置、检查与版本请求。

## 契约与边界

- `GET /api/v1/system/storage-view` 要求 `system.storage.view`，默认每页 10 条。
- 响应一次返回脱敏配置、Bucket 检查、版本分页和服务端计算的管理能力。
- 未配置时返回稳定空态而不是 400；检查失败只返回通用错误，不泄露底层连接和凭证细节。
- 配置与历史版本只包含 `access_key_id_hint`，不返回 AccessKey ID、Secret 或密文。
- Desktop 只开放 `system.storageview` 语义 operation，并封闭校验配置、检查、版本和分页 DTO。

## 验证

- `api/tests/storage_config_flow.rs`：分页快照、未配置空态、`system.storage.view` 门禁和敏感字段不泄露通过。
- `frontend/packages/app-core/test/routes.test.mjs`：Browser/Desktop owner 与版本分页 route 一致。
- `frontend/packages/api-client/test/system.test.mjs`：固定 `storage-view` path/query 通过。
- `desktop/test/operation-registry.test.mjs`、`desktop/test/renderer-api-transport.test.mjs`：固定 operation 和封闭 transport 通过。
- `desktop/test/renderer-composition.test.mjs`、`web/e2e/app-shell.spec.mjs`：两宿主加载同一页面，Browser 验证脱敏配置、检查表、版本表与分页请求。

## 后续

本切片只把 `page.system.storage` 提升为 `shared`。配置保存、候选配置探测、Bucket 初始化、版本回滚和正式 Web cutover 留在后续独立切片；四个高风险 action 仍保持 `baseline`。
