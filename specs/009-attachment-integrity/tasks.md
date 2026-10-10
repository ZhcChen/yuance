# 附件上传与删除一致性任务

输入：`spec.md`、`plan.md`

状态：实施完成，独立复核与最终收敛中

## 维护与执行约束

- 已有任务先读取再增量维护，保留稳定 ID、完成状态、人工备注和验证证据；不复制模板覆盖旧任务。
- 每项任务写清需求编号、文件范围、依赖和可验证结果；只在真实依赖或用户场景需要时拆阶段。
- 必须包含匹配风险的验证任务，可复用已有测试、构建或静态检查；不要求每项修改新增测试，也不默认要求 TDD。
- `[P]` 仅表示无未完成依赖且文件无交集；并行写入还必须隔离 worktree，并显式使用不同需求目录。
- 代码 review、真实验证和运行/部署授权不能由 analyze、converge 或主 agent 自评替代。

## 阶段一：上传对象不可变与摘要一致（US1、US2）

- [x] T001 [US1] FR-001/FR-004/FR-005/FR-014 在 `api/src/domains/storage.rs`（并按需更新 `api/Cargo.toml`）为 OSS 预签名 PUT 设置 `if_not_exists`，并增加基于对象原存储配置的定位、固定缓冲区、有单次读取超时、核对读取长度的 SHA-256 流式校验；依赖 OpenDAL 0.57 API，超限/读取错误/摘要不符均不得改变 DB 状态。
- [x] T002 [US1] FR-001 在 `api/src/web/api/mod.rs` 的附件与系统发布资产上传签名入口只允许 `pending` 状态；覆盖资料、项目、工作项、评论和系统发布资产的 PUT 签名入口。
- [x] T003 [US1] FR-005 在 `api/src/domains/storage.rs` 与 `api/src/web/test_storage.rs` 使 memory 测试上传对已存在对象执行条件写入；提供只在 test 环境生效的可控删除失败注入，用于阶段二验收；依赖 T001。
- [x] T004 [US2] FR-002/FR-003 在 `api/src/domains/files.rs` 增加保存服务端实算摘要的条件状态更新；校验影响行数，并仅在现有 `uploaded` 状态、大小和摘要完全一致时允许幂等重复确认。
- [x] T005 [US2] FR-003/FR-004/FR-009 在 `api/src/web/api/mod.rs` 的项目、资料、工作项、评论及系统发布资产完成 handler 中调用对象摘要校验；普通明文附件比对登记值，加密资料附件比对 `encrypted_sha256`，系统发布资产比对 manifest SHA-256，不匹配时保持 `pending`；依赖 T001、T004。
- [x] T006 [US1] FR-001/FR-002 在 `api/tests/project_management_flow.rs` 增加上传完成后重新签名拒绝、相同对象 PUT 重放失败、错误摘要不登记、同摘要完成重试成功/异摘要冲突、并发完成状态稳定等隔离测试；依赖 T001–T005。
- [x] T007 [US2] FR-003/FR-011 在 `api/tests/device_business_parity_flow.rs` 覆盖真实密文摘要匹配/不匹配，以及现有加密下载解密与明文摘要回读；依赖 T001、T004、T005。
- [x] T007a [US2] FR-009 在 `api/tests/system_management_flow.rs` 覆盖系统发布资产 pending 限制、manifest SHA-256 匹配/不匹配、条件上传防覆盖和完成幂等；依赖 T001、T005。
- [x] T007b [US2] FR-014 在 `api/tests/project_management_flow.rs` 或 `api/tests/storage_config_flow.rs` 覆盖切换活动配置后上传签名、完成校验及读取仍使用文件对象创建时的 Bucket；相同 key 不得跨 Bucket 混淆；依赖 T001。

## 阶段二：资料附件删除持久重试（US3）

