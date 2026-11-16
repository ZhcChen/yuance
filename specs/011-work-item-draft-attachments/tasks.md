# 任务：新建工作项草稿附件

关联：`specs/011-work-item-draft-attachments/spec.md`、`specs/011-work-item-draft-attachments/plan.md`

## 阶段 1：数据与领域

- [x] T001 迁移：重建 `file_attachments` 增加 `draft` 目标类型（`api/migrations/202611160001_add_draft_file_attachment_target.sql`）。FR-002
- [x] T002 `files.rs`：`validate_target_type`、保护引用支持 `draft`；新增 `get_draft_attachment_for_owner`、`delete_draft_attachment`、`cleanup_expired_draft_attachments`。FR-006、FR-007
- [x] T003 `projects.rs`：`upsert_work_item_primary_post` 识别草稿 URL、改写、事务内校验并改绑（幂等）。FR-003、FR-004

## 阶段 2：接口

- [x] T004 API 草稿附件 5 个接口与路由；Web 下载路由；API 契约文档。FR-001、FR-008
- [x] T005 CLI `files cleanup-drafts`；文件维护 Runbook。FR-007

## 阶段 3：前端

- [x] T006 `api-client` / `app-core` / `web/src/lib/api.js` 草稿附件方法与上传流程。FR-001
- [x] T007 新建弹窗改用草稿附件，移除标题依赖；写主帖失败重试与「转到详情」补写；取消 / 提交时删除未引用草稿。FR-005、FR-006

## 阶段 4：验证与交付

- [x] T008 Rust 集成测试 `api/tests/work_item_draft_attachments_flow.rs`（8 项：绑定成功、越权 404 / 绑定拒绝、未上传拒绝、删除、过期清理、重试幂等、文本路径不改写、迁移结构），全量 `cargo test --no-fail-fast` 通过。SC-002
- [x] T009 `frontend`、`web` `npm run check` 通过；e2e（真实接口 + 内存对象存储）4 项通过：未填标题粘贴上传并创建、拖拽与按钮上传并创建、取消删除草稿、写主帖失败重试不重复创建。SC-001、SC-003
- [x] T010 迁移在正式库副本（`qfy-test2` 上 `.backup` 至临时目录，未拉回本地）验证：231 行哈希一致、自增高水位 231 保留、`integrity_check` ok、外键检查无输出、索引存在。
- [x] T011 独立代码复核，见 `docs/reviews/2026-11-16-work-item-draft-attachments.md`。
- [x] T012 正式环境部署（`c7ccb366`，2026-11-16）：迁移 38/38 已执行，部署前快照 `backups/20261116100601.qWKzQU`；迁移后 `file_attachments` 含 `draft` 约束、237 行、`quick_check` ok；`/api/readyz` 就绪；草稿接口路由已注册（未登录 POST 返回 415 而非 404）；线上前端包含草稿附件逻辑。
- [ ] T013 线上业务验收：在正式环境新建需求，未填标题上传附件并创建，详情页附件可见（需用户确认后执行或由用户自测，会产生真实数据）。
