---
title: 元策 Codex CLI 初始化流程
type: guide
status: active
date: 2026-07-15
---

# 元策 Codex CLI 初始化流程

本文档只面向 Codex CLI。

如果你想先看完整文档导航，再回到本文执行，先看：

```text
docs/mcp/README.md
```

目标是让接入方机器上的 Codex CLI 同时具备这三层能力：

```text
OpenAPI  = 契约层
MCP      = 工具层
Skill    = 行为层
```

也就是：

- OpenAPI 负责说明元策接口。
- MCP 负责让 Codex CLI 直接调用元策能力。
- Skill 负责让 Codex CLI 知道先读什么、后写什么、什么时候需要停下确认。

如果你只打算支持 Codex CLI，这份文档就是主入口。

## 0. 前置条件

接入前需要准备：

- 已安装 `git`
- 已安装 `node` 和 `npm`
- 已安装 Codex CLI
- 已能访问元策服务，例如 `https://yuance.quanxinfu.com`
- 已在元策个人中心创建 `yuance_pat_*` Token

推荐 Token scope：

```text
project:read
work_item:read
comment:write
work_item:write
resource:read
resource:unlock
notification:read
```

创建 Token 的页面：

```text
/web/me
```

## 1. 克隆仓库

```bash
git clone https://github.com/ZhcChen/yuance.git
cd yuance
```

后续下面的复制命令，都默认你当前就在仓库根目录。

## 2. 拷贝 MCP 脚本到本机固定目录

macOS / Linux：

```bash
rm -rf ~/.yuance-mcp
mkdir -p ~/.yuance-mcp
cp -R mcp/yuance-mcp/. ~/.yuance-mcp/
cd ~/.yuance-mcp
npm install
npm run check
```

Windows PowerShell：

```powershell
Remove-Item -Recurse -Force "$env:USERPROFILE\.yuance-mcp" -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force "$env:USERPROFILE\.yuance-mcp"
Copy-Item -Recurse -Force "mcp\yuance-mcp\*" "$env:USERPROFILE\.yuance-mcp\"
cd "$env:USERPROFILE\.yuance-mcp"
npm install
npm run check
```

执行完成后，本机会有一个独立的 MCP 目录，例如：

```text
~/.yuance-mcp/yuance-mcp-server.mjs
```

## 3. 拷贝项目 Skill

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

执行完成后，本机会有：

```text
~/.codex/skills/yuance-agent/SKILL.md
```

这个 Skill 的作用是：

- 让 Codex CLI 优先按元策推荐流程工作
- 避免一上来全量扫项目
- 避免不看上下文就直接流转工作项
- 遇到受保护资料时要求停下索取密码

## 4. 设置元策运行时环境变量

MCP server 运行时直接读取当前 Codex CLI 进程环境里的：

- `YUANCE_BASE_URL`
- `YUANCE_API_TOKEN`

推荐由用户自己在本机环境变量中维护，不要把真实 token 写进仓库文件、文档、示例文件或项目内的 `AGENTS.md`。

macOS / Linux（当前终端会话）：

```bash
export YUANCE_BASE_URL="https://yuance.quanxinfu.com"
export YUANCE_API_TOKEN="yuance_pat_xxx"
```

如果希望长期生效，可以写进 `~/.zshrc`、`~/.bashrc` 或你自己的 shell 配置文件，然后重新打开终端，再从这个终端启动 Codex CLI。

Windows PowerShell（当前会话）：

```powershell
$env:YUANCE_BASE_URL = "https://yuance.quanxinfu.com"
$env:YUANCE_API_TOKEN = "yuance_pat_xxx"
```

Windows PowerShell（写入当前用户环境变量）：

```powershell
[Environment]::SetEnvironmentVariable("YUANCE_BASE_URL", "https://yuance.quanxinfu.com", "User")
[Environment]::SetEnvironmentVariable("YUANCE_API_TOKEN", "yuance_pat_xxx", "User")
```

设置完成后，建议先在当前终端确认：

macOS / Linux：

```bash
echo "$YUANCE_BASE_URL"
echo "$YUANCE_API_TOKEN"
```

Windows PowerShell：

```powershell
echo $env:YUANCE_BASE_URL
echo $env:YUANCE_API_TOKEN
```

## 5. 配置 Codex CLI 的 MCP server

Codex CLI 使用：

```text
~/.codex/config.toml
```