- [x] T008 [US3] FR-006/FR-007 新增 `api/migrations/202610100001_create_file_object_deletion_jobs.sql`，记录唯一文件对象任务、原存储配置/位置快照、状态、attempt、65 分钟 not-before、退避时间、lease token、错误和完成时间，并建立 due-job 索引。
- [x] T009 [US3] FR-006/FR-008/FR-013 在 `api/src/domains/files.rs` 将正文引用、If-Match、其他有效关系共享引用检查、逻辑删除和 outbox 登记放入同一个事务；保留项目附件仅归档和评论附件现有顺序；依赖 T008。
- [x] T010 [US3] FR-007 在 `api/src/domains/storage.rs` 按任务绑定的存储配置删除对象；不得使用不匹配的活动 Bucket 完成任务，对象 NotFound 仅在原位置确认后视为成功；依赖 T008。
- [x] T011 [US3] FR-006/FR-007 在 `api/src/domains/files.rs` 实现带 lease token 的原子任务领取、幂等删除、有限指数退避、失败诊断及 fencing 更新；维护入口只处理删除后至少 65 分钟的到期任务；依赖 T008、T010。
- [x] T012 [US3] FR-006 在 `api/src/web/api/mod.rs` 资料附件删除 handler 中仅提交逻辑删除/outbox 并立即返回，不在旧 PUT URL 最长有效期加时钟余量之前物理删除；依赖 T009、T011。
- [x] T013 [US3] FR-006 在 `api/src/app/files.rs`、`api/src/app/mod.rs` 增加 `files cleanup-deleted` 显式维护命令，支持 `--dry-run`、`--limit` 并输出成功/失败/待处理摘要；依赖 T011。
- [x] T014 [US3] FR-006/FR-007/FR-008/FR-013 在 `api/tests/project_management_flow.rs` 和 `api/tests/cli_files_flow.rs` 验证安全窗口前不清理（直接推进隔离 DB 时间，不真实等待）、对象删除失败后重试、服务状态重启后可恢复、原 Bucket A 切换至 Bucket B、NotFound 幂等、过期 lease token fencing、共享对象引用保护及引用/If-Match 拒绝不创建任务；依赖 T008–T013。
- [x] T015 [US3] FR-006/FR-007 更新 `docs/runbooks/file-maintenance.md`，说明 dry-run/重试、退避、原存储配置定位和现有附件删除语义边界；更新 `docs/runbooks/aliyun-oss-manual-validation.md`，要求关闭 Bucket 版本控制并手工验证 `x-oss-forbid-overwrite`；依赖 T001、T013。

## 阶段三：OpenAPI、CLI 与 Skill 契约（US4）

- [x] T016 [US4] FR-010 修正 `docs/openapi/yuance.openapi.json`：`/uploaded` 不要求 `If-Match`、成功必须返回 `status=uploaded`、同摘要重复确认幂等且异摘要冲突、服务器实算摘要语义、资料附件删除要求该头、`ExpiresInSeconds` 范围与服务端 60–3600 秒一致、上传 URL 不声明未使用的访问 token；hash schema 改为小写十六进制，并声明 API 1 GiB 上限。
- [x] T017 [US4] FR-010 在 `tools/yuance-agent-cli/src/commands/resources.rs` 让上传 URL 请求不发送访问 token、在创建远端附件前拒绝超过 128 MiB 的 CLI 传输、并在复合上传完成后验证响应 `data.status == "uploaded"`；完成确认的已知 4xx 为确定拒绝，其余 HTTP 状态与网络/响应丢失均按结果不确定处理。CLI 128 MiB 传输上限保持不变并明确文档化。
- [x] T018 [US4] FR-010/FR-011 更新 `skills/yuance-agent/SKILL.md`、`skills/yuance-agent/references/workflows.md`、`references/commands.md`、`references/errors.md` 的上传摘要、重试、访问 token 和删除说明；更新 CLI 参数/parser、OpenAPI 小写摘要 schema、大小上限及错误恢复契约测试。

## 阶段三补充：独立复核发现

- [x] T021 [US3] FR-006/FR-008/FR-014 在 `api/migrations/`、`api/src/domains/files.rs`、`api/src/web/api/mod.rs` 记录最后一张上传签名 URL 的有效期；签名结果仅在附件仍 pending 时返回，删除任务最初至少延迟 65 分钟且不得早于最后签名过期后 5 分钟（此安全窗由 T025 扩展为 4 小时 5 分钟）；待处理任务保留原存储配置引用至成功完成，并拒绝删除仍被 `system_release_assets` 引用的对象；补隔离测试。
- [x] T022 [US4] FR-010 在 `tools/yuance-agent-cli/src/commands/resources.rs` 将 PUT 响应失败归类为结果不确定；加密流已完整消费时返回附件 ID 和同次密文摘要，并覆盖对象存储已完整收到请求体但返回 500 的恢复场景；同步 Skill 错误与恢复文档。
- [x] T023 [US4] FR-010 修复 `tools/yuance-agent-cli/src/commands/resources.rs` 哈希后文件大小竞态、完成确认 3xx 分类和 `docs/openapi/yuance.openapi.json` 上传签名响应；增加回归测试。
- [x] T024 [US3] FR-007 在 `api/src/app/files.rs`、`api/src/app/mod.rs`、`api/src/domains/files.rs`、`Makefile` 增加未完成删除任务有界诊断命令，输出截断/单行错误并隐藏位置值；通过 CLI 集成测试验证失败非零退出、错误可读及修复后重试；文档说明生产 Compose 诊断入口和 Bucket 版本控制下物理清除边界。

