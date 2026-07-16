---
title: refactor: OpenAPI 活跃工作项统计字段命名
type: refactor
status: completed
date: 2026-07-16
origin: 用户确认 OpenAPI 相关问题只是统计字段命名不直观，要求开始调整
---

# refactor: OpenAPI 活跃工作项统计字段命名

## Overview

本轮只处理 OpenAPI / API 共享摘要层里的统计字段命名问题，不改工作项真实状态枚举。

目标是把对外 `open_work_item_count` 调整为更清晰的 `active_work_item_count`，表达“仍处于处理中、未完结的工作项数量”，避免让 API 使用方误以为它对应某个名为 `open` 的单一状态。

## Scope

- 修改共享项目摘要字段命名：
  - `projects::ProjectSummary.open_work_item_count`
  - `ProjectPayload.open_work_item_count`
- 同步修改：
  - Web / API 映射代码
  - OpenAPI 静态 JSON 契约
  - 相关测试断言
- 本轮不改：
  - 工作项 `status` 字段值
  - `open` 状态本身（其业务语义仍是“待处理”）
  - 领域层中其他未对外暴露的 `open_*` 内部辅助命名

## Key Decision

- `status` 枚举保持不变，依旧使用：
  - `open`
  - `in_progress`
  - `pending_confirmation`
  - `done / resolved / verified / closed / cancelled`
- 对外统计字段统一改成 `active_work_item_count`
- 不引入“双字段兼容”过渡，避免契约继续传播旧抽象概念

## Implementation Units

- [x] Unit 1: 明确本轮只改契约字段命名，不改状态枚举语义
- [x] Unit 2: 修改共享摘要模型与 OpenAPI payload 字段
- [x] Unit 3: 同步 OpenAPI JSON、测试与 Web 映射
- [x] Unit 4: 校验、提交并推送

## Verification Focus

- `ProjectPayload` 返回字段包含 `active_work_item_count`
- `/api/openapi.json` 对应 schema 不再暴露 `open_work_item_count`
- Web 层编译与相关项目列表测试保持通过
- 工作项 `status` 仍保留原有枚举，不发生语义漂移

## Verification Notes

- 2026-07-16 已完成：
  - `cargo test --no-run`
  - `cargo test --test project_management_flow api_v1_lists_projects_and_work_items_for_authenticated_user`
  - `cargo test --test project_management_flow project_summaries_return_counts_and_stable_order`
  - `cargo test --test project_management_flow web_projects_renders_demo_projects_from_database`
  - `cargo test --test routing_smoke openapi_json_is_served_for_api_reference`
  - `node -e 'JSON.parse(require("fs").readFileSync("docs/openapi/yuance.openapi.json","utf8"))'`
  - `git diff --check`
