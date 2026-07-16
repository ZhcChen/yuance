---
title: fix: 状态术语与统计表达统一
type: fix
status: completed
date: 2026-07-16
origin: 用户要求移除“开放”概念，前台统一改成具体状态表达
---

# fix: 状态术语与统计表达统一

## Overview

本轮聚焦一个核心目标：前台和 Web 统计层不再使用“开放”这种抽象术语，统一改成用户能直接理解的具体状态表达：

- 待处理
- 进行中
- 待确认

同时把相关统计口径、文案、模板、测试和 Web 视图模型命名一起收口，避免“文案已经改了，但代码和测试还在传播旧概念”的半完成状态。

## Problem Frame

- “开放工作项 / 全部开放项 / x 个开放”属于内部化、抽象化表达，用户阅读时不直观。
- 现有前台不同页面对同一统计口径的表述不一致，有的写“开放”，有的写“未关闭”，有的已经改成具体状态。
- Web 层视图模型仍大量使用 `open_*` 命名，会持续把旧概念带回模板、测试和后续迭代。
- 领域层和 OpenAPI 仍保留 `open_*` 字段；如果不先明确分层清理策略，后续容易在“全部重构”和“只改文案”之间来回摇摆。

## Scope Boundaries

- 本轮优先完成：
  - Web 前台文案统一
  - Web 统计展示统一
  - Web 视图模型命名统一
  - 页面测试对齐
- 本轮暂不直接改动对外 OpenAPI payload 字段命名，避免在存在并行未提交改动的 `api/src/web/api/mod.rs` 中混入额外契约变更。
- `api/src/domains/projects.rs` 中领域层 `open_*` 命名如仍被 OpenAPI 依赖，可先保留，等下一轮契约迁移时再做破坏性重命名评估。

## Key Decisions

- 前台不再出现“开放”一词；一律直接写出状态范围。
- 需要展示合计值时，统一表述为：
  - `待处理 / 进行中 / 待确认`
- Web 层内部统计字段也不再继续使用 `open_*` 命名，避免后续模板继续回流旧术语。
- 测试断言尽量校验稳定语义，不依赖过于脆弱的整段 HTML 片段换行。

## Implementation Units

- [x] Unit 1: 盘点前台与测试中的“开放”术语落点
- [x] Unit 2: 替换工作台、个人页、项目页、项目详情、工作项列表中的前台文案
- [x] Unit 3: 重构 Web 层视图模型字段命名，移除 `open_*`
- [x] Unit 4: 回归页面测试、整理 diff、提交推送

## Execution Notes

### Unit 1

- 使用 `rg` 盘点以下范围：
  - `api/templates/web/**`
  - `api/src/web/user/mod.rs`
  - `api/tests/project_management_flow.rs`

### Unit 2

- 已完成前台文案替换方向：
  - 工作台项目推进
  - 个人页统计与项目摘要
  - 项目页概览与项目卡片
  - 项目详情摘要
  - 工作项列表统计与状态筛选

### Unit 3

- 目标是把 Web 层以下字段改成明确语义命名：
  - `ProjectRow.open_work_items`
  - `ProjectListSummary.open_work_items`
  - `ProjectDetailSummary.open_items`
  - `WorkItemListSummary.open_items`
  - `MySummary.open_count`
- 改名后模板同步使用新字段，避免继续保留 `open_*`。

### Unit 4

- 至少覆盖以下回归点：
  - 工作台渲染
  - 项目页渲染
  - 工作项列表筛选 / 分页
  - 个人页渲染
- 完成后只提交本轮相关文件，不混入用户已有未提交改动。
- 2026-07-16 已完成验证：
  - `cargo test --test project_management_flow web_`
  - `cargo test summaries_exclude_cancelled_items_from_open_counts`
  - `cargo test my_summary_only_counts_open_high_priority_items`
  - `git diff --check`

## Verification Focus

- 前台不再出现“开放工作项 / 全部开放项 / x 个开放 / 开放 / 共”。
- 页面统计展示统一为具体状态范围。
- Web 层不再新增或保留 `open_*` 视图字段。
- 页面测试断言与当前真实页面结构一致。
