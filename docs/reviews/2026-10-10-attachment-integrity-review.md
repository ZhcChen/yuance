# 附件上传与删除一致性复核

## 标题信息

- 主题：附件上传对象完整性、跨附件类型的删除重试与发布迁移恢复边界
- 关联规格：`specs/009-attachment-integrity/`
- 审查范围：资料附件、评论附件、系统发行资产、共享对象保护、CLI/OpenAPI/Skill 契约、SQLite 删除任务与正式发布前置检查
- 负责人：Codex
- 日期：2026-10-10

## 目标对齐

复核上传完成确认是否绑定实际对象字节，已完成对象是否能被旧 PUT URL 覆盖，以及资料附件、评论附件和系统发行资产的逻辑删除是否与可重试的 OSS 物理删除任务保持事务一致。项目附件仍按既有语义归档，不进入物理清理队列。

## 已执行验证

- `cargo test -p yuance-api app::migrate::tests`：2/2 通过。
- `cargo test -p yuance-api --test project_management_flow`：105/105 通过，包含评论草稿共享对象保护，以及第二个独占附件清理任务登记失败时整体事务回滚。
- `cargo test -p yuance-api --test system_management_flow`：22/22 通过，包含发行资产删除/裁剪清理、原存储配置快照与跨类型共享对象保护。
- `cargo test -p yuance-api --test cli_files_flow`：8/8 通过，包含清理窗口、对象盘点和失败重试。
- `cargo test -p yuance-agent`：全部通过，覆盖 CLI 上传/下载、OpenAPI 契约和 Skill 包。
- `make deploy-safety-test`：18/18 通过；`make deploy-validate`：通过。
- `YUANCE_TEST_SHELL=/bin/dash node --test scripts/test/production-release-safety.test.cjs`：18/18 通过。
- `make spec-kit-check FEATURE=specs/009-attachment-integrity STAGE=analyze`、`STAGE=converge`：结构检查通过；人工语义核对 18 项 FR、12 项 SC 与任务映射，未发现未映射要求、任务或宪章冲突。
- `cargo test -p yuance-api --test device_business_parity_flow device_principal_matches_business_read_write_and_revocation_contract`：1/1 通过。
- `git diff --check`：通过。
- `cargo test -p yuance-api app::migrate::tests`、发布脚本契约及独立只读复核确认：迁移程序在连接数据库、迁移历史校验成功后，紧邻调用迁移器前创建并同步阶段标记；标记不存在的维护容器启动/状态检查失败路径允许恢复原本运行的 API。
- 独立数据完整性复核确认，评论草稿取消中的软删、共享引用判断、对象状态变化和所有清理任务登记位于同一个 `BEGIN IMMEDIATE` 事务；系统发行资产单项删除和保留裁剪也在单事务内解绑关系并创建清理任务。
- 本轮未访问真实 OSS、正式数据库或正式环境，未执行正式发布；真实 Bucket 版本控制和 `x-oss-forbid-overwrite` 行为仍未验证。

## 主要发现

### 必须修正的问题

- 无。复核中发现的评论草稿批量清理回滚覆盖已补充；失败注入确认前一个对象已成功入队时，后一个对象任务登记失败会回滚前序任务、对象状态和草稿软删。

### 可接受的残留项

- 迁移阶段标记表示迁移器即将执行，不证明数据库已发生修改。标记创建后、迁移器首条 SQL 前收到中断时，脚本会保守保持 API 停止，需由运维按快照恢复或继续发布。
- `make deploy-safety-test` 覆盖发布顺序与恢复分支的静态契约，以及快照脚本的 TERM 清理；尚未运行真实 Docker 发布过程中的 TERM 注入测试。
- 系统发行资产表对 `file_object_id` 有唯一约束，因此同类型发行资产不能共享同一个对象；已覆盖发行资产与项目附件之间的跨类型共享保护。
- `files cleanup-pending` 将过期 pending 对象标记为 `deleted`，但不会创建物理清理任务；历史未完成上传可能仍在 OSS 留下孤儿对象。这不违反本规格当前物理删除对象范围，但需要另行设计受安全窗口约束的 pending 对象回收。

### 建议后续跟进

- 发布脚本未实现同一 Docker Engine 上的发布互斥，并使用可变 `yuance-api:latest`，启动/退出清理按前缀操作维护容器。当前已在正式部署 Runbook 明确单发布者串行这一运行前置条件；建议后续加入目标机锁、按发布 ID 清理以及固定镜像 digest。
- 按 `docs/runbooks/aliyun-oss-manual-validation.md` 在隔离真实 Bucket 验证版本控制关闭、防覆盖条件头和删除后历史版本行为；该验证需要独立授权，本轮未执行。

## 与计划的一致性

- 上传签名仅针对 pending，对象写入禁止覆盖，完成登记依据对象实际长度和摘要更新状态；资料附件、评论附件和系统发行资产的清理任务保留原存储位置快照并按签名安全窗延迟执行，符合规格。
- OpenAPI、CLI 和 yuance-agent Skill 已同步摘要、URL 有效期、完成重试、结果不确定恢复与逻辑/物理删除语义。
- 发布流程先停止 API、生成强制 SQLite 快照，再进入迁移；迁移状态校验通过后才写入阶段标记。没有执行规格排除的正式部署或真实 OSS 验证。

## 回归与风险

- 未发现已验证范围内的确定性数据完整性回归。
- 真实对象存储条件写入及版本控制行为、正式环境迁移/恢复和部署 TERM 动态注入尚未验收。
- 并发发布未由代码互斥，必须遵守 Runbook 单发布者串行前置条件。

## 结论

- 结论：有条件通过。
- 下一步：完成最终差异审查后，按仓库规则提交并同步当前分支；不部署。
