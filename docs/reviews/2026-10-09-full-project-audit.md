# 全项目深入审查（第一轮）

## 标题信息

- 主题：元策全项目 Bug 与可靠性审查
- 关联提交：审查基线 `7aff198`；本轮已完成的发布安全修复为 `aba7b6d`
- 审查范围：Web/桌面端、API/附件存储、OpenAPI/CLI/Skill、发布与本地验收脚本、登录会话
- 负责人：Codex
- 日期：2026-10-09

## 目标与范围

通过只读源码审查、现有测试和隔离调用验证，找出可复现的功能错误、数据一致性风险及契约偏差。未连接正式环境，未读取正式数据、密钥或日志。

本轮已先修复正式发布目标/参数默认值不安全、发布副作用前校验不足、SQLite WAL 备份不一致、恢复密钥材料不完整及备份目录路径隔离问题。修复已提交并推送；没有部署。以下是独立于该提交、仍待处理的发现。

## 发现

### P2：附件上传完成后仍可覆盖对象，客户端摘要也未由服务端核验

- 资料附件 `upload-url` 只拒绝 `deleted`，没有要求对象仍为 `pending`；已上传附件可再次取得指向同一 `object_key` 的 PUT 签名，见 `api/src/web/api/mod.rs:6222`、`api/src/web/api/mod.rs:9266`、`api/src/web/api/mod.rs:9284`。
- 完成登记会接受客户端提供的密文摘要；服务端对象校验目前确认大小和 Content-Type，之后把客户端摘要写入数据库，没有重新计算对象字节摘要，见 `api/src/web/api/mod.rs:6264`、`api/src/domains/storage.rs:772`、`api/src/domains/files.rs:942`。
- 触发后对象内容与数据库摘要可能不一致，后续 CLI/Web 完整性校验失败，附件不可读。建议只允许 pending 对象取得上传签名；登记时确认状态更新确实影响一行；使用对象存储原生校验和或服务端读取哈希校验实际上传内容，并覆盖旧签名重放和错误摘要测试。
- 验证：静态调用链确认；尚无对象存储故障/重放运行时复现。

### P2：附件删除先提交 tombstone，OSS 删除失败后缺少重试路径

- `archive_resource_attachment_if_match` 先将对象标记为 `deleted` 并提交事务，API 随后才删除 OSS 对象，见 `api/src/domains/files.rs:1116`、`api/src/web/api/mod.rs:6561`。
- 若 OSS 删除失败，接口报错但记录已经不可见；再次删除查询会排除 `deleted`，现有清理命令只处理过期 `pending` 对象，见 `api/src/domains/files.rs:1149`、`api/src/domains/files.rs:1182`。
- 建议引入可重试的删除状态/任务表或 outbox，确保对象删除幂等，并能审计、重试已 tombstone 但仍在 OSS 的对象。
- 验证：静态失败路径确认；尚未模拟 OSS 删除故障。

### P2：并发发布会互相删除迁移容器

- 远端脚本启动时及退出时按 `yuance-api-run-`、`yuance-api-maintenance-` 名称前缀删除所有匹配容器；维护容器名只有秒级时间戳，见 `scripts/deploy-production.sh:510`、`scripts/deploy-production.sh:548`、`scripts/deploy-production.sh:559`。
- 两次发布时间重叠时，后一次启动可删除前一次正在运行的迁移容器；前一次退出清理也可能删除后一次的容器，导致迁移中断或发布失败。
- 建议目标机加互斥发布锁，且容器清理只按本次唯一 run ID/标签删除；为并发发布编写隔离测试。
- 验证：静态控制流确认；尚未运行双发布竞态测试。

### P2：桌面端关闭工作项和时间管理请求未映射到桌面 API 能力

- 共享详情页会调用 `api.closeWorkItem(itemKey)`，但桌面 transport 对 `/work-items/{key}` 仅映射 PATCH 更新，不支持 `/close` 操作，未知路由返回 405；见 `frontend/packages/app-shell/src/app.jsx:4151`、`desktop/src/renderer/platform/api-transport.js:461`。
- 共享导航显示“时间管理”，该页面会请求 overview 和 members；桌面 transport 没有这些接口映射，见 `frontend/packages/app-shell/src/app.jsx:1813`、`frontend/packages/app-shell/src/app.jsx:5685`。审查时直接调用确认返回 405。
- 结果是桌面端关闭工作项和时间管理入口不可用。建议补全桌面 host capability/路由，并分别加入实际 transport 测试；若桌面暂不支持，则应按平台能力隐藏入口和操作，而不是显示后失败。

