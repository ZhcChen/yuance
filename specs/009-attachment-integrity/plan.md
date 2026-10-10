# 附件上传与删除一致性实施方案

- 规格：`spec.md`
- 状态：实现已完成，独立复核中
- 基线：`main` / `a57ee10`

## 技术上下文

- API 使用 Rust 1.94、Axum、SQLx SQLite；附件直传和 OSS 适配集中在 `api/src/domains/storage.rs`、`api/src/domains/files.rs` 与 `api/src/web/api/mod.rs`。
- OSS 由 OpenDAL 0.57 提供，测试环境使用 OpenDAL memory。上传对象最大明文大小为 1 GiB；加密资料附件采用 `YUANCE-ENC-v1`，密文大小由 `file_crypto::encrypted_total_size` 计算。
- `file_objects` 已保留 `storage_config_id`、provider、bucket、object_key 和内容摘要；存储配置按新行版本化，历史配置记录保留原 endpoint、region、bucket 和密钥密文。
- 项目没有通用后台任务框架；文件维护通过 API 二进制的显式 `files` 命令运行。因此删除重试沿用数据库任务表与维护命令，不新增常驻 worker。
- 客户端 OpenAPI/CLI/Skill 当前对完成登记、有效期和 If-Match 声明有偏差；CLI 复合上传已提交本地文件摘要，但未验证完成响应的状态。

## 规范与约束核对

- 遵循 `AGENTS.md`、`docs/runbooks/spec-kit-workflow.md`、`docs/runbooks/api-migrations.md` 和 `docs/runbooks/file-maintenance.md`。
- SQLite 迁移只追加；本轮不运行正式迁移、不访问正式 OSS、不部署。
- 对资料附件、评论附件和系统发布资产执行事务化逻辑删除与物理删除任务；项目附件仍为仅归档。评论正文删除、草稿取消和系统发行资产单项删除/版本裁剪均不得在 API 事务外先行删除 OSS 对象。
- 删除任务必须绑定文件对象原存储配置与 Bucket；不允许在当前活动 Bucket 上收到 NotFound 后错误完成旧 Bucket 的任务。
- 软删除但可恢复的工作项附件仍属于保护性引用，阻止共享对象进入清理队列；恢复软删除工作项与清理任务创建使用 SQLite `BEGIN IMMEDIATE` 串行化，历史对象已进入删除状态或队列时不恢复会产生悬空关系的工作项。
- OpenDAL OSS 的 `WriteOptions::if_not_exists` 会签入 `x-oss-forbid-overwrite`。阿里云 OSS 在 Bucket 版本控制开启或暂停时不保证该头防覆盖；物理清理也要求关闭版本控制，因为 `DeleteObject` 成功不代表历史版本已清除。
- 所有哈希读取保持有界：按对象实际长度校验，使用固定缓冲区流式计算，每次读操作设超时；最大对象大小沿用业务上限。
- 历史签名有效期回填前先停止旧 API，避免迁移完成后仍由旧代码签发未登记的 PUT URL；维护容器未启动、状态预检失败或迁移阶段标记尚未写入时，尝试恢复原本运行的 API；标记在迁移历史校验后、调用迁移器前创建并同步，标记后的失败或中断按保守策略不恢复旧写服务，除非先恢复匹配的数据备份。标记代表迁移阶段即将执行，不证明数据库已发生修改。

## 实现方案与文件范围

