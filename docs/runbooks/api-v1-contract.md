---
title: API v1 契约说明
type: runbook
status: active
date: 2026-06-30
---

# API v1 契约说明

本文档记录元策当前 `/api/v1` JSON 接口的稳定约定。V1 API 主要服务当前单体 Web、浏览器直传和基础程序化调用；现阶段不是开放平台协议。

## 基础约定

- 路径前缀：`/api/v1`。
- 响应格式：成功统一返回 JSON envelope。

```json
{
  "data": {}
}
```

- 错误格式：

```json
{
  "error": {
    "code": "unauthorized",
    "message": "未登录或登录已失效"
  }
}
```

- 认证：支持 Web Cookie session、Personal Access Token 和独立的设备会话凭证。
  - 浏览器 Web 调用默认使用 `yuance_session` Cookie。
  - Codex Skill / 外部脚本建议使用 `Authorization: Bearer yuance_pat_xxx`。
  - Desktop 设备授权使用独立的 `yuance_dat_` access 与 `yuance_drt_` refresh namespace；Device access 仅可调用下文 D2 显式矩阵，且设备凭证不能作为 PAT 使用。
- CSRF：所有会改变状态的 Cookie API 必须提供 CSRF。
  - 登录和初始化成功响应会设置 `yuance_csrf` cookie，并在 JSON 中返回 `csrf_token`。
  - 后续写请求传 `x-yuance-csrf-token: <csrf_token>`。
  - Bearer PAT 或 Device access 写请求不依赖 Cookie，因此不需要 CSRF；二者仍分别执行 scope/allowlist 与统一业务授权。
- JSON 请求头：写请求建议使用 `Content-Type: application/json`。
- 未登录：返回 `401 unauthorized`。
- 无功能权限或数据范围权限：返回 `403 forbidden`。
- 分页参数：
  - `page` 默认 `1`，不能小于 `1`。
  - `per_page` 默认 `20`，范围 `1..=100`。

分页响应：

```json
{
  "data": {
    "items": [],
    "pagination": {
      "page": 1,
      "per_page": 20,
      "total_items": 0,
      "total_pages": 1
    }
  }
}
```

## 认证与初始化

```text
GET  /api/v1/bootstrap/status
POST /api/v1/bootstrap/init
POST /api/v1/auth/login
GET  /api/v1/auth/me
GET  /api/v1/auth/csrf
POST /api/v1/auth/logout
POST /api/v1/device-authorizations
POST /api/v1/device-authorizations/exchange
POST /api/v1/device-sessions/refresh
GET  /api/v1/device-session
GET  /api/v1/device-session/events
POST /api/v1/device-session/logout
POST /api/v1/device-file-transfer/canary/upload-request
GET  /api/v1/device-file-transfer/canary/download-request
PUT  /api/v1/device-file-transfer/canary/upload
GET  /api/v1/device-file-transfer/canary/download
GET  /api/v1/me/tokens
POST /api/v1/me/tokens
DELETE /api/v1/me/tokens/{token_id}
GET   /api/v1/me/profile
PATCH /api/v1/me/profile
PATCH /api/v1/me/password
```

已登录用户管理自己的设备会话：

```text
GET    /api/v1/me/device-sessions
DELETE /api/v1/me/device-sessions/{family_id}
```

初始化请求：

```json
{
  "username": "admin",
  "display_name": "系统管理员",
  "password": "AdminPass2026!",
  "password_confirm": "AdminPass2026!"
}
```

登录请求：

```json
{
  "username": "yuance_admin",
  "password": "Yuance@2026Dev!"
}
```

登录成功返回当前用户和 CSRF token，并设置 session cookie。

`GET /api/v1/auth/csrf` 可在现有登录态下显式获取最新 CSRF token，适用于长会话页面刷新写操作前的 token 同步。

### Desktop 设备授权

`POST /api/v1/device-authorizations` 使用 S256 PKCE challenge 发起短期设备授权；用户在系统浏览器的 `/web/device-authorization` 页面通过现有 Cookie session 与 CSRF 批准或拒绝。Desktop 随后调用 `POST /api/v1/device-authorizations/exchange`，提交 `device_code`、`code_verifier` 和预持久化的 `exchange_transaction_id`。

两个 JSON 端点都不接受 Cookie 或 `Authorization` header；发现 ambient credential 时在解析 body 前返回 `401 credential_not_allowed`，不会回退到 Cookie、PAT 或 device bearer。成功和错误响应均为 `Cache-Control: private, no-store`。轮询必须遵守响应中的 `interval` 与 `Retry-After`；同一 transaction 可以恢复相同的 generation 0 credential，不同 transaction 不能消费已完成授权。

`POST /api/v1/device-sessions/refresh` 提交当前 `refresh_token`、source `generation`、`device_id`、`server_instance_id` 和发送前已持久化的 `transaction_id`。同一 generation + transaction 可恢复完全相同的下一代凭证；旧 generation 使用不同 transaction 会以 `409 device_refresh_replay` 撤销整个 credential family。幂等密文无法解密时返回 `409 rotation_recovery_failed` 并撤销 family。该端点同样拒绝 Cookie 与 `Authorization` header，所有响应禁止缓存。

`GET /api/v1/device-session`、`GET /api/v1/device-session/events` 与 `POST /api/v1/device-session/logout` 只接受 `Authorization: Bearer yuance_dat_*`。probe 返回 user/device/family/generation、access 到期时间和 authorization version，不返回任何 token；events 仅发送 `connected` 事件和 heartbeat comment，并持续重验设备授权 lease；logout 原子撤销当前 credential family 及其 access/refresh。Cookie、PAT、system token、device refresh 或混合凭证均不允许进入这些端点。Device access 对业务 API 继续默认拒绝，只开放下一节的 method + path 矩阵。

