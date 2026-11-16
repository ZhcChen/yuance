# 任务：新建工作项草稿附件

关联：`specs/011-work-item-draft-attachments/spec.md`、`specs/011-work-item-draft-attachments/plan.md`

## 阶段 1：数据与领域

- [ ] T001 迁移：重建 `file_attachments` 增加 `draft` 目标类型（`api/migrations/`）。FR-002
- [ ] T002 `files.rs`：`validate_target_type`、保护引用支持 `draft`；新增 `delete_draft_attachment`、`cleanup_expired_draft_attachments`。FR-006、FR-007
- [ ] T003 `projects.rs`：`upsert_work_item_primary_post` 识别草稿 URL、改写、事务内校验并改绑。FR-003、FR-004

## 阶段 2：接口

- [ ] T004 API 草稿附件 5 个接口与路由；Web 下载路由。FR-001、FR-008
- [ ] T005 CLI `files cleanup-drafts`。FR-007

## 阶段 3：前端

- [ ] T006 `api-client` / `app-core` 草稿附件方法与上传流程。FR-001
- [ ] T007 新建弹窗改用草稿附件，移除标题依赖与 checkpoint；移除占位时删除草稿。FR-005、FR-006

## 阶段 4：验证与交付

- [ ] T008 Rust 集成测试与 CLI 测试（绑定成功、越权、未上传、删除、过期清理）。SC-002
- [ ] T009 前端检查与 e2e（真实接口，标题为空上传并创建）。SC-001、SC-003
- [ ] T010 迁移在正式库副本上验证（只读拷贝到本地执行）。
- [ ] T011 独立代码复核，记录 `docs/reviews/`。
