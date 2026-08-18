---
title: "fix: 统一富文本附件编辑态与详情态展示"
type: fix
status: completed
date: 2026-08-18
origin:
  - docs/reviews/2026-08-12-project-resource-file-preview-display-sync-review.md
  - git:73a69ec^:api/static/app.css
---

# fix: 统一富文本附件编辑态与详情态展示

## 目标

恢复旧版富文本附件的视觉结果：普通文件在上传完成后，无论处于编辑器还是工作项/评论/项目资料详情正文，都使用同一套文件卡片、类型标识、尺寸和交互基础样式；上传中的进度、重试和移除状态继续作为编辑态的额外状态层。

## 已确认差异

- 正式文件节点统一为 `a[data-yuance-attachment-kind="file"]`，但正式文件卡片 CSS 目前只挂在项目资料详情的 `.resource-rich-body.discussion-rich-body` 作用域。
- 编辑器正式附件节点位于 `.yc-rich-text-input`，工作项主帖和评论详情位于 `.yc-rich-text-content`，均不会命中资料详情专用规则。
- 上传中的 `.yc-rich-pending-upload-file` 有独立卡片和状态遮罩，上传完成后替换为无共享正式态样式的普通链接，造成视觉跳变。
- 图片和视频的基础尺寸规则已在共享 UI 层存在，详情态额外使用 `AttachmentImage` 处理加载/失败状态；本轮只统一其基础容器与文件卡片，不改变媒体加载能力。

## 范围

- 将正式文件附件卡片及类型配色迁移到 `frontend/packages/ui/src/styles.css`，覆盖编辑器和所有详情正文。
- 删除 `frontend/packages/app-shell/src/application.css` 中重复的项目资料专用文件卡片样式，保留资料正文排版和媒体布局规则。
- 增加共享 UI 样式/结构回归与项目详情 E2E 验证。

## 非目标

- 不改变附件登记、签名上传、对象存储、下载/预览权限和正文 HTML 契约。
- 不移除上传中状态层，不强行让上传中节点与已完成节点显示相同的进度状态。
- 不重构 `RichTextContent` 的异步媒体加载流程。

## 执行单元

### U1：共享正式附件样式

- 在 UI 样式层统一文件卡片基础、类型配色、暗色主题、宽度、间距和 hover/focus 状态。
- 让 `.yc-rich-text-input` 与 `.yc-rich-text-content` 同时命中同一组规则。
- 保留 pending upload 的遮罩与操作控件；上传中的状态节点继续使用独立状态层，上传完成后统一切换到共享正式卡片。

### U2：移除作用域分叉

- 删除 app-shell 资料详情中与共享正式文件卡片重复的规则。
- 检查工作项主帖、评论、项目资料三类正文容器都由共享 CSS 接管。

### U3：验证与复核

- 覆盖文件节点属性、类型 badge、编辑器/详情选择器和现有上传回归。
- 运行 frontend、web、Desktop renderer 检查及成员/附件相关 E2E。
- 将结论写入 `docs/reviews/2026-08-18-rich-text-attachment-display-parity-review.md`。

## 验收标准

1. TXT、PDF、DOCX 等普通文件的编辑器正式态与帖子详情态使用相同文件卡片结构和视觉变量。
2. 工作项主帖、评论、项目资料详情都显示类型 badge、文件名和统一卡片布局。
3. 上传中进度/失败/重试状态仍可用，上传完成后不再跳变为普通文本链接。
4. 图片/视频现有预览、加载和失败状态不回归。