#### D2 Device 业务路由矩阵

Device access 当前仅允许以下业务 route；OpenAPI 顶层 `x-yuance-device-business-allowlist` 是对应机器可读清单：

```text
GET   /api/v1/auth/me
GET   /api/v1/projects
GET   /api/v1/current-project
PATCH /api/v1/current-project
GET   /api/v1/topbar/status
GET   /api/v1/dashboard
GET   /api/v1/topbar/events
GET   /api/v1/notifications
GET   /api/v1/notifications/{notification_id}/target
POST  /api/v1/notifications/{notification_id}/read
POST  /api/v1/notifications/read-all
GET   /api/v1/work-items
GET   /api/v1/work-items/{item_key}
PATCH /api/v1/work-items/{item_key}
POST  /api/v1/work-items/{item_key}/handoff
POST  /api/v1/work-items/{item_key}/close
GET   /api/v1/work-items/{item_key}/events
GET   /api/v1/work-items/{item_key}/comments
POST  /api/v1/work-items/{item_key}/comments
POST  /api/v1/work-items/{item_key}/comments/draft
PATCH /api/v1/work-items/{item_key}/comments/{comment_id}
POST  /api/v1/work-items/{item_key}/comments/{comment_id}/publish
DELETE /api/v1/work-items/{item_key}/comments/{comment_id}/draft
GET   /api/v1/work-items/{item_key}/comments/{comment_id}/attachments
POST  /api/v1/work-items/{item_key}/comments/{comment_id}/attachments
GET   /api/v1/work-items/{item_key}/comments/{comment_id}/attachments/{attachment_id}/upload-url
POST  /api/v1/work-items/{item_key}/comments/{comment_id}/attachments/{attachment_id}/uploaded
GET   /api/v1/work-items/{item_key}/comments/{comment_id}/attachments/{attachment_id}/download-url
GET   /api/v1/work-items/{item_key}/attachments
POST  /api/v1/work-items/{item_key}/attachments
GET   /api/v1/work-items/{item_key}/attachments/{attachment_id}/upload-url
POST  /api/v1/work-items/{item_key}/attachments/{attachment_id}/uploaded
GET   /api/v1/work-items/{item_key}/attachments/{attachment_id}/download-url
```

Device principal 使用服务端认证所得 user、device/family、generation 和 authorization version，不接受客户端声明 actor。Device 不套用 PAT scope/project_scope，但必须继续通过同一 RBAC、项目成员关系、项目内角色、对象归属、状态机和审计逻辑。撤销、过期、用户禁用或 authorization version 失效后返回 `401`；缺少功能权限、项目成员关系或写权限返回 `403`。未列入矩阵的项目详情/管理、工作项创建/恢复、附件删除、资料库和系统管理 route 继续在 domain side effect 前拒绝。

`POST /api/v1/device-file-transfer/canary/upload-request` 与 `GET /api/v1/device-file-transfer/canary/download-request` 只接受有效 Device access。两个签发端点不接受调用方提供的 body、query、对象键、URL 或 header 参数，只返回固定 purpose/method/大小/content type/短 TTL 的 transfer contract；Cookie、PAT、system token、device refresh、已撤销或过期 Device access 均被拒绝。

`PUT /api/v1/device-file-transfer/canary/upload` 与 `GET /api/v1/device-file-transfer/canary/download` 只接受签发端点产生的短期加密 grant，不接受 Cookie、Authorization 或其他 ambient credential。四个 canary 端点只用于证明 Desktop 主进程的文件 capability 与受控字节传输边界，不开放项目附件、工作项附件或任意对象存储能力。

设备会话 logout 与 Browser 撤销先原子提交 family/access/refresh 的撤销状态，再以 best-effort 写入审计；审计写入失败会记录服务端告警，但不会回滚或恢复已经撤销的凭证。若后续要求撤销与审计具备同一提交保证，应采用 transaction outbox，而不是在审计失败时重新开放凭证。

refresh rotation 成功与 replay/recovery failure 的审计同样采用 best-effort：凭证事务的提交或安全撤销不依赖审计表写入成功，审计 metadata 只包含 device/family/generation/transaction 等标识，不包含原始 access、refresh 或幂等响应密文。

当前用户可在 `/web/me` 查看并撤销自己的 Desktop credential family；该操作必须使用 Browser Cookie + CSRF，不能由 PAT 或 device access 代替。

### Desktop 主进程凭证边界

- Desktop profile 绑定 canonical origin、服务端稳定 `server_instance_id` 和开发/生产模式。正式模式只接受内置 HTTPS origin；开发模式仅显式允许 loopback HTTP。任何 profile identity 变化都不得复用原 credential record。
- access token 只驻留 Electron 主进程内存；持久化 record 只包含 refresh credential、绑定元数据、generation 和 pending rotation。renderer、preload、Cookie jar、普通配置和日志不得接触 access/refresh token。
- Desktop device refresh credential 使用应用用户目录内的版本化 owner-only 文件持久化，不依赖系统凭证库。macOS 与 Linux 强制凭证目录 `0700`、文件 `0600`，读取时发现 group/other 权限即 fail closed；Windows 通过 Rust file-guard 为凭证目录设置仅当前用户与 LocalSystem 可访问的受保护 DACL，guard 缺失或失败时禁止启用凭证运行时。该边界提供操作系统账号级文件访问控制，不宣称静态加密；macOS 禁止 Keychain，所有平台禁止 Electron `safeStorage`。
- refresh 前先原子持久化 pending transaction；启动发现 pending rotation 时必须以相同 transaction 重试。迟到或 generation/transaction 不匹配的响应不得提交。
- logout 立即清除内存 access 并冻结请求。在线撤销成功后删除本地 record；离线或本地删除失败时保持 `locked/pending_revocation`，只能重试撤销、清理本地会话或重新授权，不能恢复旧会话。
- 当前 coordinator 不向远端 `/web` renderer 注入 device token。正式 renderer、`app://`、Desktop SSE 和业务 API device access 仍属于后续独立切片。

