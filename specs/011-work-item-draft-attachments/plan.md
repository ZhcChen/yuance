# 方案：新建工作项草稿附件

关联规格：`specs/011-work-item-draft-attachments/spec.md`

## 现状要点

- 附件 = `file_objects`（对象存储 key、状态、加密信封）+ `file_attachments`（`target_type`/`target_id` 归属）。object key 为 `uploads/pending/<uuid>.<ext>`，与归属无关，改绑无需移动对象。
- 评论正文对附件的引用按 URL 路径 `/web/work-items/{key}/comments/{cid}/attachments/{aid}/download` 校验（`extract_comment_attachment_references`、`comment_attachment_url_like`），`data-yuance-attachment-id` 仅用于移除节点。
- `POST /api/v1/work-items` 不创建主帖；新建弹窗随后调用 `PATCH /primary-post`（`upsert_work_item_primary_post`）写入正文。
- 现行新建弹窗为挂附件先创建“checkpoint 工作项”，因此依赖标题。

## 设计

### 数据

- 迁移 `202611160001_add_draft_file_attachment_target.sql`：重建 `file_attachments`，`CHECK` 增加 `'draft'`，保留全部列（含 `created_by_display_name_snapshot`）、`UNIQUE` 与 `idx_file_attachments_target`。
- 草稿附件：`target_type = 'draft'`，`target_id = project_id`，归属者为 `created_by_user_id`。

### 后端接口（`/api/v1/projects/{project_key}/work-item-draft-attachments`）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `` | 登记草稿附件（CSRF、`SCOPE_COMMENT_WRITE`、项目访问 + 内容写权限、项目可写、对象存储激活）；顺带清理全站超过 72 小时的草稿 |
| GET | `/{id}/upload-url` | 上传签名，仅上传者 |
| POST | `/{id}/uploaded` | 确认上传，仅上传者 |
| GET | `/{id}/download-url` | 下载签名，仅上传者 |
| DELETE | `/{id}` | 删除草稿：软删除对象并排入删除任务，仅上传者 |

Web 路由：`GET /web/projects/{project_key}/work-item-draft-attachments/{id}/download`（会话 cookie，仅上传者），供编辑器内图片 / 视频预览。

### 绑定（`upsert_work_item_primary_post`）

1. 在原始正文中识别作为 `src`/`href` 属性值的草稿 URL `/web/projects/{key}/work-item-draft-attachments/{aid}/download`；文本中的同名路径不处理。
2. 事务内先确定主帖 comment id（新建时先插入空正文行）。
3. 将草稿 URL 改写为 `/web/work-items/{item_key}/comments/{cid}/attachments/{aid}/download`，再执行原有 `prepare_work_item_comment_body`（清洗与受控 URL 校验）。
4. 事务内校验并改绑：附件必须属于当前用户，且为本项目草稿或已绑定到本主帖（重试幂等），对象 `uploaded`；草稿 `UPDATE file_attachments SET target_type='comment', target_id=cid`；任一不满足整体回滚。
5. 继续执行原有引用校验、摘要、活动与提及通知。

创建工作项与写主帖仍是两次请求；前端在创建成功但写主帖失败时保留已创建工作项，重试只重写主帖，草稿附件在失败时保持草稿状态不受影响。

### 清理

- `file_object_has_protecting_references_in_tx` 将 `draft` 视为保护引用（防止其他删除路径误删在用草稿）。
- `files::delete_draft_attachment`：上传者删除，事务内排除自身后检查保护引用并 `enqueue_deleted_file_object_in_tx`。
- `files::cleanup_expired_draft_attachments(pool, older_than_hours, scope 可选, dry_run)`：对过期草稿逐个排队删除；CLI 新增 `files cleanup-drafts --older-than-hours 72 [--dry-run]`；登记新草稿时对全站自动执行（保留期 72 小时，单次最多 500 个）。

### 前端

- `api-client`：新增草稿附件 5 个方法。
- `app-core`：`uploadWorkItemDraftAttachment`。
- `app-shell` 新建弹窗：上传走草稿接口，不再等标题、不为上传创建工作项；提交时“创建工作项 → 写主帖（含草稿 URL）”，写主帖失败保留已建工作项供重试，「转到详情」先补写主帖；取消或提交后删除正文未引用的草稿。
- `rich-text`：无需改动；草稿 URL 直接作为图片 / 视频 `src` 与文件 `href`。

## 验证

- Rust 集成测试（`api/tests/project_management_flow.rs`）：草稿登记→签名→确认→绑定成功且 URL 改写、附件 id 不变；他人 / 他项目 / 未上传 / 已删除草稿绑定被拒且无副作用；他人访问草稿接口 403/404；删除草稿排队删除任务；过期清理。
- CLI 测试（`api/tests/cli_files_flow.rs`）：`cleanup-drafts` dry-run 与执行。
- 迁移：`cargo test` 迁移全量；正式库副本执行迁移并 `PRAGMA integrity_check`、行数一致。
- 前端：`npm run check`（frontend、web）。
- e2e：真实接口（测试存储，不 mock 上传）标题为空即上传完成，创建后详情页附件可见；原粘贴 / 拖拽用例更新后通过。
- 独立代码复核，结论写入 `docs/reviews/`。
