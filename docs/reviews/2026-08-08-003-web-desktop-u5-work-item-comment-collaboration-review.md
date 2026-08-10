---
title: Web 与 Desktop U5 工作项评论协作复核
type: review
status: completed
date: 2026-08-08
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U5 工作项评论协作复核

## 结论

工作项普通评论已迁移到 Browser 与 Desktop 共用的 `WorkItemComments`、`RichTextEditor`、API client 和 mutation state machine。新增评论、回复与作者编辑统一提交消毒后的 HTML；`@` 候选筛选、键盘选择和 canonical mention span 由唯一共享 editor 实现。

本切片只完成评论正文协作。工作项附件、评论草稿内联附件、预览和删除语义仍保持 `baseline`，由下一切片继续迁移。

## 交互与状态

- 新增、回复和编辑使用同一个共享富文本 editor，支持格式工具栏、代码块、Markdown 转换和提及成员。
- 输入 `@query` 后按用户名或显示名筛选候选；支持方向键切换、Enter 插入和 Escape 关闭。
- 提及写入 `data-yuance-mention-username` 与 `data-yuance-mention-display-name`，编辑态保留 `contenteditable=false`，展示态不保留该属性。
- 回复提交明确携带 `parent_comment_id`，服务端返回扁平时间线并保留 `parent_author` 展示语义。
- mutation epoch、定向刷新和 route identity 继续共用既有状态机；旧刷新不能覆盖已提交评论，离开详情路由后的响应不能回写 UI。
- 只读用户可浏览评论和附件，但看不到新增、回复、编辑或附件上传入口；编辑按钮只对当前评论作者显示。

## 权限与宿主边界

- 服务端继续执行 HTML 消毒、项目成员提及校验、评论作者编辑授权和回复目标归属校验。
- 回复对象与提及对象相同时，通知按目标去重，不产生重复消息。
- Comment DTO 新增 `author_username`，用于共享 UI 执行作者入口可见性判断；API 仍是最终授权边界。
- Browser 使用 Cookie/CSRF；Desktop 使用 Device principal 和固定 comment create/update operations。
- Desktop registry 固定方法、路径、输入字段和严格响应 DTO，没有通用 fetch、请求原语或 renderer 凭证。
- 未使用 macOS Keychain 或 Electron `safeStorage`。

## Review 处理

- 复核了 mention range、候选为空、焦点离开、展示态消毒、回复状态清理、过期 mutation、只读权限和严格 DTO 一致性。
- 修复只读评论作者仍显示编辑入口、只读用户仍显示评论附件上传入口的问题，并增加共享 UI 契约测试。
- 当前工具面没有独立 subagent 上下文，本切片采用同一上下文复核，不将其计为独立交叉验证。

## 验证

```text
静态与共享前端 Gate：
- `npm run check:frontend`：通过
- `cargo fmt --all -- --check`：通过
- `cargo check -p yuance-api`：通过
- OpenAPI、体验清单 JSON 解析：通过
- `git diff --check`：通过

评论与权限契约：
- 扁平回复时间线：1 passed
- 评论提及创建与非项目成员拒绝：2 passed
- 回复与提及通知去重：1 passed
- Device OpenAPI allowlist freeze：1 passed
- Device principal 业务读写与撤销契约：1 passed

双宿主 Gate：
- Browser E2E：50 passed
- Desktop：416 passed，3 个 Windows-only skipped
```

## 剩余风险

- Desktop Comment DTO 是严格字段集合；服务端增加 `author_username` 后，Desktop 与 API 错峰发布可能不兼容。正式发行前需通过版本 capability 或兼容窗口协调。
- mention range 当前以光标所在文本节点为边界，已覆盖普通输入、筛选和键盘插入；跨复杂内联节点重新编辑 `@query` 的体验仍需在后续富文本回归中持续验证。
- 普通评论附件仍采用评论创建后上传流程，尚未进入草稿 composer，也未完成内联引用、取消清理、预览降级和删除语义。
- 评论实时增量仍依赖 U6 统一事件 reducer；当前切片保证 mutation 与刷新不回滚，但完整 SSE 重复、乱序和重连恢复由 U6 收口。

U5 详情页整体仍为 `in_progress`。下一切片继续完成工作项与评论附件、预览、删除和剩余详情语义。
