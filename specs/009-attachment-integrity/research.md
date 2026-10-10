# 研究结论

## 上传签名与对象一致性

- 决策：使用 OpenDAL 0.57 `WriteOptions.if_not_exists` 签入对象存储条件写入，memory 测试存储也采用 `if_not_exists(true)`；签名路由仅允许 `pending` 对象。
- 依据：`api/src/domains/storage.rs` 当前预签名只绑定 Content-Type；OpenDAL 0.57 OSS adapter 将该选项转换为 `x-oss-forbid-overwrite: true`，Web/CLI 已允许传递 `x-oss-*` 请求头。
- 限制：阿里云 OSS 在 Bucket 版本控制开启或暂停时该头不提供防覆盖保证；Runbook 明确关闭版本控制并要求真实 OSS 手工验证。拒绝再次签名单独不能解决旧 URL 重放。
- 备选：为上传增加 staging key 并在完成后发布到服务端私有 key，可避免依赖 OSS 条件头，但需要复制/恢复流程和历史 pending 迁移；当前在明确 OSS Bucket 前置条件后不引入该复杂度。

## 摘要校验

- 决策：服务端用 OpenDAL Reader 流式读取对象、固定大小缓冲区增量计算 SHA-256；每次 read 设超时并传播取消/存储错误。先以 stat 校验最大尺寸、长度和 Content-Type，再读对象并再次确认读取字节数。
- 明文附件将实际摘要与登记时非空 `checksum_sha256` 比较；登记值为空时保存实际摘要。加密资料附件将实际密文摘要与客户端 `encrypted_sha256` 比较，再写入 `encrypted_checksum_sha256`。OSS ETag/CRC64 不能充当 SHA-256。
- 重复完成：只有当前已存状态、大小及摘要与刚读到的实际对象完全一致时幂等成功；不一致返回冲突。`pending -> uploaded` 使用条件更新并检查影响行数。
- 约束：业务明文最大 1 GiB；密文最大值按 YUANCE-ENC-v1 的头部及每块 AEAD tag 开销计算。超限、hash 不匹配、读失败均保持 pending。

## 删除重试

- 决策：项目没有后台队列框架，使用 SQLite outbox 表并提供显式文件维护命令；删除 API 在事务写入 tombstone/outbox 后立即返回，物理清理只能在安全窗口结束后执行。
- 上传签名成功后条件记录 pending 文件对象的最晚 PUT URL 过期时间；签名后写回与删除事务通过 SQLite 串行化。OSS 文档说明，在 URL 有效期内开始的 PUT 即使上传过程中 URL 过期仍可完成，且 PutObject 请求须在 4 小时内完成；因此删除任务不早于删除后 65 分钟或最后 URL 到期后 4 小时 5 分钟，以覆盖在途请求并保留 5 分钟余量（[预签名上传说明](https://help.aliyun.com/zh/oss/developer-reference/upload-an-object-using-a-signed-url-generated-with-oss-sdk-for-python-v2)、[PutObject 超时说明](https://help.aliyun.com/zh/oss/user-guide/0017-00000703)）。
- 每个任务保存 `storage_config_id`、provider、endpoint、region、bucket 与 object key 快照。处理时只使用对象创建时的配置 ID 并验证位置快照，不能回退到活动配置或在不同 Bucket 的 NotFound 上结束任务。未完成任务通过外键阻止原配置删除；任务完成后释放该外键。
- 对象 NotFound 视为成功；失败保留任务，使用有限指数退避与过期租约避免重复并发处理。维护命令提供 dry-run、批量上限和可观察的成功/失败计数。
- 资料附件、评论附件和系统发布资产共用物理删除 outbox；评论正文/主帖摘要修改与任务登记同事务，取消评论草稿时先软删评论后只清理无其他保护性附件关系引用的对象。系统发布资产签名同步记录 URL 过期时间，单项删除和保留裁剪都只解除资产关系并登记任务。软删除但可恢复的工作项附件继续保护对象；项目附件仍仅归档。
- 迁移前签名有效期未持久化；新增迁移把所有既有空过期时间回填为迁移时刻后 1 小时，后续删除在此基础上再等待 4 小时 5 分钟，覆盖既有最长 1 小时签名和在途 PUT。
- OSS Bucket 必须关闭版本控制；否则 `DeleteObject` 成功可能只创建删除标记，应用不会清除历史版本。

## 契约

- 上传完成 handler 不读取 If-Match；资料附件删除要求 `If-Match: resource.updated_at`。OpenAPI 应只将删除请求标注为必需。
- `normalize_signed_url_expiration` 的上传有效期范围为 60–3600 秒，OpenAPI 应与之相符。
- 上传 URL 不使用访问解锁 token；下载 URL 才可能使用该 token。CLI 上传请求不应将其放进 query。
- CLI 复合上传完成后必须解析响应中的 `data.status == "uploaded"`，防止服务端响应不完整时报告成功。