开发环境可使用 headless 主进程入口验证 Browser 批准流程：

```bash
npm --prefix desktop run auth:headless -- \
  --server-instance-id=<server_instance_id> \
  --endpoint=http://127.0.0.1:3000
```

该入口仅允许 unpackaged Electron 运行。它输出 `user_code` 并通过系统浏览器打开可信 origin 构造的批准地址；不会输出原始 access/refresh token。

## Personal Access Token

PAT 用于 Codex Skill 和外部脚本调用。Token 明文只在创建成功时返回一次，服务端只保存哈希。

创建请求：

```json
{
  "name": "Codex Skill",
  "scopes": [
    "project:read",
    "work_item:read",
    "comment:write",
    "resource:read",
    "notification:read"
  ],
  "project_scope": "all",
  "expires_at": "2026-12-31"
}
```

创建响应：

```json
{
  "data": {
    "token": {
      "id": 1,
      "name": "Codex Skill",
      "scopes": ["project:read"],
      "project_scope": "all",
      "token_suffix": "abcd1234",
      "expires_at": "",
      "revoked_at": "",
      "last_used_at": "",
      "created_at": "2026-07-14 10:00:00",
      "updated_at": "2026-07-14 10:00:00"
    },
    "raw_token": "yuance_pat_xxx"
  }
}
```

支持的 scope：

```text
project:read
work_item:read
work_item:write
comment:write
resource:read
resource:write
resource:unlock
notification:read
```

重要语义：

- `GET/POST/DELETE /api/v1/me/tokens*` 只能通过浏览器 Cookie session 使用，不能用 PAT 管理其它 PAT。
- PAT 过期、已删除或已失效后，Bearer 请求返回 `401 unauthorized`。
- PAT 缺少接口所需 scope 时，返回 `403 forbidden`。
- `project_scope` 为 `all` 表示允许访问当前用户可见的全部项目；也可以填写单个项目编号或逗号分隔项目编号，例如 `YCE,OPS`。
- 对列表接口，PAT 会按 `project_scope` 缩小项目和工作项结果集；对单项目接口，越权项目会返回 `403 forbidden`。
- 即使 `project_scope=all`，仍然会继续执行元策内的项目成员范围、RBAC 和业务权限校验。
- Cookie session 写请求仍必须提供 CSRF；Bearer PAT 写请求不需要 CSRF。

## 当前项目上下文

```text
GET   /api/v1/current-project
PATCH /api/v1/current-project
GET   /api/v1/topbar/status
GET   /api/v1/topbar/events
```

`PATCH /api/v1/current-project` 请求：

```json
{
  "project_key": "YCE"
}
```

当前项目是用户级偏好。普通成员只能选择自己可见的项目；系统管理员可选择任意项目。

重要语义：

- `GET /api/v1/work-items` 未显式传 `project_key` 时，会默认使用当前项目。
- 如果用户没有当前项目，则返回空列表，不返回跨项目混合结果。
- 程序化调用方如果需要特定项目列表，应显式传 `project_key`。
- `GET /api/v1/topbar/status` 返回顶部需求 / 任务 / Bug、当前项目和消息角标的当前快照。
- `GET /api/v1/topbar/events` 返回 SSE 事件流，用于顶部角标、消息数和项目切换相关的实时推送。
- `GET /api/v1/search` 按当前用户权限范围搜索项目与工作项。

## 项目

```text
GET   /api/v1/projects
POST  /api/v1/projects
GET   /api/v1/projects/{project_key}
PATCH /api/v1/projects/{project_key}
GET   /api/v1/projects/{project_key}/my-analysis
```

项目列表参数：

```text
status=not_started|in_progress|acceptance|completed|on_hold|cancelled|archived
page=1
per_page=20
```

创建项目请求：

```json
{
  "name": "元策",
  "description": "项目管理系统",
  "status": "not_started",
  "start_date": "2026-06-01",
  "due_date": "2026-12-31"
}
```

项目编号由服务端自动生成，格式为 `PYYMMDDXXXXXX`，例如 `P260708483921`。创建后不可修改，并作为项目链接和工作项编号前缀。

项目状态流转：

```text
not_started -> in_progress / cancelled
in_progress -> acceptance / on_hold / cancelled
acceptance  -> in_progress / completed / on_hold / cancelled
on_hold     -> in_progress / cancelled
completed   -> in_progress / archived
cancelled   -> not_started / archived
archived    -> completed / cancelled / in_progress
```

项目内容写入仅允许 `not_started`、`in_progress`、`acceptance`；`completed`、`on_hold`、`cancelled`、`archived` 仅允许修改项目自身状态。

权限：

- 查看项目：需要 `project.view`，并处于项目成员范围内；系统管理员拥有全局查看。
- 创建/修改项目：需要 `project.manage`，同时受项目成员管理权限约束。
- 个人项目分析：需要 `project.view` 且只能读取当前登录用户在目标项目中的处理、待办与协作统计，不接受目标用户名参数。

## 项目成员

```text
GET    /api/v1/projects/{project_key}/members
POST   /api/v1/projects/{project_key}/members
GET    /api/v1/projects/{project_key}/members/candidates
POST   /api/v1/projects/{project_key}/members/batch
PATCH  /api/v1/projects/{project_key}/members/{username}
DELETE /api/v1/projects/{project_key}/members/{username}
```

成员角色：

```text
owner
maintainer
member
viewer
```

添加成员请求：

```json
{
  "username": "zhangsan",
  "member_role": "member"
}
```

权限：

