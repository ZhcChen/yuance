# 本机验收步骤

所有测试必须使用项目隔离测试数据库和 memory 存储，不使用正式数据库、正式 OSS 或真实用户数据。

1. 定向验证附件上传生命周期与摘要：

```bash
cargo test -p yuance-api --test project_management_flow api_v1_attachment_
```

预期：缺对象、大小/MIME 错误、错误摘要、上传 URL 重放和重复完成路径均符合契约；失败登记仍为 `pending`。

2. 验证加密资料附件完整传输：

```bash
cargo test -p yuance-api --test device_business_parity_flow device_principal_matches_business_read_write_and_revocation_contract
```

预期：加密附件服务端摘要确认、下载解密和已登记明文 SHA-256 行为不变。

3. 验证资料、评论附件和系统发行资产删除任务：

```bash
cargo test -p yuance-api --test project_management_flow resource_attachment_
cargo test -p yuance-api --test project_management_flow api_v1_can_delete_draft_comment_attachment_and_cleanup_object
cargo test -p yuance-api --test project_management_flow comment_attachment_delete_rejects_stale_draft_state
cargo test -p yuance-api --test project_management_flow deleting_primary_post_attachment_keeps_work_item_summary_in_sync
cargo test -p yuance-api --test project_management_flow api_v1_can_cancel_own_comment_draft_and_cleanup_all_attachments
cargo test -p yuance-api --test project_management_flow deleted_work_item_attachment_protects_a_shared_file_object_from_cleanup
cargo test -p yuance-api --test project_management_flow restoring_work_item_
cargo test -p yuance-api --test system_management_flow api_system_release_asset_delete_queues_cleanup_and_preserves_shared_objects
cargo test -p yuance-api --test system_management_flow api_system_release_flow_supports_publish_and_retention_prune
cargo test -p yuance-api --test system_management_flow legacy_file_objects_receive_conservative_upload_expiry_backfill
cargo test -p yuance-api --test cli_files_flow
cargo test -p yuance-api --test cli_files_flow cleanup_pending_marks_only_expired_pending_file_objects_deleted
cargo test -p yuance-api --test cli_files_flow audit_file_objects_counts_attached_and_orphan_records
cargo test -p yuance-api --test cli_files_flow files_audit_objects_cli_reports_default_and_include_deleted_counts
```

预期：资料正文引用冲突/If-Match 和共享对象保护生效；评论删除保持正文与主帖摘要一致，取消草稿后附件对象登记清理任务；系统发行资产签名有效期被持久记录，单项删除与保留裁剪登记任务，共享对象不会被标记删除；旧数据库迁移为已有对象回填保守有效期。pending 清理覆盖未签名、签名仍在途、已过安全窗、非空无效时间戳，以及陈旧对象重新签发更长 URL 后仍保持 pending；dry-run 与实际更新只处理相同安全集合。文件盘点覆盖同一对象同时由资料附件和系统发行资产持有时仍只计一个 attached。任务至少等待 65 分钟且覆盖最后签名有效期后的 4 小时 5 分钟；通过隔离 DB 推进 `next_attempt_at` 验证最终清理，不真实等待；到期后注入物理删除故障时逻辑删除持续生效、失败诊断可读取、恢复后重试可完成；Bucket 切换不会误删错对象。

系统发布资产同时验证 manifest 摘要契约：

```bash
cargo test -p yuance-api --test system_management_flow system_release_asset_
```

4. 验证客户端和公开契约：

```bash
cargo test -p yuance-agent --test command_flow
cargo test -p yuance-agent --test openapi_contract
cargo test -p yuance-agent --test skill_package
cargo test -p yuance-agent commands::resources::tests
make deploy-safety-test
make deploy-validate
```

预期：CLI 不给上传签名请求发送访问 token，并验证完成响应状态；PUT 响应不确定时返回附件 ID 和可用密文摘要；完成确认 3xx 不被误报为拒绝；哈希后的文件大小仍受 CLI 128 MiB 上限检查；OpenAPI 上传签名错误响应齐全，Skill 说明恢复步骤。

5. 验收边界：memory 存储测试可证明应用状态行为，不能证明 OSS Bucket 的版本控制配置和真实 `x-oss-forbid-overwrite` 行为。真实 OSS 验收按 `docs/runbooks/aliyun-oss-manual-validation.md` 执行，但本轮不执行。

6. 发布恢复边界：`make deploy-safety-test` 锁定维护容器启动、状态检查、迁移标记和 API 恢复的静态控制流；`migrate up` 在自身前置校验通过后写入标记，再调用迁移器。标记后的窄中断窗口保守保持 API 停止。当前未运行真实 Docker 发布，也未对部署过程注入 TERM；同一 Docker Engine 上须单发布者串行操作。