1. 上传完整性：在共享签名函数中只允许 `pending` 附件获得 PUT URL；签名写入使用 `if_not_exists`。测试 memory 上传实现相同条件写入。完成接口流式读取 OSS 对象，计算真实 SHA-256，并校验对象长度与 Content-Type；明文附件与创建登记的非空摘要比较，加密资料附件与完成请求的密文摘要比较。只有摘要匹配时才条件更新 `pending -> uploaded`；并发重复完成只在已保存摘要完全一致时作为幂等成功。系统发布资产使用独立 manifest 契约，服务端实算摘要须匹配 manifest SHA-256 后才条件完成。
2. 存储位置一致性：对象签名、实算校验、读取和常规删除均按 `file_objects.storage_config_id` 构建 Operator；活动配置切换后，不影响未完成对象或历史对象的存储定位。缺失原配置时显式报错。
3. 删除重试：新增 SQLite 删除任务表。资料附件删除在同一事务中执行正文引用/If-Match/共享对象引用检查、标记对象 `deleted` 并创建任务；评论附件正文节点删除、主帖摘要同步和任务登记处于同一事务，取消草稿时为未被其他有效关系引用的对象建任务并软删草稿；系统发布资产签名成功后同样记录 URL 有效期，单项删除和版本裁剪在事务内解除资产关系并为无其他有效引用的对象建任务。迁移为现存 file object 回填保守的历史签名过期时间，覆盖迁移前最长 1 小时签名和随后 4 小时 5 分钟的在途请求窗口。所有任务至少等待 65 分钟且不得早于最后签名到期后 4 小时 5 分钟。API 不同步访问 OSS；维护命令可 dry-run、限量处理到期任务并输出待清理与失败信息。处理器使用对象记录的存储配置，而非当前活动配置；NotFound 仅在原配置和 Bucket 上确认后视作成功。任务领取采用原子 lease 与 lease token，防止过期 worker 写回。
3. 契约同步：修正文档中 `uploaded` 的 If-Match 和签名 TTL 边界；上传 URL 不发送未使用的访问 token。CLI 复合上传确认完成响应状态是 `uploaded`。yuance-agent Skill 明确上传完成幂等条件、失败恢复方式与删除的逻辑/物理阶段。
4. 测试覆盖：API 集成测试验证拒绝重复签名、条件 PUT 防重放、错误摘要不转状态、摘要相同完成重试、并发确认和物理删除故障恢复；CLI/OpenAPI 契约测试验证文档与实际请求一致；加密附件既有完整链路和历史阅读行为回归。
5. 发布安全：本地 WSL 与远程部署都从目标机 `.env` 解析 Compose 停机宽限期，仅显式发布参数允许覆盖，并将解析值实际传递给 Compose；外层超时为宽限期加 60 秒。迁移与快照统一使用生产挂载 `sqlite:///data/yuance.sqlite3` 和 `/data`，validator 拒绝非默认数据目录及进程环境覆写；必需快照的宿主机路径严格绑定 `$APP_DIR/data/yuance.sqlite3`，不接受容器内 `/data/yuance.sqlite3` 作为宿主路径。强制快照通过受控环境入口执行，只继承 `PATH`、必需快照标记和 Compose 使用的 `YUANCE_FILE_MASTER_KEY`（若设置），避免其他 `YUANCE_*` 变量改写数据库/数据目录/备份路径，同时保持快照与运行服务的密钥来源一致。文件主密钥解析支持 Compose `.env` 的 `=` 与 `:` 格式。迁移前优雅停止 API，再生成必须成功的最终 SQLite 回滚快照；维护容器或迁移前置检查失败时尝试恢复原本运行的 API。迁移程序在连接数据库并通过迁移历史校验后、调用迁移器前创建并同步阶段标记；标记后失败保持停机。当前脚本没有目标机发布锁，要求同一 Docker Engine 上单发布者串行运行。共享部署配置解析器测试 `.env` 两种分隔格式、边界值、重复/插值配置与默认值；部署脚本契约测试验证停止、快照、迁移、启动顺序及强制快照。
6. 维护一致性：`cleanup-pending` 除年龄外还要求最后上传签名到期后 4 小时 5 分钟安全窗已结束；dry-run 和实际状态更新共用同一谓词，坏时间戳失败关闭。对象盘点以 `file_attachments` 和 `system_release_assets` 的关系并集判定 attached/orphan。

主要范围：

