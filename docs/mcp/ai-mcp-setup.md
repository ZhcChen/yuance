---
title: 元策 MCP 初始化指南
type: guide
status: active
date: 2026-07-14
---

# 元策 MCP 初始化指南

本文档给 AI Agent 和开发者使用。目标是在本机安装一个元策 MCP server，让 AI 能通过元策 OpenAPI 查看项目、需求、任务、Bug、评论、资料库和消息通知。

如果你当前只接入 Codex CLI，优先阅读：

```text
docs/mcp/codex-cli-setup.md
```

推荐完整接入方式：

```text
OpenAPI  = 契约层
MCP      = 工具层
Skill    = 行为层
```

也就是：

- OpenAPI 负责说明接口。
- MCP 负责执行接口。
- Skill / Playbook 负责告诉 AI 先读什么、后写什么、什么时候应该停下确认。

## 设计约定

- MCP server 是本地 Node.js 脚本，不发布 npm。
- MCP server 不直连数据库，只请求元策 HTTP API。
- 认证使用个人中心创建的 `yuance_pat_*` Personal Access Token。
- Token 绑定创建它的真实用户，并继承该用户的项目范围、RBAC 和业务权限；Token 名称会作为该用户的 AI 助手标识展示在评论、流转和通知中。
- AI 助手通过 OpenAPI/MCP 处理需求、任务或 Bug 时，只要 Token scope、项目范围和业务权限允许，就可以按工作项状态机执行流转、指派、评论和资料读取等操作。
- 受保护资料默认不返回正文；只有用户明确授权并提供该条资料密码时，才调用解锁工具。

## 1. 在元策创建 Personal Access Token

打开元策：

```text
/web/me
```

点击“创建访问 Token”，建议按 MCP 需要选择最小权限：

Token 名称建议填写清晰的 AI 助手名称，例如：

```text
Claude Code 本地助手
Cursor 项目助手
Codex CLI 助手
```

后续 AI 通过该 Token 操作时，页面会显示类似：

```text
张三 的 AI助手「Claude Code 本地助手」
```

```text
project:read          读取项目
work_item:read        读取需求 / 任务 / Bug
comment:write         发表评论
work_item:write       流转 / 指派工作项
resource:read         读取资料库元信息和未受保护正文
resource:write        通过 OpenAPI 创建 / 编辑资料库记录（MCP 默认工具不需要）
resource:unlock       用户授权后解锁受保护资料
notification:read     读取消息通知
```

Token 明文只显示一次，创建后立即复制保存。

项目范围在创建弹窗中通过多选项目选择：

```text
全部项目   允许访问当前用户可见的全部项目；后续新增且对该用户可见的项目也会自动包含
YCE       只允许访问 YCE 项目
YCE + OPS 只允许访问 YCE 和 OPS 项目
```

项目范围不会绕过元策自身的项目成员范围、RBAC 和业务权限校验。

每个用户最多可同时保留 100 个未撤销 Token；达到上限时，需要先撤销不再使用的 Token。

AI 助手写入能力：

```text
- 可以读取项目、需求、任务、Bug、评论、资料库和消息。
- 可以发表评论。
- 可以按工作项状态机流转、指派和更新工作项。
- 是否允许完成、解决、验证或关闭，取决于当前状态机、Token scope、项目范围和业务权限。
- 是否回指给用户本人、是否直接关闭、是否保留待确认流程，由使用该 Token 的用户自行约定和使用。
```

## 2. 克隆开源仓库并复制 MCP 脚本

macOS / Linux：

```bash
git clone https://github.com/ZhcChen/yuance.git
cd yuance
rm -rf ~/.yuance-mcp
mkdir -p ~/.yuance-mcp
cp -R mcp/yuance-mcp/. ~/.yuance-mcp/
cd ~/.yuance-mcp
npm install
npm run check
```

Windows PowerShell 示例：

```powershell
git clone https://github.com/ZhcChen/yuance.git
cd yuance
New-Item -ItemType Directory -Force "$env:USERPROFILE\.yuance-mcp"
Copy-Item -Recurse -Force "mcp\yuance-mcp\*" "$env:USERPROFILE\.yuance-mcp\"
cd "$env:USERPROFILE\.yuance-mcp"
npm install
npm run check
```

## 3. 安装项目 Skill 与 Playbook（推荐）

如果你的 AI 客户端支持 Skill 机制，建议同时安装本仓库自带的 `yuance-agent`。

