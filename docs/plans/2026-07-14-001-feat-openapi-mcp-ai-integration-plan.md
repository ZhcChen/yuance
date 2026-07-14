---
title: feat: OpenAPI 在线文档与 MCP AI 集成
type: feat
status: completed
date: 2026-07-14
---

# feat: OpenAPI 在线文档与 MCP AI 集成

## Overview

为元策补齐面向程序化调用和 AI Agent 的开放接口说明能力：

- 提供机器可读的 OpenAPI 3.1 契约，并通过在线文档页面展示。
- 使用 Scalar 作为 API Reference UI，保持现代、清爽的文档体验。
- 新增本项目内置的本地 MCP server 脚本，不上传 npm；AI Agent 通过克隆开源仓库、复制脚本、本地 `node` 启动的方式接入。
- 补齐适合 MCP 使用的 Personal Access Token（PAT）认证，避免 AI 工具依赖 Web Cookie + CSRF。
- 对资料库中带访问密码的记录保持默认不泄露正文；只有用户明确提供该条资料密码时才允许解锁读取。

## Problem Frame

现有 `/api/v1` 接口只有手写 runbook，缺少标准 OpenAPI 描述、在线交互文档和 AI Agent 可直接理解的接入说明。现有认证主要服务浏览器 Web 会话，MCP 作为本地工具进程需要稳定的 token 认证方式。用户希望后续 AI 能直接查看需求、任务、Bug、项目资料，并基于这些上下文辅助分析和开发。

## Requirements Trace

- R1. API 文档需要在线可访问，并采用更现代的 UI；当前决策为 Scalar。
- R2. 需要新增机器可读 OpenAPI 契约，覆盖 MCP 需要的核心读取与少量写入接口。
- R3. MCP 不上传 npm；仓库内置 Node.js 脚本，文档指导 AI clone 仓库并复制脚本到本机稳定目录。
- R4. MCP server 不直连数据库，只通过 OpenAPI/API 调用元策服务。
- R5. MCP 接入要使用 PAT，不依赖浏览器 Cookie/CSRF。
- R6. 受保护资料默认只返回元信息，不返回正文、附件下载地址或尝试绕过密码；只有用户明确授权并提供单条资料密码时才解锁。
- R7. 文档要足够清晰，让 AI Agent 能自行完成初始化、配置和调用。

## Scope Boundaries

- 第一版不做 npm 发布、不做远程 Streamable HTTP MCP server。
- 第一版 MCP server 只覆盖项目、工作项、评论、资料库、通知等核心工具；管理类系统接口不暴露给 MCP。
- 第一版 OpenAPI 优先覆盖已有稳定 API 与本次新增的 PAT / 资料解锁 API，不追求一次性描述全部历史边缘接口的所有字段。
- 第一版 Scalar 可通过 CDN 集成；生产完全离线 vendoring 可作为后续优化。
- MCP 不缓存资料访问密码，不记录密码，不自行重试或猜测密码。

## Context & Research

### Relevant Code and Patterns

- `api/src/web/router.rs` 统一注册 Web、静态文件和 `/api/v1` 路由。
- `api/src/web/api/mod.rs` 已有 JSON envelope、Cookie session 认证、CSRF 校验、项目范围鉴权和资料库保护逻辑。
- `api/src/web/response.rs` 定义统一成功 envelope：`{ "data": ... }`。
- `api/src/platform/error.rs` 定义统一错误 envelope：`{ "error": { "code", "message" } }`。
- `api/migrations/` 使用 sqlx migrator 管理 SQLite schema。
- `docs/runbooks/api-v1-contract.md` 是当前手写 API 契约说明，`api/tests/routing_smoke.rs` 已校验该文档与路由路径的一致性。
- `api/templates/layouts/web.html`、`api/templates/web/me.html` 可承载 PAT 管理入口。

### Institutional Learnings

- 当前仓库未发现 `docs/solutions/` 历史经验文档。

### External References

- Scalar 官方文档支持在 HTML 中通过 `Scalar.createApiReference('#app', { url: '/api/openapi.json' })` 嵌入 API Reference。
- MCP TypeScript SDK 官方文档推荐用 `McpServer` 注册 tools，并通过 `StdioServerTransport` / `serveStdio` 提供本地 stdio transport；日志应写 stderr，避免污染 stdout JSON-RPC 流。
- OpenAPI 采用 3.1 结构：`info`、`servers`、`paths`、`components.schemas`、`securitySchemes`、`tags`、`externalDocs`。

