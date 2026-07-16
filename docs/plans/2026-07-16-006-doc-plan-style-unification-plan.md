---
title: docs: 统一 2026-07-16 系列计划文档表述
type: docs
status: completed
date: 2026-07-16
origin: 用户要求继续统一 002 / 003 / 004 计划文档的说明风格
---

# docs: 统一 2026-07-16 系列计划文档表述

## Overview

`2026-07-16-002`、`003`、`004` 三份计划文档都围绕同一条主线展开：

- 前台状态表述从旧抽象术语改为具体状态范围
- OpenAPI 统计字段改为 `active_*` 语义
- 内部实现命名也同步收口

前几轮已经完成代码和部分历史文档清理，但这三份计划文档之间的说明语气、迁移背景描述和术语颗粒度仍不够统一。本轮只做文案层压缩和统一，不改对应事实结论。

## Scope

- 统一以下文档的自然语言描述：
  - `docs/plans/2026-07-16-002-fix-status-terminology-consistency-plan.md`
  - `docs/plans/2026-07-16-003-refactor-openapi-active-count-fields-plan.md`
  - `docs/plans/2026-07-16-004-refactor-internal-active-naming-plan.md`
- 保留迁移背景所需的历史字段名、函数名、测试名说明
- 不修改任何代码或运行逻辑

## Implementation Units

- [x] Unit 1: 确认统一目标与保留边界
- [x] Unit 2: 更新三份计划文档文案
- [x] Unit 3: 扫描残留并校验
- [x] Unit 4: 提交并推送

## Verification Focus

- 三份文档的说明口径更一致
- 旧字段名只在迁移背景需要时出现
- 本轮 diff 只包含文档文件

## Verification Notes

- 2026-07-16 已完成：
  - `rg -n "开放工作项|全部开放项|开放项|开放状态|开放非终态|未关闭工作项" docs/plans/2026-07-16-002-fix-status-terminology-consistency-plan.md docs/plans/2026-07-16-003-refactor-openapi-active-count-fields-plan.md docs/plans/2026-07-16-004-refactor-internal-active-naming-plan.md docs/plans/2026-07-16-006-doc-plan-style-unification-plan.md`
  - `git diff --check`