### P2：多文件粘贴内容去重期间仍可提交，可能丢失附件

- 富文本编辑器先异步读取多个粘贴文件并按内容去重，再调用上传回调；这段等待尚未进入上传状态，见 `frontend/packages/ui/src/rich-text.jsx:1315`、`frontend/packages/ui/src/rich-text.jsx:1549`。
- 工作项创建表单只在 `workItemCreatePasteUploading` 为真时禁用提交；该状态从上传回调开始才设置，见 `frontend/packages/app-shell/src/app.jsx:5315`、`frontend/packages/app-shell/src/app.jsx:5375`。
- 用户可在去重尚未结束时提交并关闭表单，后续回调发现编辑器已卸载而跳过上传，造成工作项说明中的附件未保存。建议从粘贴事件开始跟踪 pending 任务，直到上传成功/失败，再允许提交；增加可控延迟的多文件端到端测试。
- 验证：静态时序确认；尚无专门浏览器时序测试。

### P2：本地验收数据库导入未隔离备份目录符号链接

- `scripts/local-validation.sh` 检查状态目录、数据目录和 runtime env 是否为符号链接，却直接 `mkdir -p` 并 `chmod` `BACKUP_DIR`，见 `scripts/local-validation.sh:25`。
- 导入会把当前数据库及 WAL/SHM 移入该目录，见 `scripts/local-validation.sh:80`。若 `.local/validation/backups` 是外部符号链接，命令会越出隔离目录并搬动数据库文件。
- 建议拒绝备份目录及其祖先路径中的符号链接，并确认其物理路径位于本地验收状态目录内；测试外部目标和目录别名。
- 验证：静态控制流确认；尚无符号链接隔离测试。

### P2：CLI 资料更新不能同时提交文件正文和访问密码

- `access_password_stdin` 被声明为与任意 `body_file` 冲突，见 `tools/yuance-agent-cli/src/cli.rs:143`；但更新实现分别读取文件正文和 stdin 密码，见 `tools/yuance-agent-cli/src/commands/resources.rs:359`。
- 因此正文来自普通文件时仍被参数解析器拒绝，不能在一次更新中设置或修改访问密码。建议只禁止两者同时占用 stdin（`body_file == "-"`），并测试参数解析及实际 JSON 请求。

### P2：CLI 无法清空已有资料周期关联

- API/OpenAPI 支持 `related_cycle_id: null` 表示清除；CLI 用 `Option<i64>` 且对 `None` 执行 `skip_serializing_if`，无法发出显式 null，见 `tools/yuance-agent-cli/src/models.rs:133`、`tools/yuance-agent-cli/src/models.rs:151`。
- 不传参数会保留旧关联，因此当前 CLI 没有清除写法。建议增加 `--clear-related-cycle` 或三态输入，并断言请求包含 JSON null。

### P2：CLI 空 `resources update` 会产生真实写入

- `resources update` 未检查是否至少提供一个更新字段，随后仍发 PATCH，见 `tools/yuance-agent-cli/src/commands/resources.rs:359`。
- 服务端会补齐旧值并更新 `updated_at`、修改者及项目活动记录，因此空命令并非无操作。建议与 work-item update 一致，在本地拒绝空更新，并测试无请求、无审计副作用。

### P2：OpenAPI 与附件上传完成、签名有效期的实际契约不一致

- OpenAPI 的资料附件 `/uploaded` 把 `If-Match` 标为必填，并声称服务端校验正文版本；对应 handler 未读取该 header，见 `docs/openapi/yuance.openapi.json:1448`、`docs/openapi/yuance.openapi.json:1458`、`api/src/web/api/mod.rs:6239`。
- OpenAPI `ExpiresInSeconds` 声明 `1–86400`，服务端实际要求 `60–3600`，见 `docs/openapi/yuance.openapi.json:2443`、`api/src/web/api/mod.rs:9394`。
- 生成客户端会强制要求实际不需要的 header，或发送文档允许但服务端拒绝的有效期。建议以实际契约统一文档和实现，补齐缺失/过期 header 及边界 59/60/3600/3601 的契约测试。

### P2：上传签名命令把无效且不需要的访问凭证放入 URL 查询参数

