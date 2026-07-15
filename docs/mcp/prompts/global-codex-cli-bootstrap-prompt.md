---
title: 全局 Codex CLI 初始化提示词
type: guide
status: active
date: 2026-07-15
---

# 全局 Codex CLI 初始化提示词

这份提示词用于：

- 在另一台机器上
- 让另一个项目里的 Codex CLI
- 直接开始初始化元策 MCP + Skill 的全局接入

适用范围：

- 一次性机器级初始化
- 全局 `~/.yuance-mcp`
- 全局 `~/.codex/skills/yuance-agent`
- 全局 `~/.codex/config.toml`

如果你要的是项目内使用规则，不要用这份，改用：

```text
docs/mcp/prompts/project-yuance-usage-rules-prompt.md
```

## 使用前替换

默认仓库地址已经写成当前项目官方仓库：

- `https://github.com/ZhcChen/yuance.git`

如果你使用的是 fork、镜像仓库或自托管仓库，再替换为你自己的仓库地址。

先把下面提示词里的这几个占位符替换掉：

- `<YUANCE_BASE_URL>`
- `<YUANCE_PAT_TOKEN>`
- `<LOCAL_CLONE_DIR>`

## 可直接复制的提示词

```text
你现在要在这台机器上，为 Codex CLI 初始化元策 MCP 接入。

目标：
1. 在本机安装元策 MCP 脚本
2. 在本机安装 yuance-agent Skill
3. 在 ~/.codex/config.toml 中注册 yuance MCP server
4. 不破坏现有 Codex CLI 配置
5. 完成后给出“需要重启 Codex CLI”的明确说明

已知信息：
- 元策仓库地址：https://github.com/ZhcChen/yuance.git
- 本地克隆目录：<LOCAL_CLONE_DIR>
- 元策服务地址：<YUANCE_BASE_URL>
- 元策 PAT：<YUANCE_PAT_TOKEN>

执行要求：
- 只按 Codex CLI 口径处理，不考虑其他 AI 客户端。
- 先阅读仓库中的：
  - docs/mcp/README.md
  - docs/mcp/codex-cli-setup.md
- 如果本地还没有仓库，就先 clone 到 <LOCAL_CLONE_DIR>。
- 按文档完成下面动作：
  1. 复制 mcp/yuance-mcp 到 ~/.yuance-mcp
  2. 在 ~/.yuance-mcp 下执行 npm install 和 npm run check
  3. 复制 skills/yuance-agent/SKILL.md 到 ~/.codex/skills/yuance-agent/SKILL.md
  4. 更新 ~/.codex/config.toml，加入 yuance MCP 配置
- MCP 配置要求：
  - server 名称：yuance
  - command：node
  - args 指向 ~/.yuance-mcp/yuance-mcp-server.mjs
  - env 中写入：
    - YUANCE_BASE_URL=<YUANCE_BASE_URL>
    - YUANCE_API_TOKEN=<YUANCE_PAT_TOKEN>
- 修改 ~/.codex/config.toml 时，必须保留已有内容，不要覆盖别的 MCP server 配置。
- 不要把 token 写进仓库文件、文档、README、AGENTS.md 或示例文件。
- 不要输出完整 token 到最终汇报里。
- 完成所有文件和配置修改后，明确告诉我：
  - 已修改了哪些路径
  - 是否需要重启 Codex CLI
  - 重启后如何做最小验证
- 如果当前会话无法热加载新的 MCP 配置，不要假装已经验证通过；应明确说明“需要重启 Codex CLI 后，在新会话中执行 yuance_list_projects 验证”。

最终汇报格式：
- 已完成事项
- 修改的路径
- 需要我手动执行的动作
- 重启后的最小验证步骤
```
