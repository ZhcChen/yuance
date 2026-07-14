---
title: 元策 MCP 初始化指南
type: guide
status: active
date: 2026-07-14
---

# 元策 MCP 初始化指南

本文档给 AI Agent 和开发者使用。目标是在本机安装一个元策 MCP server，让 AI 能通过元策 OpenAPI 查看项目、需求、任务、Bug、评论、资料库和消息通知。

## 设计约定

- MCP server 是本地 Node.js 脚本，不发布 npm。
- MCP server 不直连数据库，只请求元策 HTTP API。
- 认证使用个人中心创建的 `yuance_pat_*` Personal Access Token。
- 受保护资料默认不返回正文；只有用户明确授权并提供该条资料密码时，才调用解锁工具。

## 1. 在元策创建 Personal Access Token

打开元策：

```text
/web/me
```

点击“创建访问 Token”，建议按 MCP 需要选择最小权限：

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

项目范围可以填写：

```text
all       允许访问当前用户可见的全部项目
YCE       只允许访问 YCE 项目
YCE,OPS   只允许访问 YCE 和 OPS 项目
```

项目范围不会绕过元策自身的项目成员范围、RBAC 和业务权限校验。

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

## 3. 配置 MCP client

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

## 4. 验证

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

## 5. 受保护资料规则

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

## 6. 可用工具

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

## 7. OpenAPI 文档

在线文档入口：

```text
/web/api-docs
```

机器可读契约：

```text
/api/openapi.json
```
