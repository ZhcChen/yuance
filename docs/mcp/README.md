---
title: 元策 AI / MCP 文档索引
type: guide
status: active
date: 2026-07-15
---

# 元策 AI / MCP 文档索引

这是元策 AI 接入相关文档的统一索引。

当前正式支持的接入口径：

```text
只支持 Codex CLI
```

所以如果你是第一次接入，先看：

```text
docs/mcp/codex-cli-setup.md
```

## 推荐阅读顺序

### 1. 我要把元策接入到 Codex CLI

按这个顺序看：

```text
1. docs/mcp/codex-cli-setup.md
2. skills/yuance-agent/SKILL.md
3. docs/mcp/ai-agent-playbook.md
4. docs/mcp/agent-output-examples.md
5. mcp/yuance-mcp/README.md
6. docs/openapi/yuance.openapi.json
```

### 2. 我只想先理解整体结构

先看：

```text
docs/mcp/ai-mcp-setup.md
```

它负责说明：

- 当前支持范围
- OpenAPI / MCP / Skill 三层职责
- 安全边界
- 文档入口关系

### 3. 我想看 Codex CLI 的完整初始化步骤

直接看：

```text
docs/mcp/codex-cli-setup.md
```

它已经覆盖：

- 创建 PAT
- 克隆仓库
- 拷贝 MCP 脚本
- 拷贝 Skill
- 配置 `~/.codex/config.toml`
- 重启 Codex CLI
- 最小验证
- 常见错误排查

### 4. 我想知道 Codex CLI 使用元策时应该怎么工作

先看：

```text
skills/yuance-agent/SKILL.md
```

再看：

```text
docs/mcp/ai-agent-playbook.md
docs/mcp/agent-output-examples.md
```

两者关系：

- `SKILL.md`：给 Codex CLI 直接加载
- `ai-agent-playbook.md`：给人看，解释同一套工作流
- `agent-output-examples.md`：给人看，展示输出样子

### 5. 我想改 MCP 工具实现

先看：

```text
mcp/yuance-mcp/README.md
docs/mcp/mcp-development-guidelines.md
docs/mcp/mcp-tool-change-checklist.md
mcp/yuance-mcp/yuance-mcp-server.mjs
```

配套示例：

```text
mcp/yuance-mcp/examples/codex.toml
mcp/yuance-mcp/examples/codex.json
```

### 6. 我想确认接口契约或状态枚举

看：

```text
docs/openapi/yuance.openapi.json
```

线上机器可读地址：

```text
/api/openapi.json
```

在线文档：

```text
/web/api-docs
```

## 文档分工

### `docs/mcp/README.md`

索引文档。

### `docs/mcp/ai-mcp-setup.md`

总览文档。

### `docs/mcp/codex-cli-setup.md`

Codex CLI 初始化主入口。

### `docs/mcp/ai-agent-playbook.md`

Codex CLI 工作流说明。

### `docs/mcp/agent-output-examples.md`

Codex CLI 输出样例。

### `skills/yuance-agent/SKILL.md`

Codex CLI 的行为层规则。

### `mcp/yuance-mcp/README.md`

MCP 工具层说明。

### `docs/mcp/mcp-development-guidelines.md`

MCP 工具开发约束。

### `docs/mcp/mcp-tool-change-checklist.md`

MCP 工具变更勾选清单。

### `docs/openapi/yuance.openapi.json`

OpenAPI 契约层。

## 一句话导航

```text
接入看 codex-cli-setup
理解整体看 ai-mcp-setup
理解工作流看 SKILL + playbook
看输出样子看 agent-output-examples
改工具看 mcp/yuance-mcp
改工具规则看 mcp-development-guidelines
改工具执行清单看 mcp-tool-change-checklist
查契约看 openapi
```
