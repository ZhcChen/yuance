---
date: 2026-07-17
topic: system-database-stats
status: completed
origin: user-request
---

# 系统管理数据库统计页实施计划

## 目标

- 在系统管理中新增“数据库统计”入口。
- 页面展示所有业务表、表备注、数据量与字段设计。
- 首次进入页面只读取浏览器缓存，不主动拉取数据库。
- 仅在点击“刷新”后调用后端接口并覆盖本地缓存。

## 范围

- 后端新增只读统计 domain 与系统管理 API。
- 系统管理菜单、总览卡片与页面模板接入。
- 前端新增缓存渲染、刷新交互与自定义大表格样式。
- 补充系统管理权限与最小测试覆盖。

## 任务拆解

- [x] T1. 新增数据库统计 domain
  - 从 SQLite `sqlite_master` 枚举业务表，排除 `sqlite_%`、`_sqlx_%`。
  - 使用 `PRAGMA table_info` 收集字段定义。
  - 使用 `SELECT COUNT(*)` 收集每张表数据量。
  - 维护静态表备注映射，未知表使用兜底备注。

- [x] T2. 接入系统管理权限、路由与页面
  - 新增 `system.database_stats.view` 权限。
  - 补充系统导航、菜单 active 判断、系统总览卡片与页面模板。
  - 新增 `/web/system/database-stats` 与 `/api/v1/system/database-stats`。

- [x] T3. 实现前端缓存与渲染
  - 使用 `localStorage` 按用户维度缓存最近一次快照。
  - 首次进入先渲染缓存；无缓存时显示空状态。
  - 点击刷新按钮时拉取接口、更新缓存、刷新大表格。
  - 使用独立样式实现“数据库统计大表格”，不复用现有 table 组件。

- [x] T4. 测试与文档
  - 增加系统管理页面/API 的最小权限与返回测试。
  - 视实际改动补充 API 约定文档。
  - 执行 `cargo fmt --all`、目标测试与 `git diff --check`。

## 验证

- `cargo fmt --all`
- `cargo test -p yuance-api system_management_flow`
- `git diff --check`

## 备注

- 本次功能默认不增加自动刷新与后台定时统计。
- 浏览器缓存仅用于提升再次进入页面时的可读性，不作为服务端数据源。
