---
title: Web 与 Desktop U7 系统发布读取视图复核
type: review
status: completed
date: 2026-08-08
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U7 系统发布读取视图复核

## 结论

Browser 与 Desktop 已使用同一个 `system-releases` route、共享 React 发布工作台和 `GET /api/v1/system/releases-view` 原子读取保留策略、分页版本、版本资产与管理能力。页面不再由宿主分别拼接设置、版本和逐版本资产请求。

## 数据与边界

- 原子视图先校验 `system.releases.view`，管理能力单独由 `system.releases.manage` 计算。
- 分页版本与其资产在同一次响应中形成一致快照，页面分页只更新共享 route model。
- 页面资产 DTO 不返回 `object_key`、`file_object_id` 或签名请求；Desktop 固定 operation 对额外字段 fail closed。
- Browser 与 Desktop 均复用 `createSystemClient`，宿主 adapter 只映射固定读取路径和分页参数。
- 本切片只开放共享读取；创建、设置、编辑、校验、撤回和资产传输继续由后续动作切片迁移。

## 验证

- `api/tests/system_management_flow.rs`：原子策略、版本、资产、分页和管理能力读取通过。
- `frontend/packages/api-client/test/system.test.mjs`：共享 client 的紧凑分页 query 通过。
- `frontend/packages/app-core/test/routes.test.mjs`：Browser/Desktop owner 与分页 route 通过。
- `desktop/test/operation-registry.test.mjs`：固定 operation、封闭 DTO 和内部对象字段拒绝通过。
- `desktop/test/renderer-api-transport.test.mjs`：renderer 只映射固定发布读取路径。
- `web/e2e/app-shell.spec.mjs`：共享策略、版本、资产及分页工作台通过。

## 后续

`page.system.releases` 已提升为 `shared`。下一切片迁移发布设置、版本状态和资产生命周期操作，完成后再切换正式 `/web/system/releases`。
