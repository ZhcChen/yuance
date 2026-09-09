---
title: 元策 Skill 与 OpenAPI 能力同步：U1 契约复核
date: 2026-09-08
type: review
status: active
---

# U1 契约复核

## 复核范围

本记录对应计划 `docs/plans/2026-09-08-1713-feat-sync-skill-openapi-capabilities-plan.md` 的 U1，事实来源按以下顺序核对：

1. `api/src/web/router.rs` 的运行路由。
2. `api/src/web/api/mod.rs` 的请求模型、权限校验和响应 payload。
3. `api/src/domains/project_resources.rs`、`api/src/domains/files.rs` 的资料和附件领域行为。
4. `docs/runbooks/api-v1-contract.md` 与外部消费者 `qfy-voucher-hub/docs/runbooks/yuance-openapi-operations.md`、`yuance-openapi-command-examples.md` 的脱敏动作记录。

## G1：服务端事实

| 操作 | 当前 method + path | 请求/查询字段 | 成功 envelope / 响应 | 当前权限与保护前置 |
| --- | --- | --- | --- | --- |
| 当前用户 | `GET /api/v1/auth/me` | 无业务参数 | `data` 为当前用户 | 有效 Bearer / Cookie / Device principal |
| 资料列表 | `GET /api/v1/projects/{project_key}/resources` | `q`、`category`、`status`、`tag`、`related_work_item_key`、`related_cycle_id` | `data` 为数组；当前不分页 | `project.view` + `resource:read` + 项目范围 |
| 资料详情 | `GET /api/v1/projects/{project_key}/resources/{resource_id}` | 路径标识 | `data` 为资料；受保护资料拒绝正文读取 | `project.view` + `resource:read` + 项目范围 |
| 资料更新 | `PATCH /api/v1/projects/{project_key}/resources/{resource_id}` | 标题、分类、正文、格式、密码动作、标签、关联工作项/周期 | `data` 为资料 | `project.view` + `resource:write` + 项目内容写权限 |
| 资料解锁 | `POST /api/v1/projects/{project_key}/resources/{resource_id}/unlock` | `access_password` | `data` 为资料 + 短时 `access_token` | `project.view` + `resource:read` + `resource:unlock`；密码错误 `403` |
| 附件列表 | `GET /api/v1/projects/{project_key}/resources/{resource_id}/attachments` | 可选 `access` | `data` 为附件数组 | `resource:read`；受保护资料需要有效 `access` |
| 附件登记 | `POST /api/v1/projects/{project_key}/resources/{resource_id}/attachments` | 文件名、类型、大小、可选明文 checksum | `201` + `data` 为附件 | `resource:write` + 项目内容写权限 |
| 上传请求 | `GET /api/v1/projects/{project_key}/resources/{resource_id}/attachments/{attachment_id}/upload-url` | 可选 `access`、`expires_in_seconds` | `data` 为签名对象请求及加密元数据 | `resource:write`；服务端检查对象存储配置 |
| 上传完成 | `POST /api/v1/projects/{project_key}/resources/{resource_id}/attachments/{attachment_id}/uploaded` | 空 body 或加密 `encrypted_sha256` | `data` 为附件 | `resource:write`；服务端重新检查大小/checksum |
| 下载请求 | `GET /api/v1/projects/{project_key}/resources/{resource_id}/attachments/{attachment_id}/download-url` | 可选 `access`、`expires_in_seconds` | `data` 为签名对象请求及加密元数据 | `resource:read`；受保护资料需要有效 `access` |
| 预览 | `GET/HEAD .../attachments/{attachment_id}/preview[ /content]` | `access`、Range、可选客户端解密标记 | JSON 预览元数据或二进制/206 | `resource:read`；受保护资料需要有效 `access` |
| 附件删除 | `DELETE /api/v1/projects/{project_key}/resources/{resource_id}/attachments/{attachment_id}` | 当前无 `If-Match` | `data` 为已归档附件 | `resource:write`；当前实现尚未原子校验正文引用 |
| 通知列表 | `GET /api/v1/notifications` | `filter`、`limit`、`page`、`per_page` | `data.items` + 计数和分页 | `notification:read` + 当前 Token 用户范围 |

## 授权矩阵

OpenAPI 只声明认证方式；项目范围、RBAC 权限、资料保护前置和拒绝语义由 `api/tests/resource_contract.rs` 的稳定断言维护。当前拒绝路径包括：缺失/无效 Token 为 `401`，项目范围或权限不足为 `403`，受保护资料缺少有效 `access` 为 `403`，对象或资料不存在为 `404`，参数/对象存储校验失败为 `400`。

## 外部动作覆盖矩阵（G2 进入门）

| `qfy-voucher-hub` 脱敏动作 | 当前结论 | 元策领域命令/契约 | 进入 U2 |
| --- | --- | --- | --- |
| 当前 Token 用户确认 | CLI 覆盖 | `whoami` / `GET /api/v1/auth/me` | 是 |
| 资料 list/get | CLI 覆盖 | `resources list/get` | 是 |
| 资料 unlock/update | CLI 覆盖 | `resources unlock/update` | 是，密码仅 stdin、正文使用文件 |
| 附件 list/create | CLI 覆盖 | `resources attachments list/create` | 是 |
| 附件 upload-url/complete | CLI 覆盖 | `resources attachments upload-url/complete` | 是，按 G3 限制 |
| 对象存储 upload/download | 延期至 G3 | 仅保留签名请求查询，是否代传待来源/重定向校验 | 条件进入 |
| 附件 delete | CLI 覆盖 | `resources attachments delete` 携带 `If-Match: resource.updated_at`；服务端事务内重读正文/版本，提交后删除对象 | 是 |
| 资源附件 preview | 仅 OpenAPI 覆盖 | 预览路径和 schema 已登记 | 否 |
| 通知 list | CLI 覆盖 | `notifications list` | 是 |

