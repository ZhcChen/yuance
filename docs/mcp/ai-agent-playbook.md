---
title: 元策 Codex CLI Agent Playbook
type: guide
status: active
date: 2026-07-15
---

# 元策 Codex CLI Agent Playbook

本文档面向 Codex CLI。

它是 `skills/yuance-agent/SKILL.md` 的人类可读展开版，目标是把元策的 OpenAPI、MCP 和 Skill 组织成一套稳定、可复用、可审计的 Codex CLI 工作流。

如果你想先看文档索引，再决定从哪份文档进入，先看：

```text
docs/mcp/README.md
```

如果你当前是在做接入初始化，主入口先看：

```text
docs/mcp/codex-cli-setup.md
```

## 三层职责

- OpenAPI：契约层。说明接口、参数、响应、鉴权和状态枚举。
- MCP：工具层。把常用 OpenAPI 能力封装为 Codex CLI 可直接调用的工具。
- Skill / Playbook：行为层。说明 Codex CLI 先查什么、后查什么、什么时候应该停下确认。

推荐顺序始终是：

1. 先看 Playbook / Skill。
2. 再用 MCP 真正执行。
3. 需要确认字段或响应时，再回查 OpenAPI。

## 适用范围

适用于以下任务：

- 分析某个项目当前推进情况
- 查看需求、任务、Bug 详情和评论上下文
- 发表评论或回复
- 流转 / 指派工作项
- 查看资料库内容
- 根据通知追踪被指派或被回复的上下文

不适用于以下行为：

- 绕过资料访问密码
- 直接访问数据库
- 跳过 PAT scope、项目范围或业务权限
- 在没有读取上下文的前提下直接批量写入

## 工具优先级

优先使用这些 MCP 工具：

- `yuance_list_projects`
- `yuance_get_project`
- `yuance_list_work_items`
- `yuance_get_work_item`
- `yuance_list_work_item_comments`
- `yuance_create_work_item_comment`
- `yuance_handoff_work_item`
- `yuance_list_project_resources`
- `yuance_get_project_resource`
- `yuance_unlock_project_resource`
- `yuance_list_notifications`

只有在以下场景才回看 OpenAPI：

- 不确定参数名或字段语义
- 需要确认状态枚举
- 需要确认错误 envelope 或响应结构
- 计划扩展 MCP 工具而不是直接调用现有工具

## 标准操作流程

### 1. 连接检查

在正式分析前，至少做一次最小验证：

1. 调用 `yuance_list_projects`
2. 如果返回 401，检查 `YUANCE_API_TOKEN`
3. 如果返回 403，检查 token scope、项目范围或业务权限

## 2. 分析项目

推荐流程：

1. 用 `yuance_get_project` 读取项目概况
2. 用 `yuance_list_work_items` 按 `project_key`、`item_type`、`status`、`assignee_username` 收敛列表
3. 对重点工作项调用 `yuance_get_work_item`
4. 需要讨论上下文时调用 `yuance_list_work_item_comments`
5. 需要长期资料时调用 `yuance_list_project_resources`

建议输出：

- 当前项目状态
- 重点需求 / 任务 / Bug
- 高优先级阻塞
- 待确认事项
- 下一步建议

## 3. 分析单个工作项

推荐流程：

1. `yuance_get_work_item`
2. `yuance_list_work_item_comments`
3. 如果用户关心最近消息，再补 `yuance_list_notifications`

先读再写，不要基于编号直接改状态。

## 4. 发表评论或回复

使用工具：

- `yuance_create_work_item_comment`

调用规则：

- `body` 使用 HTML 富文本
- 默认 `body_format` 为 `html`
- 回复某条评论时传 `parent_comment_id`

推荐 HTML 范式：

```html
<p>已完成接口联调，当前结果如下：</p>
<ul>
  <li>登录接口返回 200</li>
  <li>上传接口进度显示正常</li>
</ul>
<p>建议你再确认正式环境表现。</p>
```

避免：

- 脚本
- 无意义的大段内联样式
- 与任务无关的复制粘贴日志墙