- `api/src/domains/storage.rs`、`api/src/domains/files.rs`、`api/src/domains/system_releases.rs`、`api/src/web/api/mod.rs`、`api/src/web/test_storage.rs`
- `api/src/app/files.rs`、`api/src/app/mod.rs`、`api/src/main.rs`、新增 `api/migrations/*` 与相关 Rust 测试
- `tools/yuance-agent-cli/src/commands/resources.rs`、CLI/API 契约测试
- `docs/openapi/yuance.openapi.json`、`skills/yuance-agent/SKILL.md`、`skills/yuance-agent/references/workflows.md`
- `docs/runbooks/file-maintenance.md`、`docs/runbooks/aliyun-oss-manual-validation.md`
- `scripts/deploy-production.sh`、`deploy/easy-deploy/production/backend/scripts/resolve-stop-timeout.sh`、`deploy/easy-deploy/production/backend/scripts/validate-production-database.sh`、`deploy/easy-deploy/production/backend/scripts/00-backup-sqlite.sh`

## 阶段与依赖

1. P1 上传不变量与存储位置一致性：条件上传、服务端摘要、原子状态更新、按对象原配置定位及隔离集成测试。先完成并验证后再进入清理任务。
2. P1 附件删除 outbox：迁移、历史签名回填、资料/评论/系统发布资产事务创建、原存储配置删除器、CLI 维护重试、失败注入与迁移测试。
3. P2 客户端契约：OpenAPI、CLI 与 Skill 更新及对应请求/响应契约测试。
4. 收敛与复核：执行全量相关测试、静态检查、Spec Kit converge；进行独立安全/数据完整性/CLI 审查并记录复核结果。

各阶段有源码文件重叠，写入按顺序进行；测试分析和只读审查可并行，但不在共享工作区并行修改同一文件。

## 验证与验收

- `cargo test -p yuance-api --test project_management_flow api_v1_attachment_`
- `cargo test -p yuance-api --test system_management_flow system_release_asset_`
- `cargo test -p yuance-api --test project_management_flow resource_attachment_`
- `cargo test -p yuance-api --test device_business_parity_flow device_principal_matches_business_read_write_and_revocation_contract`
- `cargo test -p yuance-api --test cli_files_flow`
- `cargo test -p yuance-agent --test command_flow`
- `cargo test -p yuance-agent --test openapi_contract`
- `cargo test -p yuance-agent --test skill_package`
- `make spec-kit-check FEATURE=specs/009-attachment-integrity STAGE=analyze`
- `make spec-kit-check FEATURE=specs/009-attachment-integrity STAGE=converge`
- 覆盖 1 GiB 附件的上限路径时不构造完整 1 GiB fixture；通过流式单测验证缓冲区上限与读取器错误传播，端到端测试使用可控大小对象并覆盖长度边界。CLI 上传/下载限制仍为 128 MiB，不与 API 容量混同。
- 安全窗口测试直接修改隔离数据库任务时间，不 sleep；覆盖默认 65 分钟及已签发 URL 到期后 4 小时 5 分钟延长窗口；真实 Bucket A 切换模拟保留版本化配置行，验证任务不会回退到活动 Bucket B。
- 真实 OSS 的防覆盖行为及 Bucket 版本控制设置不能由 memory 测试证明；仅记录为 Runbook 手工验收，当前不访问正式环境。

## 运行与恢复

- 追加 SQLite 迁移；本机验证仅通过项目测试环境自动迁移隔离数据库。
- `files cleanup-deleted` 为显式、可重试维护入口，`--dry-run` 不访问对象内容或删除 OSS 对象；不会绕过 65 分钟或最后上传签名 URL 的有效期安全窗口。`files deletion-jobs` 提供有界失败诊断。
- 失败任务保留原存储配置 ID、provider、endpoint、region、bucket 和 object key；遇到存储配置缺失时不得回退到不匹配的活动 Bucket。
- 正式部署、迁移和真实 OSS 手工验证均不在本轮授权范围。
- 删除任务只保存原存储配置 ID 与位置快照，不保存明文凭证；原配置记录必须保留且仍可解密使用。若原配置缺失或凭证不可用，任务应保留并报错，不得使用活动配置代替。
