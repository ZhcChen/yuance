---
title: refactor: 内部活跃工作项命名统一
type: refactor
status: completed
date: 2026-07-16
origin: 用户要求继续把内部残留的 open_* 命名统一收口
---

# refactor: 内部活跃工作项命名统一

## Overview

在上一轮完成 OpenAPI 对外字段 `open_work_item_count -> active_work_item_count` 后，代码内部仍残留一批 `open_*` 命名：

- `WorkItemListStats.open_items`
- `count_open_work_items_assigned_to_user`
- `assigned_open_count`
- `is_open_status`
- 若干单元测试 / 集成测试函数名

这些命名继续传递旧的抽象统计语义，不利于后续维护。本轮目标是在不改变业务行为的前提下，把内部实现统一收口到 `active_*` 语义。

## Scope

- 修改 domain 层内部统计字段与 helper 命名
- 修改 Web 层内部 helper 命名
- 同步测试函数名与断言
- 排查本轮涉及路径下的残留 `open_*` 引用

## Non-Goals

- 不改工作项真实状态枚举值
- 不修改历史计划文档中的说明文字
- 不处理与浏览器“打开页面”语义相关的变量名，例如 `open_response`
- 不触碰当前工作区里与本轮无关的用户已有改动

## Implementation Units

- [x] Unit 1: 盘点内部残留 `open_*` 命名
- [x] Unit 2: 重命名 domain 与 Web helper
- [x] Unit 3: 同步测试与残留引用
- [x] Unit 4: 校验、提交并推送

## Verification Focus

- domain / Web 代码中的“活跃未完结项”语义统一改成 `active_*`
- 集成测试与单元测试通过
- 不误伤代表“打开页面 / 打开详情”的 `open_*` 变量

## Verification Notes

- 2026-07-16 已完成：
  - `cargo test --no-run`
  - `cargo test --lib my_summary_only_counts_active_high_priority_items`
  - `cargo test --test project_management_flow project_member_remove_requires_active_work_items_to_be_transferred`
  - `cargo test --test project_management_flow web_work_item_list_can_filter_by_query_status_priority_and_project`
  - `rg -n "is_open_status|open_items|count_open_work_items_assigned_to_user|assigned_open_count|_open_counts|_open_high_priority_items|requires_open_work_items" api/src api/tests -g '!target'`
  - `git diff --check`
