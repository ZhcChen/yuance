# 时间管理功能执行计划

## 标题信息

- 主题：时间管理：跨项目排期表 + 拖拽时间条
- 关联 Brainstorm：`docs/brainstorms/2026-08-24-time-management-brainstorm.md`
- 状态：已完成 P0-P6，待 Review/Compound
- 负责人：Codex
- 日期：2026-08-24

## 目标与范围

提供独立于单个项目的“时间管理”排期表：

- 管理员/项目负责人给成员按“人 × 项目 × 起止日期 × 每天小时”安排时间；
- 按人分行的横向时间条展示，支持拖拽创建、移动、调整长度、删除；
- 同一成员时间重叠时高亮冲突；
- 全局入口“时间管理” + 项目详情新增“时间”tab。

MVP 不做：任务级工时同步、实际打卡、审批流、日历导出、节假日/时区计算。

## 已确认决策

1. 按“人”分行，色块 = 项目；
2. 每天投入用“小时”（`daily_hours`）；
3. 允许重叠但高亮冲突；
4. 入口：全局导航 + 项目详情 tab 都要；
5. 仅项目成员可被安排时间。

## 数据模型

新增迁移 `api/migrations/202608240001_create_project_time_allocations.sql`：

```sql
CREATE TABLE project_time_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    daily_hours REAL NOT NULL DEFAULT 8 CHECK (daily_hours > 0 AND daily_hours <= 24),
    note TEXT NOT NULL DEFAULT '',
    created_by_user_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_time_allocations_user_dates
    ON project_time_allocations (user_id, start_date, end_date);
CREATE INDEX idx_time_allocations_project_dates
    ON project_time_allocations (project_id, start_date, end_date);
```

校验规则：

- `start_date <= end_date`；
- `daily_hours` 在 `(0, 24]`；
- 目标用户必须是当前项目成员（`project_members`）；
- 编辑/删除权限：全局 `time.management.edit`，或当前项目 owner/maintainer。

## API 设计

沿用 `/api/v1/projects/{project_key}/...` 风格，新增：

- `GET /api/v1/time-management/overview?start=&end=&project_key=&username=`：跨项目时间条数据（按人聚合），返回成员、项目、起止、每天小时、冲突标记由前端计算；
- `GET /api/v1/projects/{project_key}/time-allocations`：项目内排期；
- `POST /api/v1/projects/{project_key}/time-allocations`：新增排期；
- `PATCH /api/v1/projects/{project_key}/time-allocations/{id}`：更新；
- `DELETE /api/v1/projects/{project_key}/time-allocations/{id}`：删除；
- 可选：`GET /api/v1/me/time-allocations`（个人视图，二期）。

Payload：

```json
{
  "username": "zhangsan",
  "start_date": "2026-08-01",
  "end_date": "2026-08-31",
  "daily_hours": 8,
  "note": ""
}
```

## 权限

- 新增权限种子：`time.management.view`、`time.management.edit`；
- 默认授予系统管理员；项目 owner/maintainer 可管理本项目排期；
- 全局 overview 需要 `time.management.view`；
- 项目内 view 需要 `project.view`，编辑需要 `project.manage` 或项目角色 owner/maintainer。

## 前端设计

- `frontend/packages/api-client/src/time-management.js`：新增 API client 模块；
- `frontend/packages/app-core/src/routes.js`：新增 `/web/app/time-management` 路由解析与路径构造；
- `frontend/packages/ui/src/time-allocation-gantt.jsx`：时间条组件（纯 CSS/JS，参考 `docs/prototypes/time-management/index.html`）；
- `frontend/packages/app-shell/src/app.jsx`：挂载时间管理页面与全局导航入口；
- 项目详情 tabs 增加 `time`；
- 冲突高亮、当前日期线、拖拽创建/移动/缩放、双击删除沿用原型交互。
- 时间轴支持“日 / 周 / 月”粒度切换：日粒度显示日期刻度，周粒度按周刻度，月粒度显示月份刻度。

## 阶段拆分

- **P0 数据模型**：新增迁移 + 领域层校验函数；
- **P1 API**：领域查询/写入 + router 注册 + 权限校验；
- **P2 权限种子**：`time.management.*` 权限与默认角色授权；
- **P3 API 测试**：单元/路由冒烟测试；
- **P4 前端 API client + 路由**；
- **P5 时间条组件与页面**：全局页面 + 项目 tab；
- **P6 联调验证**：本地 API（不碰线上）+ 浏览器交互回归；
- **P7 Review/Compound**：复核记录与经验沉淀。

## 验证策略

- 所有写操作与数据库迁移只在**本地 API 实例**验证，不连接线上 API；
- 本地启动命令：`cargo run -p yuance-api`，使用本地 SQLite 数据库；
- 前端 dev 代理切回本地 API 后联调，确认后恢复线上代理由用户决定；
- 每次小单元完成后按项目规范提交推送。

## 风险

- 时间条组件为纯手工实现，横向滚动、拖拽边界需要浏览器回归；
- 线上 API 已有生产数据，本期不执行任何线上迁移/写操作；
- 权限粒度需与现有 RBAC 种子机制保持一致，避免影响现有角色。

## 下一步

P0-P6 已全部完成并通过本地联调：

- P0/P1：迁移、领域层、API handler、router 已实现；
- P2：`time.management.view` / `time.management.edit` 权限种子已加入；
- P3：`time_management_api_supports_overview_and_project_allocation_crud` 集成测试通过；
- P4：API client 与路由解析已完成，web 宿主显式导出时间管理方法；
- P5：时间条组件、全局页面、项目“时间”tab 已挂载；
- P6：本地临时 SQLite + 本地 API + 独立 dev server 完成浏览器交互验证（添加、拖拽移动、项目 tab）。

剩余：复核记录、提交推送；线上 API 写操作仍不执行，由用户决定代理去向。