- 成员列表：需要 `project.view`，并处于项目成员范围内。
- 添加、调整、移除成员：需要 `project.manage`，且当前用户具备项目成员管理权限。
- `completed`、`on_hold`、`cancelled`、`archived` 项目会阻止成员新增、调整和移除。
- 如果成员仍负责未关闭工作项，移除会返回 `400 bad_request`，需要先转交或关闭相关工作项。

## 项目周期

```text
GET   /api/v1/projects/{project_key}/cycles
POST  /api/v1/projects/{project_key}/cycles
GET   /api/v1/projects/{project_key}/cycles/{cycle_id}
PATCH /api/v1/projects/{project_key}/cycles/{cycle_id}
POST  /api/v1/projects/{project_key}/cycles/{cycle_id}/close
```

## 时间管理

时间排期按项目与成员维度安排投入时间，记录每次新增、更新、删除的操作人与字段差异。

```text
GET   /api/v1/time-management/overview
GET   /api/v1/time-management/members
GET   /api/v1/time-management/changes
POST  /api/v1/time-management/changes/{record_id}/restore
GET   /api/v1/projects/{project_key}/time-allocations
POST  /api/v1/projects/{project_key}/time-allocations
PATCH /api/v1/projects/{project_key}/time-allocations/{allocation_id}
DELETE /api/v1/projects/{project_key}/time-allocations/{allocation_id}
```

时间管理排期请求：

```json
{
  "username": "zhangsan",
  "start_date": "2026-08-01",
  "end_date": "2026-08-15",
  "daily_hours": 8,
  "phase_task_name": "需求分析",
  "note": "联调排期"
}
```

修改记录分页参数：

```text
page=1
per_page=20
project_key=YCE
actor=zhangsan
```

修改记录响应项包含操作人、动作（`time_allocation.created` / `time_allocation.updated` / `time_allocation.deleted`）、摘要、字段级 `changes` 以及用于后续回退的 `before` / `after` 排期快照。

回退修改记录时，服务端按记录中的 `before` 快照恢复：

- 回退“新增”：删除对应排期；
- 回退“更新”：恢复为操作前字段；
- 回退“删除”：按操作前快照重新创建排期；
- 回退本身会新增一条 `time_allocation.restored` 修改记录，供再次审计和追溯。
- 同一修改记录重复回退返回 `409 conflict`，避免重复删除或重复创建。

成员目录返回时间排期表可展示的全部人员：

- 具备 `time.management.view`（默认普通成员已授予）：返回所有启用且非超级管理员账号；
- 不具备 `time.management.view`：不允许访问。

权限：

- 查看 overview、成员目录与修改记录：需要 `time.management.view`；默认普通成员角色已授予，展示全部启用且非超级管理员账号及全部排期。
- 回退修改记录：需要时间排期写权限（`time.management.edit`，或为项目 owner / maintainer）。
- 新增、更新、删除排期：需要 `time.management.edit`，或为项目 owner / maintainer；具备 `time.management.edit` 时可编辑任意项目排期，访问 Token 的项目范围仍然生效。

## 项目资料库

资料库用于保存项目级开发资料、客户资料、会议纪要和实施文档。资料正文为富文本 HTML，
正文内附件绑定到 `project_resource` 目标。

```text
GET    /api/v1/projects/{project_key}/resources
POST   /api/v1/projects/{project_key}/resources
GET    /api/v1/projects/{project_key}/resources/{resource_id}
PATCH  /api/v1/projects/{project_key}/resources/{resource_id}
DELETE /api/v1/projects/{project_key}/resources/{resource_id}
POST   /api/v1/projects/{project_key}/resources/{resource_id}/archive
POST   /api/v1/projects/{project_key}/resources/{resource_id}/unlock
POST   /api/v1/projects/{project_key}/resources/{resource_id}/password/reset
```

访问密码重置仅允许超级管理员执行，动作只接受 `set` 或 `clear`，并记录高风险审计。

列表参数：

```text
q=关键词
category=integration|customer|meeting|implementation|other
status=active|archived|all
```

创建请求：

```json
{
  "title": "正式环境接口配置",
  "category": "integration",
  "body": "<p>正文</p>",
  "body_format": "html",
  "access_password": "可选单条访问密码"
}
```

更新请求字段都是可选字段：

```json
{
  "title": "更新后的资料标题",
  "category": "customer",
  "body": "<p>更新后的正文</p>",
  "body_format": "html"
}
```

语义：

- `access_password` 只在创建时设置；为空表示不加访问密码。
- 访问密码长度为 `4..=128`，服务端只保存 Argon2 哈希。
- 设置访问密码的资料，列表只返回元信息和受保护摘要；普通详情 API 返回 `403 forbidden`。
- `POST .../unlock` 需要显式提交该条资料访问密码，验证成功后才返回正文。
- 自动化客户端默认不得调用 unlock；只有用户明确授权并提供该条资料访问密码时才允许调用。
- `DELETE` 和 `POST .../archive` 业务效果一致：归档资料，保留记录和历史动态，不物理删除。

解锁请求：

```json
{
  "access_password": "该条资料的访问密码"
}
```

权限：

- 列表和未加密详情：需要 `project.view`，并处于项目成员范围内。
- 创建、更新、归档和资料正文附件写入：需要 `project.view`，并且当前用户具备项目内容写入权限。
- `completed`、`on_hold`、`cancelled`、`archived` 项目会阻止资料写入。

## 工作项

需求、任务、Bug 共用工作项模型。