## Key Technical Decisions

- **OpenAPI 契约作为仓库内静态 JSON/YAML 源文件维护。** 第一版直接将 `docs/openapi/yuance.openapi.json` 作为源文件，由 API 进程 `include_str!` 暴露 `/api/openapi.json`，避免引入 Rust 侧 OpenAPI 生成器导致实现范围膨胀。
- **在线文档使用独立页面 `/web/api-docs`。** 该页面上方提供 MCP 初始化说明入口，下方嵌入 Scalar；和 Web 主布局解耦，避免常规业务页面样式污染文档 UI。
- **PAT 与 session 并存。** 读请求可使用 `Authorization: Bearer <token>`；写请求如果使用 Bearer PAT 则跳过 CSRF，Cookie session 写请求仍保留 CSRF 要求。
- **PAT 只保存哈希。** token 只在创建成功时展示一次；数据库保存 SHA-256 哈希、名称、scope、项目范围、过期/撤销状态和最近使用时间。
- **MCP server 通过 HTTP API 调用服务。** 配置仅依赖 `YUANCE_BASE_URL` 与 `YUANCE_API_TOKEN`，工具调用时统一处理 envelope、错误 envelope 和鉴权失败。
- **受保护资料分两步。** 常规 `get_resource` 遇到受保护资料只返回元信息；新增显式 `unlock_project_resource` 工具，要求调用参数包含用户提供的 `access_password`，服务端验证后返回正文。

## Open Questions

### Resolved During Planning

- **Scalar / Swagger UI / Redoc 选型：** 选择 Scalar，视觉更现代，符合当前项目 UI 优化方向。
- **MCP 分发方式：** 不发布 npm，随开源仓库内置脚本；AI clone 仓库并复制 `mcp/yuance-mcp/` 到本地稳定目录后用 `node` 启动。
- **MCP 是否直连数据库：** 不直连，只请求 OpenAPI/API，保证权限、审计和数据保护语义一致。

### Deferred to Implementation

- **OpenAPI 覆盖深度：** 实现时根据现有 API 类型和测试快速补齐核心 schema，非 MCP 关键接口可以先保留概要级描述。
- **Scalar 资源托管：** 第一版可用 CDN；若部署环境要求完全内网可用，再将 Scalar 静态资源 vendor 到 `api/static/vendor/`。
- **PAT scope 细粒度强制：** 第一版应至少校验是否存在对应 scope；后续可按每个 endpoint 的业务权限继续细化到项目级最小权限。

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```mermaid
flowchart TB
  User[用户 / AI Agent] --> Docs[/web/api-docs]
  Docs --> Spec[/api/openapi.json]
  Docs --> Guide[docs/mcp/ai-mcp-setup.md]
  User --> PAT[个人中心创建 PAT]
  PAT --> TokenHash[(api_tokens)]
  Agent[MCP client] --> LocalMcp[node mcp/yuance-mcp]
  LocalMcp --> Api[/api/v1]
  Api --> Auth[Cookie session 或 Bearer PAT]
  Auth --> Domain[现有 domains 权限与业务逻辑]
  Domain --> Protected{资料是否受保护}
  Protected -->|否| Body[返回正文]
  Protected -->|是且无密码| Meta[只返回元信息]
  Protected -->|显式密码验证| Unlock[返回正文]
```

## Implementation Units

- [x] **Unit 1: OpenAPI 契约与在线文档页面**

**Goal:** 新增 OpenAPI 3.1 JSON 文件，暴露 `/api/openapi.json`，并提供 `/web/api-docs` Scalar 页面。

**Requirements:** R1, R2, R7

**Dependencies:** None

**Files:**
- Create: `docs/openapi/yuance.openapi.json`
- Modify: `api/src/web/router.rs`
- Modify: `api/src/web/user/mod.rs`
- Create: `api/templates/web/api_docs.html`
- Test: `api/tests/routing_smoke.rs`

**Approach:**
- 使用仓库内静态 OpenAPI JSON 作为契约源。
- `/api/openapi.json` 返回 `application/json`，不要求登录，方便公开文档读取。
- `/web/api-docs` 使用独立 Askama 模板嵌入 Scalar CDN，并展示 MCP 初始化文档链接。
- OpenAPI `externalDocs` 指向 `docs/mcp/ai-mcp-setup.md` 或在线页面说明。

