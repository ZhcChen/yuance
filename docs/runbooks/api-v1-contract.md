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

- 认证：支持 Web Cookie session 和 Personal Access Token。
  - 浏览器 Web 调用默认使用 `yuance_session` Cookie。
  - MCP / 外部脚本建议使用 `Authorization: Bearer yuance_pat_xxx`。
- CSRF：所有会改变状态的 Cookie API 必须提供 CSRF。
  - 登录和初始化成功响应会设置 `yuance_csrf` cookie，并在 JSON 中返回 `csrf_token`。
  - 后续写请求传 `x-yuance-csrf-token: <csrf_token>`。
  - Bearer Token 写请求不依赖 Cookie，因此不需要 CSRF。
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
GET  /api/v1/me/tokens
POST /api/v1/me/tokens
DELETE /api/v1/me/tokens/{token_id}
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

## Personal Access Token

PAT 用于 MCP 和外部脚本调用。Token 明文只在创建成功时返回一次，服务端只保存哈希。

创建请求：

```json
{
  "name": "MCP 本地访问",
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
      "name": "MCP 本地访问",
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

## 项目

```text
GET   /api/v1/projects
POST  /api/v1/projects
GET   /api/v1/projects/{project_key}
PATCH /api/v1/projects/{project_key}
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

## 项目成员

```text
GET    /api/v1/projects/{project_key}/members
POST   /api/v1/projects/{project_key}/members
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
```

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
- MCP 默认不得调用 unlock；只有用户明确授权并提供该条资料访问密码时才允许调用。
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
GET    /api/v1/work-items/{item_key}
PATCH  /api/v1/work-items/{item_key}
GET    /api/v1/work-items/{item_key}/events
GET    /api/v1/work-items/{item_key}/typing
POST   /api/v1/work-items/{item_key}/restore
POST   /api/v1/work-items/{item_key}/handoff
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
GET /api/v1/notifications
```

查询参数：

```text
limit=5
```

返回当前登录用户的站内消息摘要和未读数量。消息包括被指派、被回复等工作项协作事件；`open_url` 指向对应消息打开入口。

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
DELETE /api/v1/projects/{project_key}/attachments/{attachment_id}
```

`DELETE` 项目附件接口为兼容 HTTP 语义保留，业务效果是归档附件：记录保留、状态码仍为 `deleted`，页面和 API 不再生成下载签名。

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
DELETE /api/v1/work-items/{item_key}/comments/{comment_id}/attachments/{attachment_id}
```

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
DELETE /api/v1/projects/{project_key}/resources/{resource_id}/attachments/{attachment_id}
```

权限：

- 登记、上传签名和上传完成：需要 `project.view`，并且当前用户具备项目内容写入权限。
- 删除：用于资料正文编辑阶段移除未保留的附件，同时会尝试删除对象存储中的对应对象。
- 下载签名：未设置访问密码的资料需要项目成员范围；已设置访问密码的资料不通过 API 生成下载签名，必须先在 Web 详情页验证访问密码，再使用短期受控下载入口。

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
```

该入口只用于浏览器冒烟和集成测试：

- 只在 `YUANCE_ENV=test` 且 active storage endpoint 为 `memory://yuance-tests` 时可用。
- 需要已登录 session、`x-yuance-csrf-token` 和服务端签发的短期绑定授权；授权仅匹配签发用户与目标对象键。
- 生产或普通 OSS 配置下返回错误。
- 业务代码不应直接依赖该入口。

## 系统管理

用户：

```text
GET   /api/v1/system/users
POST  /api/v1/system/users
PATCH /api/v1/system/users/{username}/status
PATCH /api/v1/system/users/{username}/role
POST  /api/v1/system/users/{username}/password
```

角色与权限：

```text
GET   /api/v1/system/roles
POST  /api/v1/system/roles
PATCH /api/v1/system/roles/{role_code}/status
GET   /api/v1/system/roles/{role_code}/permissions
PATCH /api/v1/system/roles/{role_code}/permissions
GET   /api/v1/system/permissions
```

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

系统版本管理：

```text
GET    /api/v1/system/releases/settings
PATCH  /api/v1/system/releases/settings
GET    /api/v1/system/releases
POST   /api/v1/system/releases
GET    /api/v1/system/releases/{release_id}
PATCH  /api/v1/system/releases/{release_id}
POST   /api/v1/system/releases/{release_id}/assets
GET    /api/v1/system/releases/{release_id}/assets/{asset_id}/upload-url
POST   /api/v1/system/releases/{release_id}/assets/{asset_id}/uploaded
DELETE /api/v1/system/releases/{release_id}/assets/{asset_id}
```

重要语义：

- `GET/PATCH /api/v1/system/releases/settings` 仅供网页登录态管理员调整“保留最近 N 个已发布版本”的策略。
- `POST /api/v1/system/releases` 创建草稿版本；`PATCH /api/v1/system/releases/{release_id}` 可更新说明或通过 `publish=true` 发布版本。
- 发布时会按当前保留策略自动清理超限旧版本，并同步删除关联 OSS 对象与数据库记录。
- 版本资产上传采用三段式：`POST /assets` 创建占位、`GET /upload-url` 获取签名、`POST /uploaded` 确认对象已上传。
- `DELETE /api/v1/system/releases/{release_id}/assets/{asset_id}` 仅删除单个版本资产，不删除版本本身。

对象存储：

```text
GET  /api/v1/storage/config
POST /api/v1/storage/config
POST /api/v1/storage/config/probe
GET  /api/v1/storage/config/inspect
POST /api/v1/storage/config/initialize
GET  /api/v1/storage/config/versions
POST /api/v1/storage/config/versions/{version}/rollback
```

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