```text
GET    /api/v1/work-items
POST   /api/v1/work-items
POST   /api/v1/work-items/batch
GET    /api/v1/work-item-list-view
POST   /api/v1/work-item-saved-views
PATCH  /api/v1/work-item-saved-views/{saved_view_id}
DELETE /api/v1/work-item-saved-views/{saved_view_id}
POST   /api/v1/work-item-saved-views/{saved_view_id}/default
GET    /api/v1/work-items/{item_key}
PATCH  /api/v1/work-items/{item_key}
GET    /api/v1/work-item-detail-view/{item_key}
PATCH  /api/v1/work-items/{item_key}/primary-post
GET    /api/v1/work-items/{item_key}/events
GET    /api/v1/work-items/{item_key}/typing
POST   /api/v1/work-items/{item_key}/restore
POST   /api/v1/work-items/{item_key}/handoff
POST   /api/v1/work-items/{item_key}/close
```

列表参数：

```text
item_type=requirement|task|bug
q=关键词
status=open|in_progress|done|resolved|verified|closed|cancelled
priority=P0|P1|P2|P3
project_key=YCE
assignee_username=zhangsan
page=1
per_page=20
```

`work-item-list-view` 原子返回列表结果、筛选候选、保存视图和当前默认视图；`work-item-detail-view` 原子返回详情、流转、评论、附件和服务端计算的可执行能力。批量接口只接受受控动作和当前选择范围，保存视图接口负责创建、重命名、删除及设置默认视图。

创建请求：

```json
{
  "project_key": "YCE",
  "item_type": "task",
  "title": "完成 API 契约文档",
  "description": "补齐调用说明",
  "priority": "P2",
  "assignee_username": "zhangsan",
  "due_date": "2026-07-15",
  "parent_item_key": ""
}
```

更新请求字段都是可选字段：

```json
{
  "title": "更新后的标题",
  "description": "更新后的描述",
  "status": "in_progress",
  "priority": "P1",
  "assignee_username": "zhangsan",
  "due_date": "2026-07-20",
  "parent_item_key": "YCE-REQ-1"
}
```

推进并指派请求：

```json
{
  "status": "in_progress",
  "assignee_username": "lisi",
  "body": "已复现，转开发修复"
}
```

语义：

- `assignee_username` 为空时保持当前处理人；非空时必须是当前项目启用成员。
- 每次推进会在评论区生成一条流程记录，流程记录不能编辑、删除或添加附件。
- `GET /api/v1/work-items/{item_key}/events` 返回工作项详情页的实时事件流。
- `GET /api/v1/work-items/{item_key}/typing` 返回当前正在输入评论的成员快照。
- 顶部需求、任务、Bug 角标按当前处理人和未完成状态实时计算；完成、关闭或改派后原处理人角标消失。

权限：

- 查看：需要 `work_item.view`，并处于项目成员范围内。
- 创建、更新、推进、评论和工作项 / 评论附件写入：需要 `work_item.view`，并且当前用户具备项目内容写入权限。
- 历史工作项恢复：需要 `work_item.manage`，并且当前用户具备项目内容写入权限；当前 API 不提供工作项删除入口。
- `viewer` 项目成员不能写入工作项。
- `completed`、`on_hold`、`cancelled`、`archived` 项目会阻止工作项、评论、附件和成员管理等项目内容写入；项目本身仍可通过编辑项目按状态机恢复状态。
- 历史工作项会阻止继续写评论、附件等内容。

状态流转：

```text
open        -> in_progress / closed
in_progress -> open / done / resolved / closed
done        -> in_progress / verified / closed
resolved    -> in_progress / verified / closed
verified    -> in_progress / closed
closed      -> in_progress
cancelled   -> in_progress
```

`open` 和 `in_progress` 可以直接关闭。`cancelled` 仅用于兼容历史数据，不再作为新流转选项。

## 评论

```text
GET    /api/v1/work-items/{item_key}/comments
POST   /api/v1/work-items/{item_key}/comments
POST   /api/v1/work-items/{item_key}/comments/draft
PATCH  /api/v1/work-items/{item_key}/comments/{comment_id}
POST   /api/v1/work-items/{item_key}/comments/{comment_id}/publish
DELETE /api/v1/work-items/{item_key}/comments/{comment_id}/draft
```

创建/更新请求：

```json
{
  "body": "评论内容",
  "body_format": "plain",
  "parent_comment_id": 123
}
```

富文本评论使用 `body_format = "html"`。服务端会白名单清洗 HTML；旧客户端不传
`body_format` 时仍按纯文本处理。粘贴或拖拽文件时可先创建草稿评论，再把文件上传到该
评论，最终通过 publish 端点发布草稿。草稿在发布前不会出现在评论列表、工作项详情、消息
通知或项目动态中。

`parent_comment_id` 可为空；传入时必须指向同一工作项内的普通评论，不能回复流程记录。响应会返回 `parent_comment_id` 与 `parent_author`。

写操作需要 `work_item.view` 和项目内容写入权限。评论修改还会校验评论管理范围；流程记录不能修改。评论及其回复永久保留，不提供删除接口。

## 站内通知

```text
GET  /api/v1/notifications
GET  /api/v1/notifications/{notification_id}/target
POST /api/v1/notifications/{notification_id}/read
POST /api/v1/notifications/read-all
```

查询参数：

```text
limit=5
filter=all|unread|pending|read
page=1
per_page=10
```

`GET /api/v1/notifications` 同时服务通知下拉和浏览器消息中心，返回：

- `items`：当前页通知摘要列表。
- `unread_count`：当前用户全部未读数。
- `pending_count`：当前用户全部待处理讨论数，仅统计未读的 `comment_replied` / `comment_mentioned`。
- `filter`、`page`、`per_page`、`total_items`、`total_pages`：消息中心需要的筛选与分页元数据。

兼容约定：

- 只传 `limit` 时，会返回第 1 页窗口，并把 `limit` 视为 `per_page`，便于继续服务顶部通知下拉。
- `filter=pending` 表示“未读讨论消息”；当前等价于服务端内部的 `pending_discussion` 过滤。
- `open_url` 仍保留给旧 `/web/messages/{id}/open` 兼容链路，新 Web 应优先消费 `target` 语义目标。

