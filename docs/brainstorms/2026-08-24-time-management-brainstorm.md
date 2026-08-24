# 时间管理功能 Brainstorm

## 标题信息

- 主题：时间管理：项目 × 成员 × 时间段安排，生成个人时间条
- 状态：收敛中
- 负责人：Codex
- 日期：2026-08-24

## 背景

用户希望新增“时间管理”功能：把每一个项目的时间安排给到每一个人，生成时间条，让每个人的时间安排清晰可见。当前需求处于范围未定阶段，需要先确认时间分配的粒度、数据模型、入口与权限边界，再进入计划。

## 目标

1. 明确“时间安排”的对象与粒度（项目、周期、任务、自由时间段）。
2. 确定时间条的可视化形态与页面入口。
3. 确定数据模型、API 边界与权限规则。
4. 收敛出一个可执行的 MVP 范围。

## 约束

- 不新增第三方 UI 依赖（当前前端为原生 React/JS 组件，无图表库）。
- 时间条至少支持按人聚合展示，冲突需要肉眼可识别。
- 改动延续现有 `web`/`frontend` SPA + `api`（Rust + SQLite）架构。
- 写操作在线上环境需谨慎，MVP 阶段优先只读分析，确认方案后再落地。

## 已确认事实

- 现有数据模型已具备项目、成员、周期、工作项时间字段：
  - `projects`：`start_date`、`due_date`、`owner_user_id`
  - `project_members`：`user_id`、`member_role`（`owner`/`maintainer`/`member`/`viewer`）
  - `project_cycles`：`start_date`、`end_date`、`owner_user_id`、`closed_at`
  - `work_items`：`assignee_user_id`、`due_date`、`cycle_id`、`status`、`priority`
- 前端入口已存在：
  - 全局导航 `frontend/packages/ui/src/global-navigation.jsx`
  - 路由层 `frontend/packages/app-core/src/routes.js`（项目详情 tabs：`info`/`members`/`cycles`/`files`/`resources`）
  - 页面承载在 `frontend/packages/app-shell/src/app.jsx`
  - API client 在 `frontend/packages/api-client/src/projects.js`，已有 members/cycles/work-items 调用
- 权限体系为 RBAC：`project.view`、`project.manage`、`project.cycle.*`、`project.member.*` 等，可按需新增 `time.management.*`。
- API 项目路由集中在 `api/src/web/router.rs`，项目相关 handler 在 `api/src/web/api/mod.rs`。

## 备选方案

### 方案 1（推荐）：人 × 项目时间段分配，新增独立表

- 概述：新增 `project_time_allocations`，一条记录表示“某成员在某项目从 A 日到 B 日，每天投入 X 小时/百分比”。时间条按人分行、按项目着色。
- 优点：
  - 与“给每一个项目安排到每一个人”语义完全一致；
  - 不依赖工作项完成度，适合排期/规划；
  - 时间条实现简单（日期段 + 色块），冲突检测直接。
- 缺点：
  - 与任务级工时（work_items）是两套数据，需要人工维护；
  - 需要决定“每天时长”还是“百分比”。
- 风险：排期数据可能过期；需要提供编辑/删除入口。

### 方案 2：复用 work_items 的 assignee + due_date 自动生成时间条

- 概述：不新增排期数据，直接从每个项目的工作项聚合“人 × 任务 × 起止日”，按 assignee 生成时间条。
- 优点：零新增数据模型，复用现有任务数据；时间条天然对应真实工作量。
- 缺点：
  - work_items 目前只有 `due_date`，没有 `start_date` 和工时，时间条只能从创建日到截止日，精度差；
  - 任务跨项目分散时聚合复杂；
  - 与“安排项目时间”的目标不完全匹配，更像“任务时间视图”。
- 风险：MVP 需要额外扩展 work_items 字段，改动面更大。

### 方案 3：人 × 周期分配

- 概述：把时间分配挂到已有 `project_cycles`，记录周期内每个成员投入。
- 优点：复用周期时间段，规划粒度适中。
- 缺点：周期不等于项目整体排期；跨项目个人视图仍需额外聚合。
- 风险：和项目级时间条语义不一致。

## 当前倾向

倾向**方案 1**：新增独立时间分配表，先支持“人 × 项目 × 日期段 × 每天投入”，页面提供项目内 tab 和全局“时间管理”视图。工作项/周期可作为后续数据源补充，不在 MVP 强绑定。

## 建议 MVP 范围

### 数据模型

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
CREATE INDEX idx_time_allocations_user_dates ON project_time_allocations (user_id, start_date, end_date);
CREATE INDEX idx_time_allocations_project_dates ON project_time_allocations (project_id, start_date, end_date);
```

### API

- `GET /api/v1/time-management/overview?start=&end=`：跨项目所有人时间条（按人聚合，可带项目/人员筛选）
- `GET /api/v1/projects/{key}/time-allocations`：项目内排期
- `POST/PATCH/DELETE /api/v1/projects/{key}/time-allocations/{id}`：项目负责人/维护者维护排期
- 可选：`GET /api/v1/me/time-allocations`：个人视图

### 前端

- 新增路由 `/web/app/time-management`，全局导航“时间管理”入口。
- 项目详情新增 tab `time`，复用现有 tabs 模式。
- 时间条组件（纯 CSS/JS 实现）：
  - 行 = 人员，列 = 日期（支持天/周/月缩放，MVP 先按天）；
  - 色块 = 项目时间段，块内显示项目名、日期、每天时长；
  - 同一人员重叠时间段高亮冲突；
  - 当前日期竖线。
- 编辑表单：项目、成员、开始日、结束日、每天时长、备注。

### 权限

- 新增权限 `time.management.view` / `time.management.edit`，默认授予系统管理员与项目 owner/maintainer。
- 全局视图仅对具备 `time.management.view` 的用户开放；项目内 tab 可由项目 owner/maintainer 管理。

## 非目标（MVP 不做）

- 自动从 work_items 生成/同步排期（二期可做“建议”）。
- 工时打卡、实际耗时统计、审批流。
- 日历订阅/导出。
- 节假日、周末、时区复杂计算（按自然日展示）。

## 待确认问题

1. 时间条按“人”分行，还是按“项目”分行、人显示在块内？当前分析按人分行。
2. 每天投入用“小时”（如 8h）还是“百分比”（如 50%）？当前倾向小时。
3. 同一人同一时间多项目重叠是否允许？当前倾向允许但高亮冲突。
4. 时间管理入口：全局导航新增“时间管理” + 项目详情新增 tab，两个都要吗？
5. MVP 是否允许非项目成员被安排时间（例如外部协作人）？当前倾向仅项目成员。

## 下一步

待用户确认上述问题后，进入 `docs/plans/2026-08-24-time-management-plan.md` 拆解执行单元。