**Patterns to follow:**
- `api/src/web/router.rs` 中静态资源和 API route 注册方式。
- `api/tests/routing_smoke.rs` 中对静态文件和 API 文档契约的 smoke 测试风格。

**Test scenarios:**
- Happy path: `GET /api/openapi.json` 返回 200，body 包含 `"openapi":"3.1.0"`、`"/api/v1/projects"` 和 security scheme。
- Happy path: `GET /web/api-docs` 返回 200，页面包含 Scalar 初始化和 `/api/openapi.json`。
- Error path: OpenAPI JSON 文件保持可解析，避免上线后 Scalar 白屏。

**Verification:**
- 在线文档页面能加载并指向正确 OpenAPI URL。
- OpenAPI 文件覆盖 MCP 需要的核心接口分组。

- [x] **Unit 2: PAT 数据模型、领域逻辑与认证接入**

**Goal:** 新增 Personal Access Token 创建、列表、撤销能力，并让 `/api/v1` 支持 `Authorization: Bearer` 认证。

**Requirements:** R4, R5

**Dependencies:** Unit 1 可并行；写接口跳过 CSRF 依赖本单元。

**Files:**
- Create: `api/migrations/202607140001_create_api_tokens.sql`
- Create: `api/src/domains/api_tokens.rs`
- Modify: `api/src/domains/mod.rs`
- Modify: `api/src/web/api/mod.rs`
- Modify: `api/src/web/router.rs`
- Test: `api/tests/auth_security_flow.rs`
- Test: `api/tests/project_management_flow.rs`

**Approach:**
- PAT token 使用不可逆随机值，返回形如 `yuance_pat_<random>` 的明文，只展示一次。
- `api_tokens` 存储 `token_hash`、`user_id`、`name`、`scopes`、`project_scope`、`expires_at`、`revoked_at`、`last_used_at`。
- `require_api_user` 同时支持 Cookie session 与 Bearer PAT；Bearer PAT 认证成功后更新 `last_used_at`。
- `ensure_api_csrf` 对 Bearer PAT 请求视为已通过非 Cookie 认证，Cookie session 保持原 CSRF 约束。
- Scope 校验先覆盖 MCP 所需入口：`project:read`、`work_item:read`、`work_item:write`、`comment:write`、`resource:read`、`resource:unlock`、`notification:read`；业务权限/RBAC 仍继续执行。

**Patterns to follow:**
- `api/src/domains/auth.rs` 的 token 哈希和用户加载模式。
- `api/src/domains/users.rs` 的用户管理领域函数拆分方式。
- `api/src/web/api/mod.rs` 现有 envelope、audit、权限校验方式。

**Test scenarios:**
- Happy path: 已登录用户创建 PAT，响应只返回一次 token 明文，列表只返回 token 元信息和后缀提示。
- Happy path: 使用 `Authorization: Bearer <token>` 调用 `GET /api/v1/projects` 成功且不需要 Cookie。
- Happy path: 使用 Bearer PAT 创建评论或更新工作项时不需要 CSRF，但仍受业务权限限制。
- Error path: 无效、过期、撤销 token 返回 401。
- Error path: 缺少所需 scope 的 token 返回 403。
- Integration: Cookie session 写请求缺少 CSRF 仍返回 403，避免 PAT 改造削弱浏览器 CSRF 防线。

**Verification:**
- PAT 与原 Cookie session 两套认证都可用，且错误 envelope 保持一致。

- [x] **Unit 3: 个人中心 PAT 管理 UI**

**Goal:** 在个人中心提供创建、查看、撤销 PAT 的最小可用 UI，并提示 token 只显示一次。

**Requirements:** R5, R7

**Dependencies:** Unit 2

**Files:**
- Modify: `api/src/web/user/mod.rs`
- Modify: `api/templates/web/me.html`
- Modify: `api/src/web/router.rs`
- Test: `api/tests/auth_security_flow.rs`

**Approach:**
- 个人中心展示 token 列表：名称、scope、项目范围、过期时间、最后使用、状态。
- 创建表单支持名称、scope 多选、过期时间；第一版项目范围可先填项目 key 或 all。
- 创建成功通过页面提示展示一次明文 token，并提醒用户立即复制。
- 撤销操作保留记录，不物理删除。