通知目标与已读的重要语义：

- `GET /api/v1/notifications/{notification_id}/target` 返回当前通知的已读状态和语义目标，当前目标类型为 `work_item`，包含 `project_key`、`work_item_key` 和可选 `comment_id`。
- `POST /api/v1/notifications/{notification_id}/read` 是幂等已读操作；Cookie session 需要 CSRF，PAT/Bearer 不需要。
- `POST /api/v1/notifications/read-all` 会把当前用户全部未读消息标记为已读，并返回本次影响数量。
- 新客户端不应把 `/web/messages/{id}/open` 当作业务协议；应使用通知 ID + 语义目标决定内部跳转。

## 测试存储校验

```text
PUT /api/v1/test-storage/upload
GET /api/v1/test-storage/download
```

以上接口仅用于当前测试存储链路与浏览器直传验收，不属于业务前台工作流。上传请求使用 query 中的签名 grant；下载请求返回受限测试对象内容。

## 附件与直传

项目、工作项、评论附件使用同一套三阶段流程：

1. 登记附件元数据。
2. 获取上传签名。
3. 客户端直传对象存储，然后标记上传完成。

项目附件：

```text
GET    /api/v1/projects/{project_key}/attachments
POST   /api/v1/projects/{project_key}/attachments
GET    /api/v1/projects/{project_key}/attachments/{attachment_id}/upload-url
POST   /api/v1/projects/{project_key}/attachments/{attachment_id}/uploaded
GET    /api/v1/projects/{project_key}/attachments/{attachment_id}/download-url
GET    /api/v1/projects/{project_key}/attachments/{attachment_id}/preview
GET    /api/v1/projects/{project_key}/attachments/{attachment_id}/preview/content
HEAD   /api/v1/projects/{project_key}/attachments/{attachment_id}/preview/content
DELETE /api/v1/projects/{project_key}/attachments/{attachment_id}
```

`DELETE` 项目附件接口为兼容 HTTP 语义保留，业务效果是归档附件：记录保留、状态码仍为 `deleted`，页面和 API 不再生成下载签名。

预览元数据返回图片、视频或文档分类、内容能力和同项目可预览附件前后项。内容接口支持单段 `Range`；完整内容返回 `200`，有效范围返回 `206`，不可满足范围返回 `416`。`HEAD` 只返回长度、类型和 Range 响应头，不读取对象内容。

项目文件夹：

```text
GET    /api/v1/projects/{project_key}/folders
POST   /api/v1/projects/{project_key}/folders
GET    /api/v1/projects/{project_key}/folders/tree
GET    /api/v1/projects/{project_key}/folders/content
PATCH  /api/v1/folders/{folder_id}
DELETE /api/v1/folders/{folder_id}
PATCH  /api/v1/file-objects/{file_object_id}/folder
```

权限：

- 列表和下载签名：需要 `project.view`，并处于项目成员范围内。
- 登记、上传签名、上传完成、文件夹管理和移动文件：需要 `work_item.manage`，并且当前用户具备项目内容写入权限。

项目附件登记请求可携带 `folder_id`。`folder_id` 为空表示根目录；传入时必须属于当前项目。移动文件时请求体为：

```json
{
  "folder_id": 123
}
```

`folder_id` 可为空，表示移动到根目录；不能把文件移动到其他项目的文件夹。

创建文件夹请求：

```json
{
  "parent_id": null,
  "name": "设计文档",
  "description": "项目文件分类"
}
```

`parent_id` 可为空，表示创建顶层文件夹；传入时必须属于当前项目。同一项目同一父文件夹下的 active 文件夹名称不能重复，重复时返回 `409 conflict`。

更新文件夹请求：

```json
{
  "name": "终稿",
  "description": "验收交付文件"
}
```

字段均可按需传入；重命名同样受同级唯一约束限制。

文件夹内容查询：

```text
GET /api/v1/projects/{project_key}/folders/content?folder_id=123
```

`folder_id` 为空时返回项目“全部文件”视图：顶层文件夹列表加项目内全部未删除文件；传入 `folder_id` 时返回该文件夹直接子文件夹和该文件夹内未删除文件。响应 `data` 结构：

```json
{
  "folder_id": 123,
  "folder_name": "设计文档",
  "folders": [],
  "files": []
}
```

移动文件响应返回对应 `AttachmentPayload`，不额外携带 `folder_id`；需要确认位置时可查询文件夹内容或文件对象状态。

工作项附件：

```text
GET    /api/v1/work-items/{item_key}/attachments
POST   /api/v1/work-items/{item_key}/attachments
GET    /api/v1/work-items/{item_key}/attachments/{attachment_id}/upload-url
POST   /api/v1/work-items/{item_key}/attachments/{attachment_id}/uploaded
GET    /api/v1/work-items/{item_key}/attachments/{attachment_id}/download-url
GET    /api/v1/work-items/{item_key}/attachments/{attachment_id}/preview
GET    /api/v1/work-items/{item_key}/attachments/{attachment_id}/preview/content
HEAD   /api/v1/work-items/{item_key}/attachments/{attachment_id}/preview/content
```

权限：

- 列表和下载签名：需要 `work_item.view`，并处于项目成员范围内。
- 登记、上传签名和上传完成：需要 `work_item.view`，并且当前用户具备项目内容写入权限。

评论附件：

