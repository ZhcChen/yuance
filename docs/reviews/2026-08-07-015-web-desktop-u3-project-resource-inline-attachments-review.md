---
title: Web 与 Desktop U3 项目资料正文附件引用复核
type: review
status: completed
date: 2026-08-07
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U3 项目资料正文附件引用复核

## 结论

项目资料已使用唯一共享 `RichTextEditor` 和 `RichTextContent` 完成已上传附件的正文插入、受控渲染、预览及移除引用闭环。Browser 保留服务端认可的 canonical 下载 URL；Desktop 将正文媒体解析为主进程签发的短期 opaque preview capability，renderer 不获得 API URL、access grant、请求头或本地路径。

本切片覆盖已有资料的正文附件引用。新建资料时直接选择、上传并插入附件仍未完成，因此 U3 及 `action.project.resource.create` 保持进行中。

## 行为与安全证据

- 编辑器只列出当前资料中状态为 `uploaded` 的附件，并根据正文中的 `data-yuance-attachment-id` 显示“插入正文”或“移除引用”。
- 文件使用带 canonical `/web/projects/{projectKey}/resources/{resourceId}/attachments/{attachmentId}/download` URL 的链接节点；图片和视频使用同源 URL 的 `figure` 与媒体节点，不持久化 access grant。
- 编辑器和展示组件共享闭合的 DOMPurify tag/attribute allowlist，允许受控附件节点但继续移除脚本、事件属性和未登记结构。
- 保存编辑时先 PATCH 不再包含引用的正文，成功后才 DELETE 被移除的附件，避免持久化正文引用已删除对象；删除失败会保留明确的可重试错误。
- 正文附件点击统一打开共享 `AttachmentPreview`，不绕过预览契约直接访问宿主私有数据。
- Desktop 正文图片和视频通过 `openProjectResourceAttachmentPreview` 获得 `app://yuance/.preview/{capability}`；组件卸载、正文变化或异步结果过期时释放 capability，释放失败不会产生未处理异步错误。
- Desktop adapter 测试证明 resource preview 只返回公开 DTO 与 opaque capability/source，宿主私有路径被移除；非法外部 preview source 继续 fail closed。
- Browser E2E 证明上传、插入、PATCH、正文点击预览、列表预览、下载、移除引用、PATCH 后 DELETE 的完整顺序，最终附件列表为空。

## 验证

```text
npm --prefix frontend run check
npm --prefix web run check
npm --prefix web run test:e2e
npm --prefix desktop run check:renderer
npm --prefix desktop test
cargo test --manifest-path api/Cargo.toml --test device_business_parity_flow
git diff --check
```

结果：Frontend 与 Web 检查通过，Browser E2E 38/38，Desktop 416 项通过且仅跳过 3 个 Windows runner 专属测试，Device API 业务一致性测试通过。

## 后续边界

- 新建资料编辑器尚不能在资源 ID 产生前选择附件并形成可重试的创建、上传、正文回填事务。
- 拖放和粘贴文件、逐附件上传进度及失败重试仍需在创建阶段附件上传切片统一实现。
- 完成创建阶段附件上传、项目个人分析和 U3 cutover/retire gate 后，才能判定 U3 完成。
