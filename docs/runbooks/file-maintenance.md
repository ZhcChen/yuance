---
title: 文件与附件维护
type: runbook
status: active
date: 2026-06-30
---

# 文件与附件维护

元策附件采用三阶段直传流程：

1. 登记 `file_objects` 和 `file_attachments`，文件对象状态为 `pending`。
2. 浏览器或客户端通过短期签名 URL 直传对象存储。
3. 上传完成后调用 `.../uploaded` 校验对象并把状态改为 `uploaded`。

如果用户关闭页面、网络中断或对象存储上传失败，可能留下长期 `pending` 文件对象。为避免这些记录长期占用附件列表，提供显式维护命令将过期 `pending` 标记为 `deleted`。

## 文件对象盘点

盘点命令只读取 SQLite，不修改数据库，也不访问或删除 OSS 物理对象。它用于发现 `file_objects` 中没有任何 `file_attachments` 关联的记录，便于后续人工排查 pending 中断、业务附件关系缺失或历史清理边界。

```bash
cargo run -p yuance-api -- files audit-objects
```

默认不把 `status = 'deleted'` 的文件对象计入总量和孤儿数量。需要审计历史删除记录时使用：

```bash
cargo run -p yuance-api -- files audit-objects --include-deleted
```

或使用 Makefile：

```bash
make api-files-audit-objects
make api-files-audit-objects INCLUDE_DELETED=1
```

输出示例：

```text
file object audit: total=12 attached=10 orphan=2 pending_orphan=1 uploaded_orphan=1 deleted_orphan=0 include_deleted=false
```

字段含义：

- `total`：参与本次统计的文件对象总数。
- `attached`：至少存在一条附件关系的文件对象数。
- `orphan`：没有任何附件关系的文件对象数。
- `pending_orphan`：仍处于 pending 的孤儿对象，常见于上传流程中断。
- `uploaded_orphan`：已标记 uploaded 但没有业务附件关系的对象，应人工确认是否为异常挂载。
- `deleted_orphan`：已删除状态的孤儿对象；默认不计入，只有 `--include-deleted` 时参与统计。

## 查看将被清理的记录

```bash
cargo run -p yuance-api -- files cleanup-pending --older-than-hours 24 --dry-run
```

输出示例：

```text
pending file cleanup dry-run: matched=3 older_than_hours=24
```

## 执行清理

```bash
cargo run -p yuance-api -- files cleanup-pending --older-than-hours 24
```

或使用 Makefile：

```bash
make api-files-cleanup-pending HOURS=24
```

清理行为：

- 只处理 `status = 'pending'` 的 `file_objects`。
- 只处理创建时间早于 `older-than-hours` 的记录。
- 不影响 `uploaded` 文件。
- 不影响已经 `deleted` 的文件。
- 当前只做数据库软删除标记，不主动删除 OSS 对象。

## 对象物理删除边界

当前版本的删除语义是“业务不可见 + 下载阻断”：

- 删除附件会把 `file_objects.status` 标记为 `deleted`。
- API 和页面不再为 deleted 附件生成下载签名。
- 系统不会主动删除 OSS 中的物理 object。

这样做可以避免误删真实业务文件，也便于审计和人工恢复。若后续要增加物理删除，需要先补齐：

- 删除对象前后的审计日志。
- 删除失败的重试和告警。
- DB 状态与 OSS 物理对象状态不一致时的盘点命令。
- 明确的保留期和回收策略。

## 建议策略

- 开发和测试环境可按需手动执行。
- 生产环境建议先执行 `--dry-run`，确认数量符合预期后再执行正式清理。
- 单体部署可以通过系统 crontab 定期执行，例如每天凌晨清理 24 小时前的 pending 文件。
- 如果后续引入实际对象物理删除，应先补充对象存储删除审计和失败重试策略。
- 真实阿里云 OSS 接入后的手工验证见 `docs/runbooks/aliyun-oss-manual-validation.md`。
