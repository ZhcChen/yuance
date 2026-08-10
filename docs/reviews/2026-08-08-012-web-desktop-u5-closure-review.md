---
title: Web 与 Desktop U5 工作项详情阶段收口复核
type: review
status: completed
date: 2026-08-08
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
unit: U5
---

# Web 与 Desktop U5 工作项详情阶段收口复核

## 结论

U5 已完成。工作项详情的元数据、父子关系、前后项、流转历史、状态生命周期、编辑与移交、canonical 富文本主帖、评论回复编辑、提及、工作项与评论附件的上传/下载/预览/删除均由 Browser 与 Desktop 的唯一共享 React 组件树和 mutation state machine 承载。

正式 `/web/work-items/{item_key}` 已通过 `YUANCE_WEB_APP_SHELL_V1` 切换到共享实现；关闭开关仍可回滚完整 Askama SSR 页。专用详情 partial route、重复读取 handler、旧 JS partial URL 和 manifest action 已退役。完整 SSR 模板仅作为 U8 稳定窗口前的回滚实现保留，不构成并行正式入口。

## 清单审计

- U5 只有 `page.work-item-detail.detail` 一个页面，状态为 `cutover`。
- U5 共 15 个动作，全部为 `shared`；没有 `baseline` 或 `in_progress` 条目。
- 旧 `/web/partials/work-items/{item_key}`、`work_item_detail_partial`、`workItemDetailPartialUrl`、`action.internal.work-item-detail.partial` 和“打开旧版详情”生产引用均为零。
- Browser 与 Desktop 共用 `frontend/packages/app-shell/`、`frontend/packages/ui/`、`frontend/packages/app-core/` 和 API client；Desktop 只增加逐动作 registry，不存在通用 URL、method、header、body 或 fetch primitive。
- 未使用 macOS Keychain 或 Electron `safeStorage`。

## 行为覆盖

- 详情：原子 DTO、权限、删除态、父子项、前后项和流转历史。
- 生命周期：关闭、重开、恢复、移交、并发 mutation、迟到响应与部分失败恢复。
- 富文本协作：canonical 主帖、HTML 消毒、代码块、回复、编辑、提及和评论锚点。
- 文件：工作项与评论附件登记、传输重试、原生保存 capability、预览导航、草稿生命周期、对象删除、正文引用清理与摘要同步。
- 正式入口：共享 route owner、未登录安全回跳、Cookie/CSRF、feature flag 回滚和 partial 404。

完整切片证据见 `docs/reviews/2026-08-07-026-web-desktop-u5-work-item-detail-view-review.md` 以及 `docs/reviews/2026-08-08-001-web-desktop-u5-work-item-lifecycle-review.md` 至 `docs/reviews/2026-08-08-011-web-desktop-u5-detail-partial-retirement-review.md`。

## 最终验证

- Browser 全量 E2E：54 passed，覆盖正式详情、权限/错误、生命周期、迟到响应、评论协作和附件完整流程。
- `npm --prefix web run check`：40 项测试通过。
- `npm --prefix frontend run check`：共享包、边界、manifest schema、正式 route/source inventory 全部通过。
- `npm --prefix desktop run check`：原生文件 guard、网络/IPC/renderer 边界和正式 renderer build 通过。
- U5 最后一个 Desktop 全量 Gate：426 项，423 通过，3 项 Windows-only 跳过；后续 cutover/partial 提交未修改 Desktop 代码。
- Rust 聚焦验证：正式共享入口、认证回跳、SSR 回滚、partial 404、主帖附件事务均通过。
- `cargo fmt --all -- --check`、`cargo check -p yuance-api`、`node --check api/static/app.js` 与 `git diff --check`：通过。

## 阶段边界

U5 Exit 已满足：正式 Web 详情与 Desktop 使用同一组件和 mutation state machine。U6 负责把消息、通知和实时恢复统一为同一事件 reducer；U8 负责稳定窗口结束后的完整 Askama 详情模板、剩余重复 selector/handler 和 feature flag 最终退役。