**Patterns to follow:**
- `api/templates/web/me.html` 现有个人资料/密码表单结构。
- `api/src/web/user/mod.rs` 个人中心 post handler 和 toast/redirect 风格。

**Test scenarios:**
- Happy path: 个人中心渲染 PAT 管理块和创建表单。
- Happy path: 创建 PAT 后页面显示 `yuance_pat_` 开头 token 一次。
- Happy path: 撤销 PAT 后列表状态变为已撤销，后续 Bearer 调用返回 401。
- Error path: token 名称为空、scope 为空或过期时间非法时给出业务错误。

**Verification:**
- 普通用户无需系统管理权限即可管理自己的 PAT。

- [x] **Unit 4: 资料库显式解锁 API**

**Goal:** 为受保护资料提供 API 级显式密码验证入口，供 MCP 在用户授权时读取正文。

**Requirements:** R4, R6

**Dependencies:** Unit 2

**Files:**
- Modify: `api/src/web/api/mod.rs`
- Modify: `api/src/web/router.rs`
- Modify: `docs/openapi/yuance.openapi.json`
- Test: `api/tests/project_management_flow.rs`

**Approach:**
- 新增 `POST /api/v1/projects/{project_key}/resources/{resource_id}/unlock`，请求体包含 `access_password`。
- 未受保护资料直接返回详情；受保护资料密码正确才返回正文。
- Bearer PAT 调用该接口需要 `resource:unlock` scope；普通 `GET` 受保护资料仍不返回正文。
- 错误返回不区分密码错误与未授权过多细节，避免泄露保护状态之外的信息。

**Patterns to follow:**
- Web 侧 `project_resource_unlock` 现有密码验证语义。
- `project_resources::verify_resource_password` 领域函数。

**Test scenarios:**
- Happy path: 正确访问密码返回受保护资料正文。
- Error path: 普通 `GET` 受保护资料仍返回 403 或仅元信息，不泄露正文。
- Error path: 错误密码返回 403/400 且不返回正文。
- Integration: PAT 缺少 `resource:unlock` scope 时即使密码正确也无法解锁。

**Verification:**
- MCP 可在用户显式提供密码后读取单条受保护资料正文。

- [x] **Unit 5: 本地 MCP server 与初始化文档**

**Goal:** 新增可复制到本机运行的 Node.js MCP server、示例配置和面向 AI 的初始化指南。

**Requirements:** R3, R4, R6, R7

**Dependencies:** Unit 1, Unit 2, Unit 4

**Files:**
- Create: `mcp/yuance-mcp/package.json`
- Create: `mcp/yuance-mcp/yuance-mcp-server.mjs`
- Create: `mcp/yuance-mcp/README.md`
- Create: `mcp/yuance-mcp/examples/codex.json`
- Create: `mcp/yuance-mcp/examples/claude-desktop.json`
- Create: `docs/mcp/ai-mcp-setup.md`
- Modify: `docs/openapi/yuance.openapi.json`
- Test: `mcp/yuance-mcp/yuance-mcp-server.mjs`

**Approach:**
- 使用 `@modelcontextprotocol/sdk` 与 stdio transport。
- 工具覆盖：
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
- 所有 HTTP 调用统一通过 `YUANCE_BASE_URL` 与 `YUANCE_API_TOKEN`。
- 工具描述明确受保护资料规则，密码参数只用于本次请求，不缓存、不日志输出。
- 文档写清楚 clone、复制、`npm install`、MCP client 配置和最小验证步骤。

**Patterns to follow:**
- MCP TypeScript SDK 官方 stdio 示例。
- `docs/runbooks/api-v1-contract.md` 当前接口说明风格。

**Test scenarios:**
- Happy path: `node --check mcp/yuance-mcp/yuance-mcp-server.mjs` 通过语法检查。
- Happy path: `package.json` 声明必要依赖和 `start` 脚本。
- Error path: 缺少 `YUANCE_BASE_URL` 或 `YUANCE_API_TOKEN` 时 MCP server 向 stderr 输出明确错误并退出。
- Error path: API 错误 envelope 被转换成 MCP tool 的可读错误信息。

