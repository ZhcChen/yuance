---
title: 元策 AI 接入总览
type: guide
status: active
date: 2026-07-15
---

# 元策 AI 接入总览

本文档是元策 AI 接入的总览文档。

当前接入口径已经收敛为：

```text
只支持 Codex CLI
```

所以如果你要真正把元策接入到 AI 工作流里，主入口不是本文，而是：

```text
docs/mcp/codex-cli-setup.md
```

本文只负责说明：

- 当前支持范围
- OpenAPI / MCP / Skill 三层职责
- 关键安全约束
- 需要阅读的文档入口

## 1. 当前支持范围

当前只支持：

- Codex CLI

当前不作为正式接入口径处理：

- 其他 AI 客户端
- 其他 Skill 运行时
- 其他 MCP client 配置方式

这不是说以后永远不支持，而是目前文档、流程、验证口径都以 Codex CLI 为准。

## 2. 三层职责

元策 AI 接入分三层：

```text
OpenAPI  = 契约层
MCP      = 工具层
Skill    = 行为层
```

职责分别是：

- OpenAPI：说明接口、字段、响应、鉴权和状态枚举。
- MCP：把常用 OpenAPI 能力封装成 Codex CLI 可直接调用的工具。
- Skill：告诉 Codex CLI 先读什么、后写什么、什么时候应该停下确认。

推荐顺序：

```text
1. 先按 Skill 工作
2. 再调 MCP 工具
3. 需要确认字段或响应结构时，再回看 OpenAPI
```

## 3. Codex CLI 主入口

真正的初始化、安装、配置、验证流程见：

```text
docs/mcp/codex-cli-setup.md
```

这份文档已经覆盖：

- 创建 PAT
- 克隆仓库
- 拷贝 MCP 脚本
- 拷贝 Skill
- 配置 `~/.codex/config.toml`
- 重启 Codex CLI
- 最小验证
- 常见错误排查

## 4. 关键组成文件

### 4.1 Codex CLI 初始化主文档

```text
docs/mcp/codex-cli-setup.md
```

给接入方机器上的 Codex CLI 按步骤照着执行。

### 4.2 项目 Skill

```text
skills/yuance-agent/SKILL.md
```

让 Codex CLI 在元策场景下优先遵守既定工作流。

### 4.3 AI 行为说明

```text
docs/mcp/ai-agent-playbook.md
```

这是对 Skill 的人类可读展开版，用来解释推荐调用顺序和处理原则。

### 4.4 MCP 脚本

```text
mcp/yuance-mcp/
```

这里是本地 stdio MCP server 的实现与示例配置。

### 4.5 OpenAPI 契约

```text
docs/openapi/yuance.openapi.json
```

以及线上：

```text
/api/openapi.json
```

### 4.6 在线文档

```text
/web/api-docs
```

## 5. 认证与权限边界

元策 AI 接入使用：

```text
yuance_pat_* Personal Access Token
```

基本规则：

- Token 绑定真实用户
- Token 继承真实用户的项目范围、RBAC 和业务权限
- Token 名称会作为该用户的 AI 助手标识显示
- Token scope 负责控制 API / MCP 的能力边界

推荐最小 scope：

```text
project:read
work_item:read
comment:write
work_item:write
resource:read
resource:unlock
notification:read
```

## 6. 受保护资料规则

这是元策 AI 接入里最重要的安全边界之一。

如果资料是受保护的：

```text
resource.is_protected = true
```

则默认必须遵守：

- 不返回正文
- 不返回受保护附件地址
- 不猜访问密码
- 不缓存访问密码
- 不输出访问密码
- 只有用户明确授权并提供该条资料密码时，才允许解锁

## 7. 当前 MCP 工具范围

当前元策 MCP 主要覆盖：

```text
yuance_list_projects
yuance_get_project
yuance_list_work_items
yuance_get_work_item
yuance_list_work_item_comments
yuance_create_work_item_comment
yuance_handoff_work_item
yuance_list_project_resources
yuance_get_project_resource
yuance_unlock_project_resource
yuance_list_notifications
```

## 8. 推荐阅读顺序

如果你是第一次接入，建议按这个顺序看：

```text
1. docs/mcp/codex-cli-setup.md
2. skills/yuance-agent/SKILL.md
3. docs/mcp/ai-agent-playbook.md
4. mcp/yuance-mcp/README.md
5. docs/openapi/yuance.openapi.json
```

## 9. 一句话结论

对于元策当前版本：

```text
Codex CLI 是唯一正式支持的 AI 接入方式；
codex-cli-setup 是主入口；
ai-mcp-setup 只负责总览。
```
