---
title: Web 与 Desktop U4 工作项批量操作复核
type: review
status: completed
date: 2026-08-07
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U4 工作项批量操作复核

## 结论

工作项列表的选择与批量操作已迁移到唯一共享 React 实现。选择可跨分页保留，在项目、类型、筛选、排序或每页数量变化时清理；成功项会从选择中移除，部分失败时仅保留失败项并展示逐项原因。

Browser 与 Desktop 使用同一 `batchUpdateWorkItems` client 和闭合 JSON contract。Desktop 仅开放固定 `workitem.batchupdate` operation，不接受 URL、method、header 或任意 body。单次最多处理 100 个唯一工作项，快速重复确认由同步 mutation lock 拦截。

## 行为证据

- `/api/v1/work-items/batch` 在请求级完成身份、CSRF、scope、项目访问和写权限检查。
- 每个工作项复用现有 Domain 单项事务，独立保持字段更新、流转记录、项目动态和通知一致性。
- 响应固定返回 `updated_item_keys` 与带稳定错误码的 `failed_items`；Desktop 对数组上限、计数一致性和 DTO 字段进行冻结解析。
- 共享列表支持单项选择、当前页全选、跨页累计、清空、动作目标、确认、提交锁和部分失败恢复。
- 权限响应变为只读时，创建、选择和批量操作入口同时消失，已有选择随之清理。
- OpenAPI 和 Device 业务 allowlist 已显式登记该固定端点，parity manifest 中 `action.work-item.batch.update` 已提升为 `shared`。

## 复核

- Correctness：通过。跨项目输入可形成一项成功、一项失败，成功项持久化且失败项保持原值。
- Security：通过。服务端重新执行权限检查；Desktop registry 与 renderer transport 均使用逐字段白名单，没有通用网络能力。
- API contract：通过。新增端点为加法变更，请求与响应由 OpenAPI 封闭 schema 描述，Browser/Desktop 消费同一字段。
- Adversarial：通过。覆盖跨页状态、筛选清理、部分失败、只读权限变化、重复点击、100 项上限和畸形 Desktop 响应。

## 验证

```text
cargo fmt --all -- --check
cargo test -p yuance-api --test project_management_flow --test device_session_contract_flow --test device_business_parity_flow
npm --prefix frontend run check
npm --prefix web run check
npm --prefix desktop test
npm --prefix web run test:e2e
jq empty docs/openapi/yuance.openapi.json frontend/parity/experience-manifest.json
git diff --check
```

结果：Rust 195 项通过；Desktop 416 项通过、3 项 Windows-only 跳过；Web E2E 45 项通过；Frontend、Web、OpenAPI、parity manifest 和 diff 检查通过。

## 后续边界

- U4 的列表控件、创建、保存视图和批量操作已共享；下一切片应完成三个正式 Web 列表入口的切换与旧列表实现退役。
- 工作项详情、协作和附件属于 U5，不在本切片扩展。
