---
title: 项目内元策使用规则提示词
type: guide
status: active
date: 2026-07-15
---

# 项目内元策使用规则提示词

这份提示词用于：

- 另一个项目已经跑在 Codex CLI 里
- 该机器已经全局装好了元策 MCP 和 `yuance-agent`
- 你想把“如何正确使用元策 MCP”的规则塞给该项目里的 AI

适合放的位置：

- 项目级 `AGENTS.md`
- 项目初始化提示词
- 项目 AI 规则说明

如果你要的是机器级初始化，不要用这份，改用：

```text
docs/mcp/prompts/global-codex-cli-bootstrap-prompt.md
```

## 可直接复制的提示词

```text
你当前所在项目已经全局接入了元策 MCP 和 yuance-agent Skill。后续只要任务涉及元策项目、需求、任务、Bug、评论、通知或资料库，就按下面规则工作。

工作边界：
- 当前只按 Codex CLI 口径工作。
- 优先使用元策 MCP 工具。
- 只有在需要确认字段、状态枚举、响应结构时，才回看 OpenAPI。
- 不要为了拿业务数据而抓取 Web 页面、猜接口或绕过权限边界。

工作顺序：
1. 先按 yuance-agent Skill 的规则工作
2. 再调用元策 MCP 工具
3. 需要确认契约时，再看 docs/openapi/yuance.openapi.json 或 /api/openapi.json

建立上下文规则：
- 如果用户没有明确给出 project_key，先调用 yuance_list_projects 缩小范围。
- 如果用户给的是工作项编号，例如 YCE-BUG-12，直接调用 yuance_get_work_item。
- 如果用户关注“被指派 / 被回复 / 未读消息”，先调用 yuance_list_notifications。

处理工作项规则：
- 在发表评论、回复、流转、指派前，默认先读取：
  - yuance_get_work_item
  - yuance_list_work_item_comments
- 不猜测目标状态。
- 不猜测处理人。
- 不猜测 parent_comment_id。
- 如果缺少关键上下文，先进入阻塞说明，而不是直接写入。

资料库规则：
- 先 yuance_list_project_resources，再 yuance_get_project_resource。
- 如果 is_protected = true：
  - 默认不展示正文
  - 默认不展示受保护附件地址
  - 不猜密码
  - 不缓存密码
  - 只有用户明确授权并提供密码时，才调用 yuance_unlock_project_resource

输出规则：
- 默认把输出分成三类，不要混写：
  1. 分析输出
  2. 执行结果
  3. 阻塞说明
- 分析输出至少包含：
  - 结论
  - 关键证据
  - 风险 / 缺口
  - 建议下一步
- 执行结果至少包含：
  - 已执行动作
  - 目标对象
  - 关键参数
  - 执行结果
  - 建议下一步
- 阻塞说明至少包含：
  - 当前阻塞点
  - 已确认信息
  - 缺失信息
  - 建议补充

评论正文规则：
- 使用简洁 HTML
- 段落用 <p>
- 列表用 <ul>/<ol>/<li>
- 强调用 <strong>
- 不写脚本
- 不塞冗长无关 HTML

文档参考顺序：
- skills/yuance-agent/SKILL.md
- docs/mcp/ai-agent-playbook.md
- docs/mcp/agent-output-examples.md
- docs/openapi/yuance.openapi.json

如果任务要求你修改或扩展元策 MCP 工具，额外遵守：
- docs/mcp/mcp-development-guidelines.md
- docs/mcp/mcp-tool-change-checklist.md
```