- CLI 的 `upload-url` 与 `download-url` 共用 `access_query`，将 stdin 凭证编码为 `access` query 参数，见 `tools/yuance-agent-cli/src/commands/resources.rs:681`、`tools/yuance-agent-cli/src/commands/resources.rs:762`。
- 上传 URL handler 不使用该访问 token；上传权限由 API token scope 和项目写权限控制。多余 token 会进入请求 URL，增加代理/访问日志留存风险。建议只在下载/解锁契约需要时发送访问 token，并由 OpenAPI、CLI 和命令说明保持一致。

### P3：资料列表 OpenAPI 参数缺少服务端长度约束

- OpenAPI 的 `q` 和 `related_work_item_key` 没有 `maxLength`，但服务端分别限制 120 和 40 字符，见 `docs/openapi/yuance.openapi.json:1122`、`docs/openapi/yuance.openapi.json:1162`、`api/src/domains/project_resources.rs:199`、`api/src/domains/project_resources.rs:209`。
- 合法 schema 输入会在服务端返回 400。建议补齐长度约束和契约边界测试。

### P3：OpenAPI 资料响应 schema 漏列实际字段

- 服务端响应包含 `tags`、`related_work_item`、`related_cycle`，OpenAPI 的 `ProjectResource` 未声明这些字段，见 `api/src/web/api/mod.rs:284`、`docs/openapi/yuance.openapi.json:3843`。
- 当前 schema 未禁止额外字段，所以不直接导致运行失败，但生成客户端无法发现这些字段。建议增加响应 schema 与序列化结构的一致性测试。

### P3：文档预览脚本加载失败后没有可靠重试

- `loadScriptOnce` 将 Promise 按 `src` 缓存；失败 Promise 和失败的 `<script>` 没有从缓存/DOM 移除，后续调用继续复用拒绝态，见 `web/src/platform/browser/document-viewer.js:188`。
- 用户通常只能刷新页面恢复。建议失败时清理对应缓存和节点，并补充失败后重试测试。

### P2：资料列表缺少分页能力（扩展性）

- CLI/API 没有资料列表分页参数，服务端一次 `fetch_all` 返回项目全部匹配资料，见 `tools/yuance-agent-cli/src/cli.rs:78`、`api/src/domains/project_resources.rs:191`、`api/src/domains/project_resources.rs:291`。
- 大型项目会放大响应体和 Agent 上下文占用。建议评估稳定排序下的服务端分页及 CLI `page/per-page`；这是扩展性建议，不是当前错误响应。

## 登录态问题判断

目前源码和专项审查没有证明“正常重新部署必然清除登录态”：Web session 是数据库中的服务端记录，生产 Compose 将数据目录持久挂载，发布脚本保留现有数据与 `.env`。双标签页使用同一主机名时应共享 host-only Cookie。具体掉线仍需用真实失败请求的状态码/响应、浏览器同名 Cookie、实际数据库挂载及稳定密钥进行运行时定位；本轮未访问正式环境，不能归因。

## 已执行验证

- 发布安全改动：`make deploy-safety-test` 12/12；默认 shell 与 `/bin/dash` 均通过，`make deploy-validate`、脚本语法和 `git diff --check` 通过。见 `docs/reviews/2026-10-09-production-release-safety-review.md`。
- 只读专项审查的既有验证：`cargo test --workspace`、`npm run check:frontend` 通过；桌面 transport 17/17、前端 UI 97/97、文档预览加密测试 4/4、认证 transport 8/8 通过。
- 上述通过不覆盖本报告列出的缺失路由、附件重放/错误摘要、OSS 删除故障、发布竞态和粘贴时序；这些均需补充定向测试。

## 建议处理顺序

1. 先封闭附件对象覆盖与摘要信任问题，并为 OSS 删除失败建立可靠重试。
2. 为正式发布加入单实例互斥，避免迁移容器互相清理。
3. 修复桌面端关闭/时间管理能力和粘贴多文件提交竞态。
4. 修复本地验收目录隔离及 CLI/OpenAPI 契约问题。
5. 之后评估文档预览重试、资料分页等可靠性和扩展性改进。

## 结论

- 结论：发现多项可由代码路径确认的问题；第一批正式发布安全问题已修复并推送，其余问题尚未修改。
- 下一步：按建议顺序为附件完整性风险建立 Spec Kit 规格及端到端复现测试，再逐项实施；不因审查结果自动部署。