## 5. 流转或指派工作项

使用工具：

- `yuance_handoff_work_item`

推荐先后顺序：

1. 先读取工作项详情和评论上下文
2. 如需留下过程说明，先评论或在流转 `body` 中说明
3. 再执行流转 / 指派

可用状态值：

- `open`
- `in_progress`
- `pending_confirmation`
- `done`
- `resolved`
- `verified`
- `closed`
- `cancelled`

注意：

- 这些状态值只是可传枚举，不代表任意工作项都允许跳转到其中任意状态。
- 真实可否流转，以服务端状态机校验为准。
- 不要猜测 `assignee_username`；不知道时先让用户指定，或保持当前处理人不变。

## 6. 使用资料库

推荐流程：

1. `yuance_list_project_resources`
2. `yuance_get_project_resource`
3. 如果 `is_protected = true`，停止并向用户索取该条资料访问密码
4. 只有在用户明确授权并给出密码后，才调用 `yuance_unlock_project_resource`

强约束：

- 默认不展示受保护正文
- 默认不展示受保护附件地址
- 不记录密码
- 不缓存密码
- 不对密码做重试或推断

## 7. 使用消息通知

使用工具：

- `yuance_list_notifications`

适合场景：

- 查看当前用户有哪些未读指派
- 查看有哪些回复需要跟进
- 从消息反推需要优先处理的工作项

推荐流程：

1. 读取通知
2. 找出未读或最新通知对应的工作项编号
3. 调用 `yuance_get_work_item`
4. 如需完整讨论上下文，再调用 `yuance_list_work_item_comments`

## 8. 错误处理

遇到错误时不要盲目重试。

推荐处理方式：

- 401：提示 token 无效、过期或已撤销
- 403：提示 scope、项目范围或业务权限不足
- 404：提示项目、工作项或资料不存在，或当前用户不可见
- 业务错误：直接转述错误信息，并给出下一步建议

常见下一步建议：

- 补充 `project_key`
- 缩小筛选条件
- 指定目标状态
- 指定处理人用户名
- 提供受保护资料访问密码

## 9. 默认输出格式

默认把输出分成三类，不要混写：

- 分析输出
- 执行结果
- 阻塞说明

### 项目分析

```text
结论：
- <一句话总结当前项目状态>

关键证据：
- <关键事实 1>
- <关键事实 2>

风险 / 阻塞：
- <主要风险>

建议动作：
- <建议动作 1>
- <建议动作 2>
```

### 工作项分析

```text
结论：
- <一句话总结当前工作项状态>

关键上下文：
- 当前状态：<status>
- 当前责任人：<assignee>
- 最近关键评论 / 流转：<summary>

建议下一步：
- <建议动作 1>
- <建议动作 2>
```

### 已执行写入动作

```text
已执行动作：
- <评论 / 回复 / 流转 / 指派 / 解锁>

目标对象：
- <project_key / item_key / resource_id>

关键参数：
- <status / assignee / parent_comment_id / 其他关键参数>

执行结果：
- <成功结果摘要>

建议下一步：
- <后续建议>
```

### 阻塞说明

```text
当前阻塞点：
- <阻塞原因>

已确认信息：
- <已经知道的上下文>

缺失信息：
- <缺少的字段/密码/目标状态/目标处理人>

建议补充：
- <请用户提供什么>
```

## 10. Codex CLI 推荐落地方式

当前正式支持的接入口径只有：

- Codex CLI

推荐落地方式：

1. 按 `docs/mcp/codex-cli-setup.md` 完成初始化
2. 安装 `skills/yuance-agent/SKILL.md`
3. 接入 `mcp/yuance-mcp/`
4. 需要确认契约时再看 `docs/openapi/yuance.openapi.json`

相关文档入口：

- `docs/mcp/mcp-development-guidelines.md`
- `docs/mcp/codex-cli-setup.md`
- `docs/mcp/ai-mcp-setup.md`
- `skills/yuance-agent/SKILL.md`
