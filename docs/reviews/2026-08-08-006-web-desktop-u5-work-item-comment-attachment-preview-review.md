---
title: Web 与 Desktop U5 评论附件预览复核
type: review
status: completed
date: 2026-08-08
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U5 评论附件预览复核

## 结论

已发布评论的附件下载与预览已进入共享实现。Browser 与 Desktop 共用 `WorkItemComments`、`AttachmentList`、`AttachmentPreview`、同评论附件导航状态和迟到响应保护；宿主差异只保留在文件内容传输边界。

Browser 使用 Cookie 权限读取受控 API 内容路径。Desktop renderer 只提交 `{ itemKey, commentId, attachmentId }`，主进程通过固定 operation 获取 metadata、校验评论范围的预期内容路径、生成私有临时快照，并仅向 renderer 返回 opaque `app://yuance/.preview/*` capability。

## 契约与交互

- metadata 校验工作项、评论和附件三层归属，返回公开附件 DTO、预览分类、同评论可预览附件前后项、受控内容路径和下载路径。
- 只有 `uploaded` 且分类为 image、video 或 document 的附件进入导航；pending 和 unsupported 只展示降级状态，不允许读取内容。
- 内容接口支持 GET、HEAD 和单段 Range，并复用 `private, no-store`、`nosniff` 与 sandbox 响应边界。
- 评论附件列表使用共享预览按钮；前后项、关闭和下载继续复用唯一的 `AttachmentPreview` 状态机。
- 预览状态保存 `commentId`，因此导航和下载不会越过当前评论；路由离开后丢弃迟到 metadata 并释放迟到 capability。

## Desktop 边界

- operation registry 仅增加 `workitem.commentattachmentpreview`，输入严格限制为工作项 key、正整数评论 ID 和正整数附件 ID。
- IPC 与 preload 仅增加 `openWorkItemCommentAttachmentPreview`，不接受 URL、method、header 或文件路径。
- metadata 的 `content_url` 必须等于由三个领域标识推导的固定 API 路径，任何替换都会在加载字节前失败。
- 真实 Electron 集成测试通过 Device principal 上传评论附件、读取私有快照、比对内容哈希并释放 capability。
- 未使用 macOS Keychain 或 Electron `safeStorage`。

## 验证

```text
- Device OpenAPI、allowlist、metadata、HEAD/Range、归属与权限：通过
- Browser API client、共享 UI 与评论附件预览 E2E：通过
- Desktop registry、coordinator、IPC、preload、renderer 与真实 Electron 文件链路：通过
- parity manifest schema 与来源闭合：8 passed
- 共享前端、Desktop 和 Rust 检查：通过
```

## 剩余范围

- 新评论 composer 仍需切换到 draft/publish API，并支持上传后插入富文本。
- 取消草稿时仍需清理未引用附件；编辑评论仍需补齐附件删除和权限确认语义。
- `action.work-item.comment-attachment.create` 保持 `baseline`，不能因已发布评论附件可预览而提前标记完成。
- 工作项详情旧 partial 在评论草稿与删除闭环完成前继续保留。

U5 详情页整体仍为 `in_progress`。下一切片处理评论 draft/publish 与 composer 附件生命周期。