**Verification:**
- AI 按 `docs/mcp/ai-mcp-setup.md` 可完成本地 MCP 初始化并接入元策 API。

- [x] **Unit 6: 契约文档、路由一致性和回归验证**

**Goal:** 更新手写 API runbook、OpenAPI 文档和测试，保证路由/文档/实现一致。

**Requirements:** R1, R2, R7

**Dependencies:** Unit 1-5

**Files:**
- Modify: `docs/runbooks/api-v1-contract.md`
- Modify: `api/tests/routing_smoke.rs`
- Modify: `api/tests/auth_security_flow.rs`
- Modify: `api/tests/project_management_flow.rs`

**Approach:**
- 在 runbook 里补充 PAT、OpenAPI、MCP 相关端点和受保护资料解锁语义。
- 路由 smoke 测试继续校验新增 API 文档路径。
- 针对 Bearer PAT、资料解锁、OpenAPI endpoint、MCP 文件语法增加验证。

**Patterns to follow:**
- `api/tests/routing_smoke.rs` 的路径清单校验。
- `docs/runbooks/api-v1-contract.md` 的中文契约说明格式。

**Test scenarios:**
- Integration: API 契约文档包含新增路由，routing smoke 不再报缺漏。
- Integration: OpenAPI JSON 中包含本次新增路由和 security scheme。
- Regression: 现有 Cookie + CSRF 流程继续通过。

**Verification:**
- 本次涉及 API、认证、文档和 MCP 的最小回归全部通过。

## System-Wide Impact

- **Interaction graph:** 新增 `/api/openapi.json`、`/web/api-docs`、PAT 管理路由、资料解锁 API、本地 MCP 工具脚本；现有 `/api/v1` 业务 handler 尽量复用。
- **Error propagation:** API 仍统一 JSON error envelope；MCP server 将 envelope 转成工具错误文本，不吞掉业务错误。
- **State lifecycle risks:** PAT 只可撤销不可物理删除；token 明文只返回一次；`last_used_at` 更新失败不应破坏业务读取。
- **API surface parity:** Cookie session 与 Bearer PAT 都进入同一业务权限和项目范围校验，避免 MCP 看到 Web 用户看不到的数据。
- **Integration coverage:** 需要覆盖无 Cookie 的 Bearer 请求、受保护资料解锁、OpenAPI endpoint 和 MCP 脚本语法。
- **Unchanged invariants:** 现有 Web Cookie + CSRF、防 XSS 富文本清洗、项目成员范围、资料库密码哈希存储语义不改变。

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| PAT 泄露导致 API 被调用 | token 只显示一次、只保存哈希、支持撤销和过期、scope 限制、继续执行业务权限校验 |
| Bearer 改造误伤 CSRF | 仅 Bearer PAT 跳过 CSRF；Cookie session 写请求仍必须校验 CSRF |
| OpenAPI 与实际路由漂移 | routing smoke 和 OpenAPI endpoint smoke 覆盖核心路径；runbook 明确新增接口 |
| 受保护资料正文被 MCP 默认读取 | 工具描述和服务端 API 双重限制；普通读取不返回正文，解锁必须显式传密码 |
| Scalar CDN 在内网或离线环境不可用 | 第一版接受 CDN 简化；后续可 vendor 静态资源到 `api/static/vendor/` |
| MCP stdout 被日志污染 | MCP server 日志只写 stderr，stdout 仅供 MCP JSON-RPC |

## Documentation / Operational Notes

- 在线文档入口：`/web/api-docs`。
- 机器契约入口：`/api/openapi.json`。
- MCP 初始化指南：`docs/mcp/ai-mcp-setup.md`。
- 部署时无需新增外部服务；需要执行数据库迁移以创建 `api_tokens` 表。
- 生产环境需要提醒用户妥善保存 PAT，并使用最小 scope。

## Sources & References

- Related code: `api/src/web/router.rs`
- Related code: `api/src/web/api/mod.rs`
- Related code: `api/src/domains/auth.rs`
- Related code: `api/templates/web/me.html`
- Related docs: `docs/runbooks/api-v1-contract.md`
- External docs: Scalar API Reference HTML integration（Context7: `/websites/scalar_products_api-references`）
- External docs: Model Context Protocol TypeScript SDK stdio server（Context7: `/modelcontextprotocol/typescript-sdk`）
