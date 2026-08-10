---
title: Web 与 Desktop U5 主帖附件删除复核
date: 2026-08-08
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
unit: U5
status: accepted
---

# Web 与 Desktop U5 主帖附件删除复核

## 结论

工作项 canonical 主帖的已发布附件删除已进入唯一共享 React 编辑流程。共享 `RichTextEditor` 只发出语义化删除请求，不在确认前修改正文；用户确认后，服务端删除对象，并在同一 SQLite 事务中归档附件、精确移除主帖正文引用及同步 `work_items.description` 摘要。成功后 App Shell 同步编辑器、详情主帖和附件缓存；失败时保留正文、附件和确认目标供重试。

Browser 与 Desktop 共用 API client 方法。Browser 固定发送 `x-yuance-editor-context: work-item-primary-post`；Desktop renderer 只能把固定 DELETE 路径映射为 `workitem.primarypostattachmentdelete`，operation registry 固定 editor context，REST transport 才生成 header。renderer 无法传入任意 method、URL、header 或 request primitive。

## 权限与数据边界

- 已绑定 `primary_post_comment_id` 的工作项只接受精确 comment ID，不能通过相同摘要或“见首条图文说明”启发式冒充主帖。
- 只有尚未绑定 canonical ID 的历史工作项才使用旧摘要规则，并在正式详情读取时固化主帖 ID。
- 删除前验证附件引用移除后正文仍有效；对象删除失败时数据库保持原状。
- 正文引用清理、附件和文件对象归档、主帖摘要同步处于同一事务。
- Cookie/CSRF 与 Device principal 共用服务端权限、项目写状态和 `comment:write` scope 校验。

## 验证证据

- `npm --prefix frontend run check`：共享 API client、UI、App Shell 与体验清单验证通过。
- `npm --prefix web run check`：Browser adapter 与固定 header 契约通过。
- `npm --prefix web run test:e2e -- --grep "work item primary post confirms attachment deletion"`：取消、确认、正文与附件状态通过。
- `npm --prefix desktop run check` 与 `npm --prefix desktop test`：426 项，423 通过，3 项 Windows-only 跳过；固定 operation、header 映射和 request primitive 拒绝通过。
- `cargo test -p yuance-api --test project_management_flow work_item_detail_promotes_primary_post_with_inline_file_attachments`：历史主帖固化、精确附件引用清理、附件归档及 description 摘要同步通过。
- `cargo fmt --all -- --check`、`cargo check -p yuance-api` 与 `git diff --check`：通过。

## 范围判断

`action.work-item.update` 保持 `shared`，并登记主帖附件删除为该编辑动作的固定 API effect，不制造旧 Web 中不存在的独立动作。U5 仍未结束；下一切片切换正式 `/web/work-items/{item_key}` 到共享页面，验证 feature flag 回滚后再退役 legacy detail partial。
