---
title: Web 与 Desktop U5 工作项附件预览复核
type: review
status: completed
date: 2026-08-08
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U5 工作项附件预览复核

## 结论

工作项附件预览已进入共享实现。Browser 与 Desktop 共用工作项附件列表、`AttachmentPreview`、导航状态和迟到响应保护；宿主差异仅保留在内容传输边界。

Browser 使用 Cookie 权限读取受控 API 内容路径。Desktop renderer 只提交 `{ itemKey, attachmentId }`，主进程通过固定 operation 获取 metadata、校验预期内容路径、生成临时快照并返回 opaque `app://yuance/.preview/*` capability。

## 契约与交互

- metadata 返回附件公开 DTO、预览分类、可预览附件前后项、受控内容路径和下载路径。
- 只有 `uploaded` 且分类为 image、video 或 document 的附件进入导航；pending 和 unsupported 降级展示，不允许读取内容。
- 内容接口支持 GET、HEAD 和单段 Range，并复用 `no-store`、`nosniff` 与 sandbox 响应边界。
- 图片和视频使用共享内嵌预览；文档和 unsupported 使用共享降级界面并保留下载动作。
- 前后项导航、关闭、下载和 route 离开使用同一状态机；迟到 metadata 不会在新路由重新打开 dialog。

## Desktop 边界

- operation registry 仅增加 `workitem.attachmentpreview`，输入严格限制为工作项 key 和正整数附件 ID。
- IPC 与 preload 仅增加 `openWorkItemAttachmentPreview`，不接受 URL、header、文件路径或任意 method。
- metadata 的 `content_url` 必须等于根据输入推导的固定 API 路径，替换路径会在加载字节前失败。
- capability 在切换附件、关闭、路由离开和应用卸载时释放；迟到结果会立即释放新 capability。
- 未使用 macOS Keychain 或 Electron `safeStorage`。

## 验证

```text
- Device OpenAPI 与 allowlist 契约：8 passed
- Device 工作项附件 metadata/Range/权限：1 passed
- 共享 API client 与 platform contract：通过
- Desktop 完整测试：419 passed，3 个 Windows-only 跳过
- Browser 完整 E2E：51 passed
- 共享前端完整检查：通过
```

## 剩余范围

- 评论附件仍需迁移预览、下载、删除和评论草稿 composer 绑定语义。
- 工作项详情旧 partial 在评论附件闭环完成前继续保留，不能提前标记 `retired`。

U5 详情页整体仍为 `in_progress`。下一切片处理评论附件和草稿生命周期，随后退役旧工作项详情 partial。