```text
GET    /api/v1/work-items/{item_key}/comments/{comment_id}/attachments
POST   /api/v1/work-items/{item_key}/comments/{comment_id}/attachments
GET    /api/v1/work-items/{item_key}/comments/{comment_id}/attachments/{attachment_id}/upload-url
POST   /api/v1/work-items/{item_key}/comments/{comment_id}/attachments/{attachment_id}/uploaded
GET    /api/v1/work-items/{item_key}/comments/{comment_id}/attachments/{attachment_id}/download-url
GET    /api/v1/work-items/{item_key}/comments/{comment_id}/attachments/{attachment_id}/preview
GET    /api/v1/work-items/{item_key}/comments/{comment_id}/attachments/{attachment_id}/preview/content
HEAD   /api/v1/work-items/{item_key}/comments/{comment_id}/attachments/{attachment_id}/preview/content
DELETE /api/v1/work-items/{item_key}/comments/{comment_id}/attachments/{attachment_id}
```

工作项和评论附件预览元数据返回内容分类及同归属附件导航；内容接口支持 `GET`、`HEAD` 与单段 `Range`，并使用 `no-store`、`nosniff` 和 sandbox 响应边界。

权限：

- 列表和下载签名：需要 `work_item.view`，并处于项目成员范围内。
- 登记、上传签名和上传完成：需要 `work_item.view`，并且当前用户具备项目内容写入权限；流程记录评论不能登记附件。
- 删除：仅允许删除草稿评论的附件；用于富文本未发布前的附件清理，同时会尝试删除对象存储中的对应对象。

资料正文附件：

```text
POST /api/v1/projects/{project_key}/resources/{resource_id}/attachments
GET  /api/v1/projects/{project_key}/resources/{resource_id}/attachments/{attachment_id}/upload-url
POST /api/v1/projects/{project_key}/resources/{resource_id}/attachments/{attachment_id}/uploaded
GET  /api/v1/projects/{project_key}/resources/{resource_id}/attachments/{attachment_id}/download-url
GET  /api/v1/projects/{project_key}/resources/{resource_id}/attachments/{attachment_id}/preview
GET  /api/v1/projects/{project_key}/resources/{resource_id}/attachments/{attachment_id}/preview/content
HEAD /api/v1/projects/{project_key}/resources/{resource_id}/attachments/{attachment_id}/preview/content
DELETE /api/v1/projects/{project_key}/resources/{resource_id}/attachments/{attachment_id}
```

权限：

- 登记、上传签名和上传完成：需要 `project.view`，并且当前用户具备项目内容写入权限。
- 删除：用于资料正文编辑阶段移除未保留的附件，同时会尝试删除对象存储中的对应对象。
- 下载签名：未设置访问密码的资料需要项目成员范围；已设置访问密码的资料不通过 API 生成下载签名，必须先在 Web 详情页验证访问密码，再使用短期受控下载入口。
- 预览元数据返回内容分类和同资料附件导航；内容接口支持 `GET`、`HEAD` 与单段 `Range`，并使用 `no-store`、`nosniff` 和 sandbox 响应边界。

附件登记请求：

```json
{
  "original_filename": "screenshot.png",
  "content_type": "image/png",
  "byte_size": 102400
}
```

上传签名响应中的 `request` 可直接用于浏览器或客户端上传：

```json
{
  "data": {
    "attachment": {
      "id": 1,
      "file_object_id": 1,
      "object_key": "attachments/...",
      "filename": "screenshot.png",
      "content_type": "image/png",
      "byte_size": 102400,
      "status": "pending",
      "created_by": "系统管理员",
      "created_at": "2026-06-30 10:00:00"
    },
    "request": {
      "method": "PUT",
      "url": "https://...",
      "headers": [["content-type", "image/png"]]
    },
    "expires_in_seconds": 600
  }
}
```

签名有效期：

- 默认 `600` 秒。
- 可通过 `expires_in_seconds` 指定。
- 范围 `60..=3600`。

`POST .../uploaded` 会校验对象存储中对象真实存在、大小一致、Content-Type 一致，然后把附件状态改为 `uploaded`。

### 测试对象存储入口

```text
PUT /api/v1/test-storage/upload?object_key=...
GET /api/v1/test-storage/download?object_key=...
```

该入口只用于浏览器冒烟和集成测试：

- 只在 `YUANCE_ENV=test` 且 active storage endpoint 为 `memory://yuance-tests` 时可用。
- 需要已登录 session、`x-yuance-csrf-token` 和服务端签发的短期绑定授权；授权仅匹配签发用户与目标对象键。
- 生产或普通 OSS 配置下返回错误。
- 业务代码不应直接依赖该入口。

## 系统管理

系统首页：

```text
GET /api/v1/system/dashboard
```

该接口仅返回当前主体实际获授权的固定系统管理入口，不接受客户端声明权限或任意目标 URL。

用户：

```text
GET   /api/v1/system/users-view
GET   /api/v1/system/users
POST  /api/v1/system/users
PATCH /api/v1/system/users/{username}/status
PATCH /api/v1/system/users/{username}/role
POST  /api/v1/system/users/{username}/password
POST  /api/v1/system/users/{username}/projects
DELETE /api/v1/system/users/{username}/projects
DELETE /api/v1/system/users/{username}/projects/{project_key}
PATCH /api/v1/system/users/{username}/projects/{project_key}/role
```

`users-view` 是 Web 与 Desktop 共享用户管理页的原子读取入口，返回用户分页、全局角色候选、可分配项目、当前项目关系及服务端计算的管理与移除能力；默认每页 10 条。

用户项目关系写操作同时要求 `system.users.manage`、`project.manage` 和全项目数据范围。批量移除会在写入前完整校验负责人和活跃工作项约束；单项移除与项目角色调整继续由服务端执行相同保护。

角色与权限：

```text
GET   /api/v1/system/roles
GET   /api/v1/system/roles-view
POST  /api/v1/system/roles
PATCH /api/v1/system/roles/{role_code}/status
GET   /api/v1/system/roles/{role_code}/permissions
PATCH /api/v1/system/roles/{role_code}/permissions
GET   /api/v1/system/permissions
```

