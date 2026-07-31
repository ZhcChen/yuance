# 元策 Codex Skill 安装与迁移

本文说明如何安装、验证和迁移到 `yuance-agent` Codex Skill。Skill 自带预编译 Rust CLI，不要求 Node.js、npm、Rust toolchain 或克隆本仓库。

## 安装

正式安装命令固定到 `yuance-agent-v0.1.1` 标签，避免执行 `main` 上尚未发布的脚本。

macOS / Linux：

```bash
curl -fsSL https://raw.githubusercontent.com/ZhcChen/yuance/yuance-agent-v0.1.1/scripts/install-codex-skill.sh | bash
```

Windows PowerShell：

```powershell
Invoke-RestMethod https://raw.githubusercontent.com/ZhcChen/yuance/yuance-agent-v0.1.1/scripts/install-codex-skill.ps1 | Invoke-Expression
```

默认安装位置：

- 未设置 `CODEX_HOME`：`~/.codex/skills/yuance-agent`
- 已设置 `CODEX_HOME`：`$CODEX_HOME/skills/yuance-agent`

安装器下载与当前系统、CPU 匹配的完整 Skill 包，校验 `SHA256SUMS`，执行离线自检后再替换旧版本。下载、校验、解压或自检失败时保留旧版本。

## 配置 PAT

在元策个人中心创建最小权限 Personal Access Token，并限制项目范围。只读分析至少需要：

```text
project:read
work_item:read
```

按需增加写权限：

```text
work_item:write
comment:write
```

将 Token 放在启动 Codex 的环境中，不要写入 Skill、Codex 配置、仓库文件或命令历史：

```bash
export YUANCE_API_TOKEN="<PAT>"
```

PowerShell 当前会话：

```powershell
$env:YUANCE_API_TOKEN = "<PAT>"
```

CLI 默认连接 `https://yuance.quanxinfu.com`。只有私有部署或测试环境才设置 `YUANCE_BASE_URL`。

## 验证

离线安装验证不需要 Token：

```bash
~/.codex/skills/yuance-agent/scripts/yuance-agent doctor --installation
```

配置 Token 后执行联网验证：

```bash
~/.codex/skills/yuance-agent/scripts/yuance-agent doctor
~/.codex/skills/yuance-agent/scripts/yuance-agent projects list --per-page 5
```

使用 `CODEX_HOME` 或 Windows 时，替换为实际安装目录及 `yuance-agent.exe`。

## 从旧接入迁移

安装器若检测到旧配置，只会显示提示，不会编辑 Codex 配置或删除目录。迁移前先备份配置，并逐项确认。

1. 打开 `${CODEX_HOME:-~/.codex}/config.toml`；Windows 使用 `$env:CODEX_HOME\config.toml`，未设置时检查 `$HOME\.codex\config.toml`。
2. 只删除 `[mcp_servers.yuance]` 表及该表直属字段。遇到下一个 TOML 表头即停止，不要删除其他 server 或全局配置。
3. 确认其他已配置工具仍完整后保存文件。
4. 删除不再使用的 `~/.yuance-mcp`；Windows 对应 `$HOME\.yuance-mcp`。需要回退时可先改名备份。
5. 重新启动 Codex，让 Skill 清单和配置重新加载。
6. 在新会话运行离线及联网验证，再执行一次项目查询。

不要让安装器或批处理脚本自动重写整个 `config.toml`。旧目录和配置表互相独立，必须分别确认后清理。

## 升级与回滚

安装历史版本时显式指定版本：

```bash
YUANCE_AGENT_VERSION=0.1.1 bash install-codex-skill.sh
```

```powershell
$env:YUANCE_AGENT_VERSION = "0.1.1"
./install-codex-skill.ps1
```

安装器始终从同版本 Release 读取 Skill 与 CLI，不混用 `main` 文件。回滚与升级执行相同流程，只改变版本。

## 故障排查

- `missing_api_token`：启动 Codex 的环境没有 `YUANCE_API_TOKEN`。
- `401`：PAT 无效、过期或已删除。
- `403`：PAT scope、项目范围或业务权限不足。
- `404`：对象不存在或对当前 Token 不可见。
- `dns` / `connect` / `tls`：检查网络、服务地址和证书，不关闭 TLS 校验。
- 状态机错误：重新读取工作项详情和评论，确认目标状态后再操作，不盲目重试。

完整命令与行为边界随 Skill 一起安装在 `references/` 中。
