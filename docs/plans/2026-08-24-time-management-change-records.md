# 时间管理修改记录实现计划

## 目标

时间排期仍保持“任何有权限的人均可编辑”，但每次新增、更新、删除都要记录：

- 谁编辑了（操作人）；
- 编辑前后的内容差异（before / after / changes）；
- 记录按分页弹窗查看，数据同时为后续“回退”功能保留可恢复快照。

## 设计

### 数据载体

复用现有 `project_activities` 表，`target_type = 'time_allocation'` 行保存排期操作记录：

- `actor_user_id` + `users` join：操作人；
- `action`：`time_allocation.created` / `time_allocation.updated` / `time_allocation.deleted`；
- `metadata`：JSON，保存：
  - `before`：操作前排期快照（created 为 null）；
  - `after`：操作后排期快照（deleted 为 null）；
  - `changes`：字段级差异数组 `{ field, before, after }`。

不新增迁移表，避免与现有活动流和审计边界重复。

### 后端

- `api/src/domains/projects.rs`：
  - 新增 `TimeAllocationFieldChange`、`TimeAllocationChangeRecord`；
  - `insert_time_allocation_activity` 支持写入 metadata；
  - create / update / delete 记录前后快照与字段差异；
  - `list_time_allocation_change_records_paginated`：按项目、操作人、数据范围过滤并分页。
- `api/src/web/api/mod.rs` + `api/src/web/router.rs`：
  - `GET /api/v1/time-management/changes?page&per_page&project_key&actor`；
  - 权限沿用 `time.management.view`，非全局数据范围仅返回本人可访问项目。
- `docs/runbooks/api-v1-contract.md`：补充接口契约。

### 前端

- `frontend/packages/api-client/src/time-management.js`：新增 `getTimeManagementChanges`。
- `frontend/packages/ui/src/time-allocation-gantt.jsx`：查看范围右侧新增“记录”按钮（`onOpenRecords`）。
- `frontend/packages/app-shell/src/app.jsx`：
  - 记录弹窗：操作人、项目、动作、时间、差异明细；
  - 使用 `Pagination` 分页加载；
  - mock 模式提供演示记录，真实 API 走 `/api/v1/time-management/changes`。

## 执行单元

1. 后端领域层记录与分页查询。
2. 后端 API 路由与契约文档。
3. api-client 方法。
4. UI 记录按钮。
5. app-shell 记录弹窗与分页。
6. 测试（Rust 集成测试、npm check、本地浏览器验收）。
7. 提交推送。
