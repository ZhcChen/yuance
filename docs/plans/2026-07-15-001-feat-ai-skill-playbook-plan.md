---
title: feat: 元策 AI Skill 与 Agent Playbook
type: feat
status: completed
date: 2026-07-15
---

# feat: 元策 AI Skill 与 Agent Playbook

## Overview

在现有 OpenAPI + PAT + MCP 基础上，补齐给 AI Agent 使用的行为层封装：

- 新增项目专用 `skills/yuance-agent/SKILL.md`。
- 新增通用 `docs/mcp/ai-agent-playbook.md`。
- 更新 `docs/mcp/ai-mcp-setup.md`，把 Skill 安装与 Playbook 加载流程写清楚。
- 更新 `mcp/yuance-mcp/README.md` 与 OpenAPI 外链描述，让 OpenAPI、MCP、Skill 三层关系更清晰。

## Problem Frame

OpenAPI 解决的是接口契约，MCP 解决的是工具调用，但两者都不负责告诉 AI：

- 先查什么、后查什么；
- 什么时候应该只读、什么时候可以写入；
- 评论、回复、流转、资料解锁的推荐顺序；
- 遇到受保护资料、业务错误、项目范围歧义时该如何停下或收敛。

如果没有行为层说明，AI 虽然“能调接口”，但不一定“会稳定地调接口”。

## Requirements Trace

- R1. 为支持 Skill 的 AI 客户端提供可直接安装的项目 Skill。
- R2. 为不支持 Skill 的 AI 客户端提供可直接加载的通用操作说明。
- R3. 明确 OpenAPI、MCP、Skill 三层职责边界。
- R4. 文档必须覆盖项目分析、工作项处理、资料库读取、消息通知和错误处理的推荐工作流。
- R5. 对受保护资料继续保持显式授权 + 单次密码的约束，不因 Skill/Playbook 降低边界。

## Key Decisions

- OpenAPI 继续作为契约层，只描述接口、参数、响应与权限语义。
- MCP 继续作为工具层，只负责稳定执行 API 调用，不承载复杂业务策略。
- Skill 作为行为层，给支持 Skill 的 AI 客户端提供高优先级工作流约束。
- Playbook 作为兼容层，给不支持 Skill 的 AI 客户端提供等价的人工可读提示词说明。
- Skill 和 Playbook 都默认优先使用 MCP 工具；只有在确认字段、状态枚举或错误语义时，才回到 OpenAPI 文档。

## Implementation Units

- [x] **Unit 1: 新增项目 Skill**
  - Create: `skills/yuance-agent/SKILL.md`
  - 内容覆盖：项目分析、工作项处理、资料库读取、消息通知、错误处理、输出规范。

- [x] **Unit 2: 新增通用 Playbook**
  - Create: `docs/mcp/ai-agent-playbook.md`
  - 内容覆盖：工具职责、标准调用顺序、评论 HTML 约束、流转建议、保护资料规则、输出模板。

- [x] **Unit 3: 接入初始化文档**
  - Modify: `docs/mcp/ai-mcp-setup.md`
  - 增加 Skill 安装步骤、Playbook 加载建议，以及 OpenAPI / MCP / Skill 三层说明。

- [x] **Unit 4: 补齐外部连接点**
  - Modify: `mcp/yuance-mcp/README.md`
  - Modify: `docs/openapi/yuance.openapi.json`
  - 让 MCP README 和 OpenAPI 外部文档描述指向更完整的 AI 接入说明。

## Verification

- `ai-mcp-setup` 已包含 Skill 安装步骤和 Playbook 加载建议。
- 仓库中已新增可复制的 `SKILL.md` 与通用 Playbook。
- OpenAPI 外链描述和 MCP README 已同步。
- 文档改动通过 `git diff --check`。
