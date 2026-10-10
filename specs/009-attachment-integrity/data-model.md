# 数据模型

## 文件对象状态与摘要

`file_objects` 继续作为附件状态的权威记录，新增仅用于上传签名安全窗的时间字段：

| 字段 | 语义 | 写入条件 |
| --- | --- | --- |
| `checksum_sha256` | 明文附件实际内容 SHA-256；加密资料附件的明文摘要声明；系统发布资产的 manifest SHA-256 | 普通明文完成登记时保存服务端实算值，非空声明必须匹配；加密资料附件由客户端解密时按文件格式头和明文实算值校验；系统发布资产完成时必须与服务端实算对象摘要匹配 |
| `encrypted_checksum_sha256` | 加密附件对象实际密文 SHA-256 | 完成登记时服务端实算并与请求值匹配 |
| `byte_size` | 明文原始大小 | 完成登记仍需确认明文对象大小，密文大小按加密格式计算 |
| `storage_config_id`、`provider`、`bucket`、`object_key` | 对象创建时的存储位置和最终 key | 清理任务从此记录及其对应配置快照绑定目标 |
| `upload_url_expires_at` | 最近成功签发的 PUT URL 的 UTC 最晚过期时间，按秒保存 | 只有对象仍为 `pending` 时才能单调延长；删除事务用它计算安全窗口；迁移前历史对象回填迁移时刻后 1 小时 |
| `status` | `pending`、`uploaded`、`deleted` | 上传完成用条件更新；资料/评论/系统发行删除与任务创建同事务；项目附件仍仅归档 |

## `file_object_deletion_jobs`

| 字段 | 约束/语义 |
| --- | --- |
| `id` | 主键 |
| `file_object_id` | 唯一；引用待清理文件对象，保留任务时不物理删除文件记录 |
| `storage_config_id` | 原配置外键，未完成时使用 `ON DELETE RESTRICT` 保留 Operator 凭证来源；清理成功后置空 |
| `provider`, `endpoint`, `region`, `bucket`, `object_key` | 创建任务时的不可变位置快照；不含访问密钥 |
| `status` | `pending`、`processing`、`completed` |
| `attempt_count` | 已尝试次数，非负 |
| `next_attempt_at` | 首次取逻辑删除后 65 分钟与最近 PUT URL 到期后 4 小时 5 分钟的较晚值，之后为失败退避后的最早重试时间 |
| `lease_until`, `lease_token` | processing 租约与 fencing token；过期任务可被接管，旧 worker 不能提交状态 |
| `last_error` | 最近失败诊断；截断为 500 字符并隐藏对象 key、Bucket、Endpoint 等位置值 |
| `created_at`, `updated_at`, `completed_at` | 任务审计时间 |

关系：资料/评论附件和系统发布资产继续关联 `file_objects`；项目附件保持现有仅归档行为。一个逻辑删除的文件对象最多有一个持久清理任务。待处理任务阻止删除其原存储配置；只有原位置删除成功或原位置对象确认不存在后，任务才能进入 `completed` 并释放配置外键。