`roles-view` 是 Web 与 Desktop 共享角色工作台的原子读取入口，返回当前分页角色、选中角色、完整权限集合和服务端计算的角色管理能力；默认每页 10 条。

数据库统计：

```text
GET /api/v1/system/database-stats
```

数据库统计会返回一次性快照，包含所有业务表、表备注、数据量和字段设计；该接口只供系统管理页面在手动点击“刷新”时调用。

审计：

```text
GET /api/v1/system/audit
```

审计筛选参数：

```text
actor=
action=
target_type=
target_id=
page=1
per_page=20
```

系统 API 文档：

```text
GET /api/v1/system/api-docs-view
```

该接口返回仓库内置的 OpenAPI JSON 文本，仅允许具备 `system.api_tokens.view` 权限的主体读取，供 Web 与 Desktop 的本地共享查看器使用。

系统 OpenAPI Token：

```text
GET    /api/v1/system/openapi-view
POST   /api/v1/system/api-tokens
PATCH  /api/v1/system/api-tokens/{token_id}
DELETE /api/v1/system/api-tokens/{token_id}
```

`openapi-view` 返回共享管理页所需的 Token 列表、scope 候选、数量限制和创建能力；明文 Token 只在创建响应中出现一次。

系统版本管理：

```text
GET    /api/v1/system/releases/settings
PATCH  /api/v1/system/releases/settings
GET    /api/v1/system/releases-view
GET    /api/v1/system/releases
POST   /api/v1/system/releases
GET    /api/v1/system/releases/{release_id}
PATCH  /api/v1/system/releases/{release_id}
POST   /api/v1/system/releases/{release_id}/verify
POST   /api/v1/system/releases/{release_id}/withdraw
PATCH  /api/v1/system/releases/{release_id}/withdrawal
POST   /api/v1/system/releases/{release_id}/assets
GET    /api/v1/system/releases/{release_id}/assets/{asset_id}/upload-url
GET    /api/v1/system/releases/{release_id}/assets/{asset_id}/download-url
POST   /api/v1/system/releases/{release_id}/assets/{asset_id}/uploaded
DELETE /api/v1/system/releases/{release_id}/assets/{asset_id}
```

重要语义：

- `GET/PATCH /api/v1/system/releases/settings` 仅供网页登录态管理员调整“保留最近 N 个已发布版本”的策略。
- `GET /api/v1/system/releases-view` 为共享 Browser/Desktop 页面原子返回保留策略、分页版本、脱敏资产与管理能力，不暴露对象存储内部键。
- `POST /api/v1/system/releases` 创建草稿版本；`PATCH /api/v1/system/releases/{release_id}` 可更新说明或通过 `publish=true` 发布版本。
- 发布时会按当前保留策略自动清理超限旧版本，并同步删除关联 OSS 对象与数据库记录。
- 版本资产上传采用三段式：`POST /assets` 创建占位、`GET /upload-url` 获取签名、`POST /uploaded` 确认对象已上传。
- `DELETE /api/v1/system/releases/{release_id}/assets/{asset_id}` 仅删除单个版本资产，不删除版本本身。

对象存储：

```text
GET  /api/v1/system/storage-view
GET  /api/v1/storage/config
POST /api/v1/storage/config
POST /api/v1/storage/config/probe
GET  /api/v1/storage/config/inspect
POST /api/v1/storage/config/initialize
GET  /api/v1/storage/config/versions
POST /api/v1/storage/config/versions/{version}/rollback
```

`system/storage-view` 是 Web 与 Desktop 共享存储工作台的原子读取入口，返回脱敏后的当前配置、版本分页、初始化检查和服务端计算的管理能力；默认每页 10 条。未配置或检查失败时返回稳定页面状态，不返回密文、AccessKey ID 或 Secret 明文。

对象存储配置请求：

```json
{
  "endpoint": "https://oss-cn-hangzhou.aliyuncs.com",
  "region": "oss-cn-hangzhou",
  "bucket": "yuance-files",
  "access_key_id": "AKIA...",
  "access_key_secret": "...",
  "activate": true
}
```

敏感信息约定：

- AccessKey ID 和 Secret 加密入库。
- API 和页面只返回 `access_key_id_hint`。
- 不返回 Secret 明文。
- `memory://yuance-tests` 只允许 test 环境。
- `endpoint`、`region`、`bucket` 为空时，服务端会使用默认值：`https://oss-cn-hangzhou.aliyuncs.com`、`oss-cn-hangzhou`、`yuance-files`。Endpoint、Region 和签名 TTL 兼容 qfy-sc 默认值；Bucket 使用元策项目名。

桶检测与初始化：

- `POST /api/v1/storage/config/probe` 使用 active 配置执行临时对象写入、读取元数据和删除，适合检测 Bucket 与 AccessKey 对象读写权限。
- `GET /api/v1/storage/config/inspect` 只检查初始化标记 `yuance-system/.initialized`，不执行写操作。
- `POST /api/v1/storage/config/initialize` 会按需创建私有 Bucket、补齐浏览器直传 CORS，并写入初始化标记 `yuance-system/.initialized`。

## 权限点摘要

系统功能权限由 RBAC 控制，项目数据范围由项目成员关系控制。

```text
system.dashboard.view
system.users.view
system.users.manage
system.roles.view
system.roles.manage
system.storage.view
system.storage.manage
system.api_tokens.view
system.api_tokens.manage
system.releases.view
system.releases.manage
system.database_stats.view
system.audit.view
project.view
project.manage
work_item.view
work_item.manage
```

注意：

- 具备 RBAC 功能权限不代表自动拥有所有项目写入能力。
- 项目 `owner` / `maintainer` 可管理项目成员和内容。
- 项目 `member` 可写内容但不能管理成员。
- 项目 `viewer` 只读。
