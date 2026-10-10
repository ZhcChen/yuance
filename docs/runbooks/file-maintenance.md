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

盘点命令只读取 SQLite，不修改数据库，也不访问或删除 OSS 物理对象。它用于发现 `file_objects` 中没有任何 `file_attachments` 或 `system_release_assets` 所有者关系的记录，便于后续人工排查 pending 中断、业务关系缺失或历史清理边界。

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

正式环境 Compose 部署可执行：

```bash
cd /srv/yuance/easy-deploy/production/backend
./scripts/80-files-audit.sh
YUANCE_INCLUDE_DELETED_FILES=1 ./scripts/80-files-audit.sh
```

输出示例：

```text
file object audit: total=12 attached=10 orphan=2 pending_orphan=1 uploaded_orphan=1 deleted_orphan=0 include_deleted=false
```

字段含义：

- `total`：参与本次统计的文件对象总数。
- `attached`：至少存在一条 `file_attachments` 或 `system_release_assets` 关系的文件对象数。
- `orphan`：没有上述任一所有者关系的文件对象数。
- `pending_orphan`：仍处于 pending 的孤儿对象，常见于上传流程中断。
- `uploaded_orphan`：已标记 uploaded 但既没有附件关系、也没有系统发行资产关系的对象，应人工确认是否为异常挂载。
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

正式环境 Compose 部署可执行：

```bash
cd /srv/yuance/easy-deploy/production/backend
docker compose --env-file .env -f compose.yaml exec -T api ./yuance-api files cleanup-pending --older-than-hours 24 --dry-run
docker compose --env-file .env -f compose.yaml exec -T api ./yuance-api files cleanup-pending --older-than-hours 24
```

清理行为：

- 只处理 `status = 'pending'` 的 `file_objects`。
- 只处理创建时间早于 `older-than-hours` 的记录。
- 若对象曾签发上传 URL，还必须等到最后一张 URL 到期后 4 小时 5 分钟；从未签发的对象仅按年龄判断。无法解析的非空过期时间会保留，不会按无签名处理。
- 不影响 `uploaded` 文件。
- 不影响已经 `deleted` 的文件。
- 当前只做数据库软删除标记，不主动删除 OSS 对象。

## 附件对象物理清理

资料附件删除时，API 在 SQLite 事务中检查正文引用、`If-Match` 和其他保护性附件关系；评论附件删除会同步移除正文节点及主帖摘要，取消草稿会软删评论；系统发行资产删除或保留裁剪会移除资产关系。以上路径均为无其他保护性关系引用的文件对象登记唯一 outbox 任务，API 不会在请求中直接访问 OSS。项目附件仍只归档，不进入物理清理任务。软删除但可恢复的工作项仍保护其附件对象；若历史清理任务已将关联对象标记删除或正在处理，恢复工作项会返回冲突，不会重新激活可能失效的附件关系。

对象最早在逻辑删除 65 分钟后清理，且不会早于最后一张上传 URL 到期后 4 小时 5 分钟。OSS 可接受 URL 到期前已开始的 PUT 继续上传，单次 PutObject 需在 4 小时内完成，因此清理必须覆盖签名过期后仍在途的请求。迁移前的上传签名没有到期记录；迁移会为已有文件对象保守回填“迁移时刻后 1 小时”的有效期，后续删除据此等待至多 5 小时 5 分钟，以覆盖历史最长 1 小时签名和在途请求。

先查看到期任务和所有未完成任务，不会访问对象存储：

```bash
cargo run -p yuance-api -- files cleanup-deleted --dry-run --limit 100
cargo run -p yuance-api -- files deletion-jobs --limit 100
```

确认后处理到期任务：

```bash
cargo run -p yuance-api -- files cleanup-deleted --limit 100
```

也可使用 Makefile：

```bash
make api-files-cleanup-deleted DRY_RUN=1 LIMIT=100
make api-files-cleanup-deleted LIMIT=100
```

正式环境 Compose 部署可执行：

```bash
cd /srv/yuance/easy-deploy/production/backend
docker compose --env-file .env -f compose.yaml exec -T api ./yuance-api files cleanup-deleted --dry-run --limit 100
docker compose --env-file .env -f compose.yaml exec -T api ./yuance-api files cleanup-deleted --limit 100
```

清理任务只使用附件登记时的存储配置和位置快照，不会回退到当前活动 Bucket。未完成任务会阻止删除其原存储配置；任务完成后释放该配置引用。配置凭证不可解密或 OSS 删除失败时，任务保留并按 1 分钟起步、指数退避至最多 6 小时的间隔重试；命令会汇报失败并以非零状态退出。处理器采用 5 分钟租约与 token fencing，过期处理器不能覆盖新处理器的结果。OSS 上对象已不存在时，按原位置确认后视为幂等成功。

清理返回失败后，运行 `files deletion-jobs --limit N` 查看未完成任务、重试时间和截断后的最近错误；错误按单行 JSON 字符串输出，便于安全复制，并对对象 key、Bucket、Endpoint 等位置值做脱敏。修复原配置或权限后，任务到达 `next_attempt_at` 再重试。诊断命令不输出签名或凭证。

`project` 附件仍只做逻辑归档。迁移不会为历史 `deleted` 附件自动创建 OSS 删除任务，避免未经审计地清理历史对象；也不会自动回收历史孤儿对象。`cleanup-pending` 只标记长期 pending 对象为 deleted，不会登记 OSS 删除任务。

## 建议策略

- 开发和测试环境可按需手动执行。
- 生产环境建议先执行 `cleanup-deleted --dry-run`，确认到期任务数量符合预期后再执行清理。
- 可将 `cleanup-deleted` 配置为定时维护命令；命令自身只领取到期任务，不会绕过 65 分钟、最后签名到期后 4 小时 5 分钟的安全窗口。
- `cleanup-pending` 与 `cleanup-deleted` 是不同维护流程，不要将 pending 上传清理当作资料附件 OSS 回收。
- 真实阿里云 OSS 接入后的手工验证见 `docs/runbooks/aliyun-oss-manual-validation.md`。
- 正式环境完整部署和维护命令见 `docs/runbooks/production-deployment.md`。