## 阶段四：复核与交付

- [x] T019 FR-001—FR-018 执行 `quickstart.md` 定向验证、`git diff --check` 和 Spec Kit analyze/converge；记录结果及未验证的 OSS 边界；依赖 T021—T024、T025、T026—T036。验证：`project_management_flow` 105/105、`system_management_flow` 22/22、`cli_files_flow` 8/8、加密附件 parity 1/1、`yuance-agent` 全部通过；`make deploy-safety-test` 18/18（默认 shell 与 `/bin/dash`）、`make deploy-validate` 通过；analyze/converge 结构检查通过，语义核对覆盖 18 项 FR、12 项 SC，未发现未映射要求或宪章冲突；`git diff --check` 通过。真实 OSS/正式环境不在本轮验证范围。
- [x] T020 FR-001—FR-018 完成独立数据完整性、安全和 CLI 契约复核；按 review 结论修复并更新 `docs/reviews/` 复核记录，不自动部署；依赖 T019。验证：独立复核确认评论草稿多附件事务失败可整体回滚、资料/评论/发行资产共享引用受保护、迁移标记阶段边界和恢复规则一致；新增/更新证据见 `docs/reviews/2026-10-10-attachment-integrity-review.md`。未发现必须修复缺陷；并发发布作为 Runbook 串行前置条件保留。

## 阶段四补充：复核修复

- [x] T025 [US3] FR-006/SC-004 在 `api/src/domains/files.rs` 将删除任务延后至最后 PUT URL 到期后 4 小时 5 分钟，覆盖 OSS 已接收且仍在途的 PutObject；同步规格、OpenAPI、Skill 与运维文档，并用隔离数据库验证窗口；依据独立复核及阿里云 PutObject 请求时限文档。

## 阶段四补充：评论与系统发布资产删除收敛

- [x] T026 [US3] FR-006/FR-007/FR-008 在 `api/migrations/202610100002_track_file_upload_url_expiration.sql` 为迁移前既有文件对象回填保守有效期（当前时间后 1 小时），使之后的清理至少等待该有效期再加 4 小时 5 分钟；在 `api/src/domains/files.rs` 提取可在调用方事务中复用的原存储配置快照、状态转换和唯一删除任务登记逻辑；保留已有资料附件正文/If-Match/共享引用约束；依赖 T008、T021、T025。验证：迁移回填测试通过；清理任务窗口测试通过。
- [x] T027 [US3] FR-006/FR-008/FR-011 在 `api/src/domains/projects.rs`、`api/src/web/api/mod.rs` 将评论内联附件删除与取消草稿改为同事务更新正文/主帖摘要、标记可删除的对象并创建 outbox，移除 handler 的同步 OSS 删除；共享对象不得被全局标记删除；在 `api/tests/project_management_flow.rs` 验证立即返回时对象仍存在、任务可见及到期后清理成功；依赖 T026。验证：评论附件删除、状态竞争、主帖摘要同步、多附件草稿清理集成测试通过。
- [x] T028 [US3] FR-006/FR-008/FR-009/FR-014 在 `api/src/web/api/mod.rs` 为系统发布资产签名持久记录 URL 有效期；在 `api/src/domains/system_releases.rs` 将单资产删除及保留裁剪改为事务内移除关系并为无其他有效引用对象登记 outbox，不同步删除 OSS、不物理删除被任务引用的 `file_objects`；更新 `api/tests/system_management_flow.rs` 覆盖任务窗口、原配置快照、共享引用和清理完成；依赖 T026。验证：`system_management_flow` 22 项通过。
- [x] T029 [US3] FR-006/FR-008/FR-010 在 `docs/openapi/yuance-system.openapi.json` 与契约测试中补充发行资产删除响应/逻辑删除语义；更新 `docs/runbooks/file-maintenance.md` 和 `docs/runbooks/production-deployment.md` 中覆盖的对象类型及迁移安全窗口；在 `docs/reviews/` 记录评论附件、系统发行资产删除复核结论；依赖 T027、T028。验证：OpenAPI JSON 均通过 `jq empty`；`cargo test -p yuance-api --test system_management_flow` 22 项及 `cargo test -p yuance-agent` 全部通过。
- [x] T030 [US3] FR-015 在 `scripts/deploy-production.sh` 的本地 WSL 与远程发布路径中将 API 优雅停止安排在迁移回填前，再从 Compose bind mount 宿主源生成强制 SQLite 快照；必需模式只接受 `$APP_DIR/data/yuance.sqlite3`，不得回退至宿主机 `/data/yuance.sqlite3`。停止/快照失败及迁移前信号中断时迁移未执行并尝试恢复原本运行的 API；迁移开始后失败保持停机。`resolve-stop-timeout.sh` 从目标机 `.env` 安全解析停机宽限期，支持 `=`/`:` 格式，显式参数可覆盖，外层超时为宽限期加 60 秒并传递给 Compose；`validate-production-database.sh` 约束数据库和数据目录路径。验证：`make deploy-safety-test` 18/18、`make deploy-validate` 通过。
- [x] T031 [US3] FR-008/FR-016 在 `api/src/domains/files.rs`、`api/src/domains/projects.rs` 和 `api/src/domains/system_releases.rs` 将软删除但可恢复的工作项附件作为保护性共享引用；在工作项恢复事务内检查历史删除状态/任务并使用 `BEGIN IMMEDIATE` 与清理任务创建串行化；在 `api/tests/project_management_flow.rs` 验证共享对象不会建队列、恢复/删除并发、正常恢复及历史队列拒绝恢复。验证：`cargo test -p yuance-api --test project_management_flow` 104/104；任务存在与对象 deleted 分支分别独立覆盖，并发测试断言具体保护冲突。

