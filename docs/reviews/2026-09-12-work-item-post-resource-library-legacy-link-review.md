---
title: 工作项历史正文关联资料库兼容修复复核
type: review
status: completed
date: 2026-09-12
---

# 工作项历史正文关联资料库兼容修复复核

## 关联计划

[2026-09-11-1701-feat-link-work-item-posts-to-resource-library-plan.md](../plans/2026-09-11-1701-feat-link-work-item-posts-to-resource-library-plan.md)

## 问题与根因

正式环境存在一批历史工作项：正文仍保存在 `work_items.description`，普通评论保存在 `work_item_comments`，但 `primary_post_comment_id` 为空。资料库链接状态、链接写入和关联列表原先都只识别评论型主帖，因此工作项已有评论时仍会被判定为没有可链接内容。

规范主帖追加普通评论不是根因：`primary_post_comment_id` 会保持不变，原有链接生命周期继续正常工作。

## 修复范围

- 无主帖指针且 `description` 非空时，允许将历史正文作为可链接内容。
- 显式主帖指针存在但对应评论缺失、草稿或已删除时，继续拒绝链接。
- 关联列表在没有评论型主帖时使用工作项当前正文生成实时摘要；不创建重复评论、不复制正文或附件。
- 历史正文摘要按 plain / rich 内容分别处理，避免把 HTML 标签展示到资料库列表。
- 空正文工作项仍不能链接；链接后历史工作项的 `primary_post_comment_id` 保持为空。

## 已执行验证

- `cargo fmt --manifest-path api/Cargo.toml -- --check`：通过。
- `git diff --check`：通过。
- `cargo test --manifest-path api/Cargo.toml --test project_management_flow 'api_v1_work_item_resource_library_link_' -- --nocapture`：5 项通过。
- `cargo test --manifest-path api/Cargo.toml --lib`：83 项通过。
- `cargo test --manifest-path api/Cargo.toml --test project_management_flow -- --test-threads=1`：89 项通过，6 项既有 fixture / If-Match 失败，与本次改动无关。

## Review 结论

无阻断性发现。修复保持现有项目权限、双写 scope、CSRF、项目归属、工作项状态和主帖可见性校验；只增加历史 `description` 的兼容读取和链接判定。

已知残留：历史正文分支沿用关联列表的实时读取路径，存在低频 N+1 查询；正式环境应继续观察关联列表耗时，后续可通过批量加载或一次性主帖回填移除兼容分支。

## 与原计划的偏差

原计划以 `primary_post_comment_id` 作为主发布内容权威指针。本次没有改写该模型，也没有回填历史数据，而是在读取和链接边界增加兼容回退，以便不复制历史正文且不影响新数据的规范主帖流程。该偏差仅针对历史数据形态，后续若完成主帖回填，可删除对应回退逻辑。

## 结论

- 结论：通过。
- 下一步：提交并推送 `main`；本轮不直接部署正式环境。