如果文件不存在，就新建它。

把下面这段加入 `~/.codex/config.toml`：

macOS 示例：

```toml
[mcp_servers.yuance]
command = "node"
args = ["/Users/your-user/.yuance-mcp/yuance-mcp-server.mjs"]
startup_timeout_sec = 60.0
```

Linux 示例：

```toml
[mcp_servers.yuance]
command = "node"
args = ["/home/your-user/.yuance-mcp/yuance-mcp-server.mjs"]
startup_timeout_sec = 60.0
```

Windows 示例：

```toml
[mcp_servers.yuance]
command = "node"
args = ["C:\\Users\\your-user\\.yuance-mcp\\yuance-mcp-server.mjs"]
startup_timeout_sec = 60.0
```

仓库里也提供了一个参考模板：

```text
mcp/yuance-mcp/examples/codex.toml
```

注意：

- `~/.codex/config.toml` 这里只负责注册 MCP server，不再写死 token。
- `YUANCE_BASE_URL` 与 `YUANCE_API_TOKEN` 由启动 Codex CLI 的环境提供。
- `YUANCE_BASE_URL` 建议指向正式可访问的元策地址。

## 6. 重启 Codex CLI

修改 `~/.codex/config.toml` 后，重启 Codex CLI，再打开新的会话。

这样新的 MCP server 和 Skill 才会被稳定加载。

如果你刚刚调整过环境变量，也要确保 Codex CLI 是从已带这些环境变量的终端里启动的。

## 7. 最小验证

在新的 Codex CLI 会话里，先做最小验证：

```text
调用 yuance_list_projects
```

如果能返回项目列表或空列表，说明以下三层都已经基本就绪：

- Codex CLI 已连上元策 MCP
- `YUANCE_API_TOKEN` 可用
- 元策服务可访问

然后再做第二层验证：

```text
分析某个项目，例如 YCE
```

如果 Codex CLI 会优先按项目上下文读取，而不是直接写入，说明 Skill 也已经生效。

## 8. 推荐使用顺序

Codex CLI 接入元策后，推荐始终按这个顺序工作：

```text
1. 先走 yuance-agent Skill
2. 再调用 yuance MCP 工具
3. 需要确认字段或状态枚举时，再回看 OpenAPI
```

推荐调用习惯：

- 分析项目时先 `yuance_get_project`，再 `yuance_list_work_items`
- 处理工作项时先 `yuance_get_work_item`，再 `yuance_list_work_item_comments`
- 回复时优先用 `yuance_create_work_item_comment`
- 流转或指派时用 `yuance_handoff_work_item`
- 资料受保护时，先停下向用户要密码，再决定是否调用 `yuance_unlock_project_resource`

## 9. 常见问题

### 1) `401 unauthorized`

说明通常是：

- `YUANCE_API_TOKEN` 复制错了
- Token 已删除
- Token 已过期

优先检查：

- 当前启动 Codex CLI 的终端环境里 `YUANCE_API_TOKEN` 是否存在且值正确
- 元策个人中心 Token 状态

### 2) `403 forbidden`

说明通常是：

- Token scope 不够
- Token 项目范围不包含当前项目
- 当前用户自己就没有该项目或该工作项权限

### 3) MCP 没连上

优先检查：

- `node` 是否可执行
- `~/.yuance-mcp/yuance-mcp-server.mjs` 是否存在
- `npm install` 是否完成
- `npm run check` 是否通过
- `~/.codex/config.toml` 的 `[mcp_servers.yuance]` 是否写对
- 当前启动 Codex CLI 的终端环境里 `YUANCE_BASE_URL` 与 `YUANCE_API_TOKEN` 是否存在

### 4) Skill 没生效

优先检查：

- `~/.codex/skills/yuance-agent/SKILL.md` 是否存在
- 是否已经重启 Codex CLI
- 是否在新的会话里执行

### 5) AI 直接去猜密码或越权读取资料

这是不允许的。

元策对受保护资料的规则是：

- 默认不返回正文
- 默认不返回受保护附件地址
- 只有用户明确授权并给出该条资料密码，才允许解锁

## 10. 建议同时阅读

- `docs/mcp/ai-mcp-setup.md`
- `docs/mcp/ai-agent-playbook.md`
- `skills/yuance-agent/SKILL.md`
- `docs/openapi/yuance.openapi.json`
