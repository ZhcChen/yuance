---
title: Web 与 Desktop U4 工作项列表视图复核
type: review
status: completed
date: 2026-08-07
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U4 工作项列表视图复核

## 结论

需求、任务和 Bug 的共享 React 页面改为通过单个 `GET /api/v1/work-item-list-view` 原子读取列表、分页、指标、已解析筛选、处理人、周期、保存视图和管理权限。Browser 与 Desktop 消费同一 API client 和共享页面；Desktop 通过固定 `workitem.listview` operation 转发，响应按闭合 DTO 解析并冻结。

三个列表页面仍保持 `in_progress`。本切片只完成读取模型、指标、候选筛选和保存视图应用；保存视图 mutation、创建工作项、选择模型和批量操作仍属于后续 U4 切片。

## 行为证据

- 服务端在同一请求主体和项目上下文中并行读取列表、指标、成员、周期及当前用户保存视图。
- resolved filter 明确返回默认排序 `updated_desc`，共享筛选表单以响应值重新挂载，SPA 导航后不会显示旧值。
- 处理人和周期使用服务端候选项，不再要求用户输入用户名或周期 ID。
- 保存视图可直接应用完整筛选和每页数量；默认视图有明确标识。
- Desktop operation 只允许固定查询字段，拒绝未知字段、非法枚举和请求原语；响应数组有上限，未知私有字段被丢弃。
- OpenAPI 使用 `additionalProperties: false` 描述闭合列表视图 DTO。

## 验证

```text
cargo fmt --manifest-path api/Cargo.toml -- --check
cargo test --manifest-path api/Cargo.toml --test project_management_flow api_v1_work_item_list_view_returns_atomic_shared_page_contract -- --exact
npm --prefix frontend run check
npm --prefix web run check
npm --prefix web run test:e2e
npm --prefix desktop run check
node --test desktop/test/operation-registry.test.mjs desktop/test/renderer-api-transport.test.mjs
jq empty docs/openapi/yuance.openapi.json
git diff --check
```

## 后续边界

- 下一切片新增保存视图 create、rename、default、delete 的共享 mutation 与固定 Desktop operations。
- 默认视图的首次自动恢复与失效视图降级应和 mutation 生命周期一起验证。
- 创建和批量操作完成前，正式 `/web/requirements`、`/web/tasks`、`/web/bugs` 不在本切片切换。