macOS / Linux：

```bash
cd ~/path/to/yuance
mkdir -p ~/.codex/skills/yuance-agent
cp skills/yuance-agent/SKILL.md ~/.codex/skills/yuance-agent/SKILL.md
```

Windows PowerShell：

```powershell
cd path\to\yuance
New-Item -ItemType Directory -Force "$env:USERPROFILE\.codex\skills\yuance-agent"
Copy-Item -Force "skills\yuance-agent\SKILL.md" "$env:USERPROFILE\.codex\skills\yuance-agent\SKILL.md"
```

如果当前 AI 客户端不支持 Skill，至少把下面这份文档作为系统提示词、项目说明或本地知识库加载：

```text
docs/mcp/ai-agent-playbook.md
```

本仓库里这两份文件分别负责：

```text
skills/yuance-agent/SKILL.md     面向支持 Skill 的客户端
docs/mcp/ai-agent-playbook.md    面向不支持 Skill 的客户端
```

## 4. 配置 MCP client

如果当前客户端是 Codex CLI，推荐直接按下面这份文档配置：

```text
docs/mcp/codex-cli-setup.md
```

macOS 示例：

```json
{
  "mcpServers": {
    "yuance": {
      "command": "node",
      "args": [
        "/Users/your-user/.yuance-mcp/yuance-mcp-server.mjs"
      ],
      "env": {
        "YUANCE_BASE_URL": "https://yuance.quanxinfu.com",
        "YUANCE_API_TOKEN": "yuance_pat_xxx"
      }
    }
  }
}
```

Linux 示例：

```json
{
  "mcpServers": {
    "yuance": {
      "command": "node",
      "args": [
        "/home/your-user/.yuance-mcp/yuance-mcp-server.mjs"
      ],
      "env": {
        "YUANCE_BASE_URL": "https://yuance.quanxinfu.com",
        "YUANCE_API_TOKEN": "yuance_pat_xxx"
      }
    }
  }
}
```

Windows 示例：

```json
{
  "mcpServers": {
    "yuance": {
      "command": "node",
      "args": [
        "C:\\Users\\your-user\\.yuance-mcp\\yuance-mcp-server.mjs"
      ],
      "env": {
        "YUANCE_BASE_URL": "https://yuance.quanxinfu.com",
        "YUANCE_API_TOKEN": "yuance_pat_xxx"
      }
    }
  }
}
```

## 5. 验证

配置完成后，让 AI 调用：

```text
yuance_list_projects
```

如果返回项目列表或空列表，说明 MCP 通道和 PAT 都可用。

如果返回 `401 unauthorized`：

- 检查 `YUANCE_API_TOKEN` 是否完整复制。
- 检查 Token 是否已撤销或过期。

如果返回 `403 forbidden`：

- 检查 Token scope 是否包含当前工具需要的权限。
- 检查当前用户在元策内是否具备对应项目或工作项权限。

## 6. 受保护资料规则

AI Agent 必须遵守：

```text
如果 resource.is_protected = true：
- 默认只展示标题、分类、创建人、更新时间、受保护状态。
- 不展示正文。
- 不展示附件 URL。
- 不尝试绕过访问密码。
- 只有用户明确授权并提供该条资料密码时，才调用 yuance_unlock_project_resource。
- access_password 只用于本次请求，不缓存，不输出，不写日志。
```

## 7. 可用工具

```text
yuance_list_projects
yuance_get_project
yuance_list_work_items
yuance_get_work_item
yuance_list_work_item_comments
yuance_create_work_item_comment
yuance_handoff_work_item          流转 / 指派工作项
yuance_list_project_resources
yuance_get_project_resource
yuance_unlock_project_resource
yuance_list_notifications
```

## 8. Skill 与 Playbook 的推荐用法

推荐执行顺序：

```text
1. 先加载 yuance-agent Skill 或 ai-agent-playbook
2. 再让 AI 调用元策 MCP 工具
3. 需要确认字段或响应结构时，再回看 OpenAPI
```

这样做的好处是：

- AI 不会一上来就盲目全量扫项目
- AI 知道什么时候先读评论再流转
- AI 知道受保护资料必须停下要密码
- AI 知道项目分析、工作项处理、消息通知的推荐调用顺序

## 9. OpenAPI 文档

在线文档入口：

```text
/web/api-docs
```

机器可读契约：

```text
/api/openapi.json
```