## 阶段五：收敛发现

- [x] T032 [US3] FR-017/SC-011 在 `api/src/domains/files.rs`、`api/tests/cli_files_flow.rs` 与文件维护 Runbook 中让 pending 软删除同时受创建年龄和最后上传签名到期后 4 小时 5 分钟约束；COUNT 与实际 UPDATE 共用谓词，坏时间戳保留；验证未签名、在途、窗口已过和无效时间戳对象的 dry-run/实际状态，并覆盖陈旧对象重新签发更长 URL 后仍不被清理。验证：`cargo test -p yuance-api --test cli_files_flow` 8/8。
- [x] T033 [US3] FR-018/SC-012 在 `api/src/domains/files.rs`、`api/tests/cli_files_flow.rs` 与文件维护 Runbook 中将 `system_release_assets` 纳入 attached/orphan 所有者关系并补领域与 CLI 统计测试；领域与 CLI 夹具均验证同一对象同时由 `file_attachments` 和 `system_release_assets` 持有时只计一个 attached。验证：`cargo test -p yuance-api --test cli_files_flow` 8/8。
- [x] T034 [US3] FR-015/SC-010 在 `scripts/deploy-production.sh`、`deploy/easy-deploy/production/backend/scripts/validate-production-database.sh`、`00-backup-sqlite.sh` 和 `with-clean-backup-env.sh` 隔离必需 SQLite 快照环境：校验并固定 `YUANCE_DATA_DIR` 为空或 `/data`，清除继承的数据目录变量，快照密钥解析兼容 Compose 的 `=`/`:` 格式；行为测试覆盖错误 SQLite/数据/备份路径和文件主密钥环境覆盖。验证：`make deploy-safety-test` 18/18、`make deploy-validate` 通过。

## 阶段六：收敛发现

- [x] T035 FR-015 由迁移执行程序在环境解析、数据库连接和迁移历史校验成功后、调用迁移器前创建并同步部署阶段标记；本地与远程退出/信号清理仅在标记不存在时恢复旧 API，并在 trap 安装前初始化可选标记路径。回归测试锁定容器启动/`migrate status` 失败时标记不存在、`migrate up` 前置校验后才写标记及迁移前恢复分支。验证：`cargo test -p yuance-api app::migrate::tests` 2/2；`make deploy-safety-test` 18/18；`make deploy-validate` 通过。标记后、迁移器首条 SQL 前的极窄中断窗口按保守策略保持停机。

- [x] T036 FR-015 在 `docs/runbooks/production-deployment.md` 中明确当前发布脚本不提供同一 Docker Engine 上的互斥锁，要求单发布者串行运行，避免共享 `latest` 镜像标签交错与前缀清理误删其他发布的维护容器；将目标机发布锁和按发布 ID 定向清理记录为后续工程改进，不把当前运维前置条件表述为代码保证。

## 验收证据

实施与验证：未访问正式环境或正式 OSS，未部署。已完成隔离数据库、memory 存储、API、CLI、OpenAPI、Skill、部署模板与发布安全测试；评论附件和系统发行资产也使用同一持久清理队列。验收覆盖对象摘要/DB 状态回读、删除失败注入与重试、签名到期安全窗、陈旧对象续签、共享资产引用保护及去重、Bucket 切换、恢复并发和部署顺序。Spec Kit analyze/converge 结构检查及语义核对完成，独立复核记录位于 `docs/reviews/2026-10-10-attachment-integrity-review.md`。真实 OSS 的版本控制及 `x-oss-forbid-overwrite` 行为仍未验证。
