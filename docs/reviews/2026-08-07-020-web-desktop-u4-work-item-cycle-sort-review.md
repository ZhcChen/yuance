---
title: Web 与 Desktop U4 工作项周期筛选与排序复核
type: review
status: completed
date: 2026-08-07
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U4 工作项周期筛选与排序复核

## 结论

需求、任务和 Bug 的共享列表查询已补齐旧 Web 既有的周期筛选与排序语义。Browser 与 Desktop 共用 `cycle_id`、`sort` route model 和 API client；共享表单、类型切换、筛选、分页及每页数量均保留参数，重置会显式清除参数。

本切片只完成 U4 列表查询契约的一部分，因此三个页面保持 `in_progress`。指标、周期/成员候选元数据、保存视图、创建工作项、选择模型和批量动作仍需后续切片完成。

## 行为证据

- `cycle_id` 只接受正整数；无值时不发送查询参数，非法值不会被 Desktop renderer 转发。
- `sort` 只允许 `updated_desc`、`created_desc`、`priority_desc`、`due_date_asc`，服务端继续使用领域层统一校验和排序 SQL。
- Browser route parser 与 builder 在 `/web/*`、`/web/app/*` 使用相同字段，筛选、类型切换和分页不丢上下文。
- API client 固定映射 wire 字段；OpenAPI 已登记两个查询参数。
- Desktop renderer 只把固定 query 映射到 `workitem.list`，主进程 operation registry 再次校验正整数与枚举，不暴露通用 URL 或 query 注入能力。
- Browser E2E 使用真实 seed 验证周期筛选产生空结果，重置后恢复任务并继续打开详情。

## 验证

```text
cargo fmt --manifest-path api/Cargo.toml -- --check
cargo test --manifest-path api/Cargo.toml --test project_management_flow api_v1_filters_and_sorts_work_items_with_the_shared_cycle_contract -- --test-threads=1
npm --prefix frontend run check
npm --prefix web run check
npm --prefix web run test:e2e -- --grep "app-owner task list"
npm --prefix desktop run check:renderer
node --test desktop/test/operation-registry.test.mjs desktop/test/renderer-api-transport.test.mjs
git diff --check
```

结果：Rust 聚焦测试、Frontend/Web 全量检查、Browser 聚焦 E2E、Desktop renderer 构建及 16 项 Desktop 聚焦测试通过。

## 后续边界

- 下一切片提供原子列表视图读取模型，补齐指标、候选项、保存视图和 resolved filter，避免多请求快照漂移。
- 保存视图与批量动作必须新增固定 Desktop operation 和闭合 DTO，不复用任意 mutation primitive。