外部 runbook 明确记录了资料读取、附件登记/签名请求/完成、正文引用切换、旧附件删除和通知查询；本仓库不修改外部项目。该记录证明迁移场景存在，不证明外部项目已经完成迁移。

## G1-G3 结论

- G1：通过。OpenAPI 已补齐当前 U1 范围的资料、附件、通知和当前用户路径；资源列表明确不声明服务端不存在的分页参数。
- G2：通过但带条件。资料查询、解锁、正文更新、附件登记/列表、签名请求查询、完成登记、条件删除和通知进入 U2；对象存储字节代传等待 G3。
- G3：未通过，文件字节代传延期。证据如下：
  - 服务端 `storage::save_config` 当前只要求 Endpoint 以 `http://` 或 `https://` 开头，没有强制生产对象存储使用 HTTPS，也没有把精确允许来源写入签名响应。
  - 测试对象存储签名请求使用 `/api/v1/test-storage/...` 相对 URL；该 URL 只能在服务端测试路由内解释，不能作为 CLI 通用对象传输来源。
  - 生产签名请求由 OpenDAL 返回完整 URL 和 headers，但当前响应没有独立的来源约束字段；CLI 若仅信任 URL，就无法证明来源白名单、私有地址解析和重定向后的目标约束。
  - CLI 当前只有带 Bearer Token 的 API JSON client，尚未有独立的 signed-object transport；因此不能安全执行签名请求，也不能证明不会把 API Authorization 转发到对象存储。
  - 结论：本轮只保留 `upload-url`、`download-url` 查询和 `uploaded` 完成登记；`upload`、`download` 文件字节命令延期，不通过放宽 URL、重定向或 Header 规则解决。
- G4：尚未具备。当前只完成脱敏动作映射，不能宣称已经替代 `qfy-voucher-hub` 的现有封装。

## U2-U4 验证与交付结论

### 已实现

- OpenAPI 已登记当前用户、资源查询/解锁/更新、资源附件登记/列表/上传 URL/完成登记/下载 URL/预览/条件删除和通知列表路径，并为 CLI 目标操作提供 `operationId`、请求体、响应 envelope 和敏感字段说明。
- Rust CLI 已提供 `whoami`、`resources list/get/unlock/update`、附件 `list/create/upload-url/complete/download-url/delete` 和 `notifications list`；资料列表没有伪造分页参数。
- 服务端附件删除已使用 `If-Match: resource.updated_at`，SQLite 事务内重读资料正文、版本和附件归属；正文仍引用附件或版本变化返回 `409`，数据库提交后才删除对象。
- Skill、命令参考、工作流、错误说明、OpenAI 元数据和安装迁移文档已同步；外部内容被标记为不可信数据。

### 验证结果

- `cargo test -p yuance-api --test routing_smoke --test resource_contract`：通过，29 个路由 smoke + 4 个资源契约测试。
- `cargo test -p yuance-agent --test api_client --test cli_contract --test command_flow --test openapi_contract --test skill_package`：通过，6 + 5 + 8 + 3 + 5 个测试。
- `bash scripts/test-yuance-agent-real-api.sh`：通过，本地临时 SQLite + 真实 API/CLI 二进制覆盖项目范围、查询、创建、详情、评论、回复、更新、handoff、401 和 403；该脚本未覆盖本轮资料/附件/通知流程，不计为 G4 真实试点。
- `bash scripts/test-install-codex-skill.sh`：通过。
- `bash scripts/validate-yuance-agent-release.sh yuance-agent-v0.1.1`：通过版本与安装器一致性校验。
- `python3 -m json.tool docs/openapi/yuance.openapi.json`、`git diff --check`：通过。
- `cargo clippy -p yuance-api -p yuance-agent --all-targets -- -D warnings`：未通过。失败项主要来自仓库既有 lint（`device_sessions.rs`、`projects.rs`、`platform/config.rs`、既有 API helper 和测试模块布局），本轮未进行无关清理；CLI 新增命令本身已通过测试和编译。

## 残余差异

1. 对象存储字节代传仍未进入 CLI；签名 URL 查询和完成登记已覆盖，文件上传/下载需先补齐 HTTPS Endpoint、精确来源白名单、重定向策略和独立传输层的安全证据。
2. OpenAPI 中 `encryption.key`、签名请求 headers 和短时 `access` 已标为敏感；CLI 查询路径遵守 stdin/当前进程边界，但对象存储字节代传仍延期，未宣称完成加密文件互通。
3. 真实 Token、测试项目和可控明文/加密附件未提供，G4 未具备；本轮完成状态为“具备迁移能力，未完成真实试点”，不能宣称已经替代 `qfy-voucher-hub` 的现有封装。

## 最终状态

本计划范围内的契约、CLI、Skill 和安装包同步已完成；对象存储文件字节上传/下载和真实外部试点保留为后续工作。外部 `qfy-voucher-hub` 未被修改。
