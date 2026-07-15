---
title: 元策 MCP 工具变更 Checklist
type: guide
status: active
date: 2026-07-15
---

# 元策 MCP 工具变更 Checklist

这是一份可直接照着执行的勾选版 checklist。

适用场景：

- 新增 MCP 工具
- 修改已有 MCP 工具参数
- 修改已有 MCP 工具语义
- 修改与 MCP 工具直接相关的文档、Skill 或 OpenAPI 描述

如果你想看原则说明，先看：

```text
docs/mcp/mcp-development-guidelines.md
```

如果你现在要实际改工具，就直接按下面 checklist 逐项检查。

## 1. 需求与边界确认

- [ ] 这次改动的目标能力已经描述清楚。
- [ ] 已确认现有工具里没有完全等价的能力。
- [ ] 已确认这项能力应该放在 MCP，而不是只放在 Skill / Playbook。
- [ ] 已确认它不会绕过现有 OpenAPI / API 权限边界。
- [ ] 已确认它不需要直连数据库或读取服务端私有状态。

## 2. 工具命名检查

- [ ] 工具名遵循 `yuance_<domain>_<action>`。
- [ ] 如果是新增工具，名字和现有工具不会冲突。
- [ ] 如果是改名，已经评估兼容性和迁移影响。
- [ ] 如果只是语义变化但工具名不变，README 和文档里已同步解释新语义。

## 3. 输入 Schema 检查

- [ ] 输入使用 Zod 定义。
- [ ] 每个字段都有中文 `describe(...)`。
- [ ] 枚举类字段优先用 `z.enum(...)`。
- [ ] 分页参数有限制，例如 `min(1)`、`max(100)`。
- [ ] ID 参数有明确约束，例如 `.min(1)` 或 `.int()`。
- [ ] 不把重要业务决策藏进危险默认值。
- [ ] 可选字段和空字符串语义已经区分清楚。

## 4. 读写边界检查

- [ ] 列表查询工具保持只读。
- [ ] 详情工具保持只读。
- [ ] 写操作工具只做单一写动作。
- [ ] 没有把多个业务步骤硬捆绑成一个黑盒工具。
- [ ] 没有把“先读后写”的业务流程硬塞进工具内部。

## 5. 安全边界检查

### Token

- [ ] `YUANCE_API_TOKEN` 只从环境变量读取。
- [ ] 没有把 token 写进仓库文档正文、示例之外的配置或日志。

### 受保护资料

- [ ] 默认不返回受保护资料正文。
- [ ] 默认不返回受保护附件地址。
- [ ] 只有显式密码参数时才做解锁。
- [ ] `access_password` 不缓存、不输出、不写日志。

### 业务推断

- [ ] 工具没有偷偷猜目标状态。
- [ ] 工具没有偷偷猜处理人。
- [ ] 工具没有偷偷猜评论回复对象。
- [ ] 工具没有偷偷猜资料密码。

## 6. 实现检查

- [ ] 请求统一走 `yuanceRequest(...)`。
- [ ] 成功响应统一按 `payload.data` 取值。
- [ ] 错误响应统一按 `payload.error.code` / `payload.error.message` 处理。
- [ ] 日志只写 stderr，不污染 stdout。
- [ ] 沿用现有 `YuanceApiError` / `errorResult(...)` / `registerTool(...)` 模式。
- [ ] 没有在单个工具里发明新的返回格式。

## 7. 文档同步检查

至少检查下面这些文件是否需要同步：

- [ ] `mcp/yuance-mcp/README.md`
- [ ] `docs/mcp/README.md`
- [ ] `docs/mcp/mcp-development-guidelines.md`
- [ ] `docs/mcp/codex-cli-setup.md`
- [ ] `docs/mcp/ai-agent-playbook.md`
- [ ] `docs/mcp/agent-output-examples.md`
- [ ] `skills/yuance-agent/SKILL.md`
- [ ] `docs/openapi/yuance.openapi.json`
- [ ] `mcp/yuance-mcp/examples/codex.toml`（如果配置方式受影响）
- [ ] `mcp/yuance-mcp/examples/codex.json`（如果示例需要同步）

## 8. Skill / Playbook 同步检查

- [ ] 如果新增工具会改变推荐工作流，已同步 `skills/yuance-agent/SKILL.md`。
- [ ] 如果新增工具会改变人类可读工作流说明，已同步 `docs/mcp/ai-agent-playbook.md`。
- [ ] 如果新增工具会影响输出方式或推荐回答风格，已同步 `docs/mcp/agent-output-examples.md`。

## 9. OpenAPI 同步检查

- [ ] 已确认这个工具背后的服务端接口在 OpenAPI 中有对应描述。
- [ ] 如果参数、响应或状态枚举发生变化，已同步 `docs/openapi/yuance.openapi.json`。
- [ ] 如果只是 Skill / MCP 层变化而契约没变，已明确确认无需改 OpenAPI。

## 10. 本地验证检查

至少执行：

- [ ] `cd mcp/yuance-mcp && npm run check`
- [ ] `git diff --check`

如果改到 OpenAPI 或相关文档：

- [ ] `node -e 'JSON.parse(require("fs").readFileSync("docs/openapi/yuance.openapi.json","utf8"))'`

如果改到服务端接口语义：

- [ ] 已执行对应 Rust 测试或最小回归验证。

## 11. 提交前自问

- [ ] 这个工具是不是足够原子？
- [ ] 调用方是否能明确知道它会做什么？
- [ ] 是否把本该由 Skill 决定的内容错误下沉到了 MCP？
- [ ] 安全边界是否仍然清晰？
- [ ] 文档是否能让下一个维护者看懂这次改动？

## 12. 推荐提交说明

如果这次主要是工具能力变化，提交说明可参考：

```text
feat: 新增元策 MCP xxx 工具
```

如果这次主要是工具语义修正，提交说明可参考：

```text
fix: 调整元策 MCP xxx 工具语义
```

如果这次主要是补文档或约束，提交说明可参考：

```text
docs: 补充元策 MCP xxx 文档
```

## 13. 一句话执行口径

```text
先过 checklist，再改代码；
先保边界，再谈方便；
先同步文档，再结束提交。
```
