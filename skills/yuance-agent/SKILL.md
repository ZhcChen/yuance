---
name: "yuance-agent"
description: "Use when the user asks to analyze or operate the Yuance project through its MCP tools or OpenAPI, including projects, work items, comments, notifications, and project resources."
---

# 元策 AI Agent Skill

本 skill 用于把元策的 OpenAPI 契约和 MCP 工具组织成稳定的 AI 工作流。

默认职责分层：

1. MCP：负责真实读写操作。
2. OpenAPI：负责确认字段、状态枚举、响应结构和权限语义。
3. Web 页面：只在用户明确要求验证前端表现时才介入。

详细规则见 `docs/mcp/ai-agent-playbook.md`。

## Preconditions

- `yuance` MCP server 已连接。
- `YUANCE_BASE_URL` 与 `YUANCE_API_TOKEN` 已正确配置。
- Bearer Token 的项目范围、scope 和业务权限已经由用户提前配置。
- 涉及受保护资料正文时，只有用户明确授权并提供该条资料密码，才允许调用解锁工具。

## Source Priority

1. 优先使用元策 MCP 工具。
2. 需要确认契约时，再查看 `docs/openapi/yuance.openapi.json` 或 `/api/openapi.json`。
3. 不为了拿业务数据而抓取 Web 页面、猜测接口或跳过权限边界。

## Standard Workflow

### 1. 建立任务上下文

- 如果用户没有明确给出 `project_key`，先调用 `yuance_list_projects` 缩小范围。
- 如果用户给的是工作项编号，例如 `YCE-BUG-12`，直接调用 `yuance_get_work_item`。
- 如果用户关注“我的待处理 / 被指派 / 被回复”，先调用 `yuance_list_notifications`。

### 2. 分析项目

推荐顺序：

1. `yuance_get_project`
2. `yuance_list_work_items`
3. 对关键工作项调用 `yuance_get_work_item`
4. 必要时调用 `yuance_list_work_item_comments`
5. 需要项目沉淀资料时调用 `yuance_list_project_resources` 与 `yuance_get_project_resource`

工作项列表尽量显式传：

- `project_key`
- `item_type`
- `status`
- `assignee_username`
- `page`
- `per_page`

不要一开始就全量扫全部项目。

### 3. 处理工作项

处理前默认先读：

1. `yuance_get_work_item`
2. `yuance_list_work_item_comments`

写入时遵守：

- 评论使用 `yuance_create_work_item_comment`
- 回复时传 `parent_comment_id`
- 流转 / 指派使用 `yuance_handoff_work_item`
- 不猜测 `comment_id`、`assignee_username`、目标状态

`yuance_handoff_work_item` 可用状态：

- `open`
- `in_progress`
- `pending_confirmation`
- `done`
- `resolved`
- `verified`
- `closed`
- `cancelled`

状态是否允许，不由 skill 猜测，实际以当前工作项状态机和服务端校验为准。

### 4. 编写评论正文

评论正文默认使用简洁 HTML：

- 段落用 `<p>`
- 列表用 `<ul>` / `<ol>` / `<li>`
- 强调用 `<strong>`
- 简短代码或标识可用 `<code>`

除非用户明确要求，否则不要塞入冗长内联样式、脚本、外部嵌入或无关 HTML。

### 5. 使用资料库

推荐顺序：

1. `yuance_list_project_resources`
2. `yuance_get_project_resource`
3. 如资料受保护，暂停并向用户索取该条资料密码
4. 只有得到明确授权后，才调用 `yuance_unlock_project_resource`

默认规则：

- 不猜密码
- 不重复尝试密码
- 不缓存密码
- 不在输出中泄露密码

### 6. 使用消息通知

- `yuance_list_notifications` 用于读取当前用户的消息和未读数量。
- 如果消息指向工作项，继续调用 `yuance_get_work_item`。
- 如果需要定位上下文，再调用 `yuance_list_work_item_comments`。

## Working Rules

- 只在和当前任务相关的项目范围内操作。
- 工具支持筛选时，优先传筛选条件和分页，避免无意义大范围枚举。
- 如果 MCP 工具已经覆盖某个动作，不要改走手写 HTTP 请求。
- 如果服务端返回业务错误，先解释错误与下一步，而不是盲目重试。
- 需要写入前，优先读取当前状态，避免基于过期假设操作。
- 涉及受保护资料时，宁可停下询问，也不要越权推断。

## Output Defaults

### 项目分析

- 当前项目状态
- 关键进行中事项
- 主要风险 / 阻塞
- 建议下一步

### 工作项处理

- 当前状态
- 关键上下文
- 已执行动作
- 下一步建议

### 资料库分析

- 找到什么
- 哪些内容受保护
- 当前还缺什么信息
