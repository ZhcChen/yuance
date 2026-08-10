---
title: Web/Desktop 工作项正文内附件渲染复核
type: review
status: completed
date: 2026-08-10
---

# Web/Desktop 工作项正文内附件渲染复核

## 结论

通过。工作项主帖与评论正文内的图片/视频附件不再依赖 HTML 中写死的相对 `/web` 或 `/api` 地址，改为通过 `RichTextContent` 的 attachment resolver 统一解析：

- Desktop 使用宿主 `openWorkItemCommentAttachmentPreview` 返回的 `app://yuance/.preview/...` 来源，并负责 release。
- Web 使用 `GET /api/v1/work-items/{item_key}/comments/{comment_id}/attachments/{attachment_id}/preview/content`。
- 正文内文件链接点击改为复用已有预览能力，避免在 Desktop renderer 中打开不可达的相对路径。

当前本地验收副本中图片仍无法显示的直接原因是对象存储凭证解密失败（`crypto / 解密失败`），属于本地验收密钥与正式快照不一致的已知边界，不是本次渲染修复范围。

## 关键证据

- 工作项 `P260713713428-BUG-5` 评论 id=104 正文包含 `<img data-yuance-attachment-id="69" src="/web/work-items/.../download">`。
- 附件 69 记录存在且 `status=uploaded`，对象键为 `uploads/pending/...png`；正文引用本身没有数据缺失。
- 修复前 `<img>` 请求该 `/web/.../download` 返回 500；修复后实际请求切换为 `/api/v1/.../preview/content`，仍因本地无法解密正式 OSS 配置返回 500。
- Desktop renderer 使用独立 Vite/app 源，相对 `/web`、`/api` 地址不会经过 API 源，因此即使存储凭证可用，旧正文内附件也不能依赖 HTML 内相对地址。

## 验证

- `npm --prefix frontend run check`：229 项通过。
- `git diff --check`：通过。
- Browser 实测：评论图片 `src` 已由 `/web/.../download` 切换为 `/api/v1/.../preview/content`，resolver 链路生效。

## 风险与边界

- 本地验收若要展示正式快照中的 OSS 图片，需要能解密正式存储配置的密钥或使用受控测试对象存储；不要在本地复制或写入正式 AccessKey/Secret。
- 该修复只覆盖工作项主帖与评论正文；项目资料正文已有同样 resolver 链路，不受影响。
