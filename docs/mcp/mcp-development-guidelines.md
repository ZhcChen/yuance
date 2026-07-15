---
title: 元策 MCP 开发约束
type: guide
status: active
date: 2026-07-15
---

# 元策 MCP 开发约束

本文档面向维护者。

目标是约束元策 MCP 工具后续的新增、修改和发布方式，避免工具能力、OpenAPI 契约、Skill 工作流和实际服务端行为逐渐漂移。

如果你只是接入使用，不看这份文档，先看：

```text
docs/mcp/codex-cli-setup.md
```

如果你是要修改 MCP 工具实现，先看：

```text
docs/mcp/README.md
```

如果你想直接按勾选项执行，而不是先读整篇说明，再看：

```text
docs/mcp/mcp-tool-change-checklist.md
```

## 1. 适用范围

本约束适用于：

- `mcp/yuance-mcp/yuance-mcp-server.mjs`
- `mcp/yuance-mcp/README.md`
- `mcp/yuance-mcp/examples/*`
- 与 MCP 工具语义直接相关的 Skill、Playbook、OpenAPI 和接入文档

## 2. 当前架构边界

元策 AI 接入分三层：

```text
OpenAPI  = 契约层
MCP      = 工具层
Skill    = 行为层
```

约束如下：

- OpenAPI 负责接口契约，不负责 AI 调用策略。
- MCP 负责稳定暴露工具，不负责替用户做复杂业务判断。
- Skill 负责工作流和输出模板，不负责替代真实接口校验。

不要把本该由 Skill 承担的决策硬塞进 MCP。

## 3. 工具设计原则

### 3.1 一工具一职责

每个工具只做一类明确动作，例如：

- 列表查询
- 单条详情
- 发表评论
- 流转 / 指派
- 资料解锁

不要把多个业务步骤捆绑成一个黑盒工作流工具。

### 3.2 优先显式参数

能显式传入的上下文就显式传入，不要依赖隐式猜测。

例如：

- `project_key`
- `item_key`
- `resource_id`
- `status`
- `assignee_username`
- `parent_comment_id`

### 3.3 读写分离

默认保持：

- 列表类工具只读
- 详情类工具只读
- 评论 / 流转 / 解锁类工具只写或显式变更

不要为了“方便”把读取和写入耦合成同一个工具。

### 3.4 工具名稳定

工具名统一保持：

```text
yuance_<domain>_<action>
```

例如：

- `yuance_list_projects`
- `yuance_get_work_item`
- `yuance_create_work_item_comment`

不要随意重命名现有工具；如必须调整，先补兼容迁移说明。

## 4. 输入 Schema 约束

所有工具输入统一用 Zod 定义，并遵守：

- 必须给出中文 `describe(...)`
- 有边界的枚举优先用 `z.enum(...)`
- 分页参数要限制最小值和最大值
- ID 型参数要显式声明 `.min(1)` 或 `.int()`
- 可空字符串不应混同于未传值

默认规则：

- 安全默认值可以保留
- 会改变业务语义的默认值要谨慎
- 不要让默认值偷偷替用户做重要决策

## 5. 请求与传输约束

### 5.1 只走 HTTP API

MCP server 不允许：

- 直连数据库
- 读取服务端私有存储
- 绕过 OpenAPI / API 权限边界

统一通过：

```text
yuanceRequest(...)
```

访问服务端。

### 5.2 统一 envelope 处理

服务端成功响应统一优先取：

```text
payload.data
```

服务端错误响应统一优先取：

```text
payload.error.code
payload.error.message
```

不要在某个新工具里另写一套不一致的 envelope 解析逻辑。

### 5.3 stdout / stderr 约束

MCP server 必须保持：

- stdout 只用于 MCP JSON-RPC
- 日志只写 stderr

不要把调试日志写到 stdout。

## 6. 错误处理约束

统一原则：

- 尽量把服务端业务错误原样传给调用方
- 不要吞掉错误
- 不要把权限错误伪装成空数据
- 不要盲目自动重试业务错误

当前模式：

- `YuanceApiError`
- `errorResult(error)`
- `registerTool(..., async (args) => { try ... catch ... })`

新增工具时沿用这一套，不要自己发明另一套返回格式。

## 7. 安全约束

### 7.1 Token

- 只从环境变量读取 `YUANCE_API_TOKEN`
- 不把 token 写进仓库示例外的任何文件
- 不把 token 打到日志

### 7.2 受保护资料

如果资料受保护：

- 默认只返回元信息
- 默认不返回正文
- 默认不返回受保护附件地址
- 只有用户明确授权并提供密码时，才允许解锁
- 不缓存 `access_password`
- 不输出 `access_password`
- 不写日志

### 7.3 不在工具层越权推断

MCP 工具层不要：

- 猜目标状态
- 猜处理人
- 猜资料密码
- 猜评论回复对象

这些都应该由调用者显式提供，或在 Skill 中先进入阻塞说明。

## 8. 文档同步约束

只要 MCP 工具新增、删除、重命名或改变语义，至少检查这些文件是否需要同步：

- `mcp/yuance-mcp/README.md`
- `mcp/yuance-mcp/examples/codex.toml`
- `docs/mcp/README.md`
- `docs/mcp/codex-cli-setup.md`
- `docs/mcp/ai-agent-playbook.md`
- `skills/yuance-agent/SKILL.md`
- `docs/openapi/yuance.openapi.json`

如果改动只影响实现、不影响外部能力，也至少更新 README 中的实现说明。

## 9. 开发前检查

在新增或修改工具前，先确认：

1. 这个能力是否已经有现成工具
2. 这个能力是否真的应该放在 MCP，而不是 Skill
3. 这个能力是否已经有 OpenAPI 支撑
4. 这个能力是否涉及新的 scope / 权限 / 安全边界
5. 这个能力是否需要同步输出模板或工作流说明

## 10. 提交前验证

至少执行：

```bash
cd mcp/yuance-mcp
npm run check
```

以及在仓库根目录执行：

```bash
git diff --check
```

如果改到了契约或文档，还应补：

```bash
node -e 'JSON.parse(require("fs").readFileSync("docs/openapi/yuance.openapi.json","utf8"))'
```

如果改到了服务端 API 语义，还应补对应的 Rust 测试或最小回归验证。

## 11. 一句话原则

```text
MCP 保持原子、显式、可审计；
Skill 负责流程；
OpenAPI 负责契约；
安全边界永远优先于“方便”。
```
