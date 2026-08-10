---
title: Web 与 Desktop U5 工作项附件传输复核
type: review
status: completed
date: 2026-08-08
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U5 工作项附件传输复核

## 结论

工作项附件首次上传、失败重试和下载已形成共享 UI 与状态语义。Browser 和 Desktop 共用 `WorkItemAttachments` 与 `uploadWorkItemAttachment` use case；宿主只负责文件选择、受控传输和下载落地。

本切片不包含附件预览、评论草稿附件、已发布评论附件删除或内联富文本引用，这些动作继续保持 `baseline`。

## 上传与重试

- 首次上传遵循 register -> sign -> upload -> confirm -> refresh，重复点击由共享 mutation lock 阻止。
- pending/failed 附件向有写权限用户显示“继续上传”；只读用户保留附件浏览和下载，不显示上传入口。
- 重试复用既有 attachment ID，不再次创建数据库记录。
- Browser 在传输前校验文件名、MIME 和字节数与原附件一致；Desktop 主进程以 file vault metadata 和服务端签名 DTO 再次校验。
- 确认阶段失败时先刷新服务端事实；已确认则收敛为成功，否则保留待确认状态，不自动重放 mutation。

## 下载与宿主边界

- Browser 获取短时下载 contract 后使用受控 DOM 下载，不接触 Desktop capability。
- Desktop renderer 只提交工作项和附件 ID；主进程完成签名、完整性校验、原生保存、原子落盘，并仅返回公开结果和可选 reveal capability。
- Desktop IPC 只为工作项重试增加可选正整数 `attachmentId`，不开放 URL、header、路径或通用请求原语。
- Browser 使用 Cookie/CSRF，Desktop 使用 Device principal；API 继续执行项目权限和附件归属校验。
- 未使用 macOS Keychain 或 Electron `safeStorage`。

## Review 处理

- 修复工作项附件上传入口对只读用户可见的问题。
- 补齐 Browser 与 Desktop 的工作项附件重试，验证重试不会产生第二次登记请求。
- 复核取消选择、空文件、元数据漂移、确认不确定、导航过期和下载取消路径。

## 验证

```text
- 共享前端完整检查：通过
- 工作项附件重试 use case：1 passed
- 共享附件 UI 写权限与重试：1 passed
- Desktop coordinator 与 IPC 重试契约：2 passed
- Browser 工作项/评论附件传输聚焦 E2E：1 passed
- `git diff --check`：通过
```

## 剩余风险

- 没有服务端内容 checksum 时，Browser 重试只能在传输前比较文件名、MIME 和字节数；对象存储确认会校验最终对象元数据，但同尺寸不同内容无法由客户端提前识别。后续可将 checksum 纳入所有附件登记 DTO。
- 工作项附件预览及其前后项导航尚未共享，当前只能下载。
- 评论附件仍绑定已发布评论，尚未迁移为草稿 composer 的附件引用与取消清理模型。

U5 详情页整体仍为 `in_progress`。下一切片继续完成工作项附件预览，再迁移评论草稿附件、预览与删除语义。
