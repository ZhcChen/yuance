---
title: Web 与 Desktop U3 项目资料创建附件复核
type: review
status: completed
date: 2026-08-07
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U3 项目资料创建附件复核

## 结论

共享新建资料弹窗已支持在保存前选择多个附件、决定是否插入正文，并通过唯一的 `createProjectResourceWithAttachments` use case 完成资料创建、附件上传和正文回填。Browser 与 Desktop 使用相同状态机、阶段反馈、失败恢复和 canonical 正文节点；差异仅限宿主文件选择与传输 capability。

本切片完成资料创建阶段的附件上传和正文插入。U3 后续仍包括项目个人分析及最终 cutover/retire gate，因此 U3 保持进行中。

## 行为与恢复证据

- 正常顺序固定为 `create resource -> register attachment -> sign -> PUT -> confirm -> PATCH inline body`；所有附件完成后才关闭弹窗和刷新资料列表。
- 每个待上传项显示文件名、大小、阶段和“插入正文”选择；窄屏时附件行换行，不依赖宿主专用布局。
- 资料创建成功即保存 checkpoint。后续失败重试直接复用该资料，不再次 POST；附件已经登记时复用 attachment ID，不再次 register。
- 文件 capability 被一次上传尝试消费后，界面要求重新选择名称、类型和大小一致的原文件；不允许把另一文件绑定到既有 attachment。
- 已上传附件在恢复时跳过上传；全部完成后仅执行一次正文 PATCH，生成服务端认可且已转义的 canonical 文件、图片或视频节点。
- checkpoint 存在时关闭弹窗会明确进入已创建资料详情，而不是静默丢弃或留下不可访问的资料；用户也可以留在弹窗立即重试。
- Browser E2E 强制第一次 PUT 失败，验证第二次操作序列为 `sign -> PUT -> confirm -> PATCH`，不存在重复 create/register。

## Desktop 边界

- Desktop 共享 use case 只将 `projectKey`、`resourceId` 和 opaque `fileCapability` 交给 `uploadProjectResourceAttachment`。
- register、sign、PUT 和 confirm 继续整体位于主进程业务附件协调器；renderer 不获得签名请求、header、API URL 或本地路径。
- Desktop renderer 构建和完整测试继续通过，未引入通用 `fetch`、文件系统或新增 IPC operation。

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

结果：Frontend 与 Web 检查通过，Browser E2E 39/39，Desktop 416 项通过且仅跳过 3 个 Windows runner 专属测试，Device API 业务一致性测试通过。

## 后续边界

- 拖放和粘贴文件不属于本切片，当前通过明确的宿主文件选择动作添加附件。
- 资料详情与 create/update 动作的 `shared` 提升应与个人分析完成后的 U3 cutover gate 一并处理。
