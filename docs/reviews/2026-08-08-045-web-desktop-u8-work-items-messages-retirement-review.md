---
title: Web 与 Desktop U8 工作项与消息旧实现退役复核
type: review
status: completed
date: 2026-08-08
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U8 工作项与消息旧实现退役复核

## 结论

消息、需求、任务、Bug 列表和工作项详情正式 GET 已永久进入共享 React 入口，不再受 `YUANCE_WEB_APP_SHELL_V1` 控制。对应 Askama 页面、HTMX partial、SSR renderer、Web form mutation handler 和 route 已删除；Browser 与 Desktop 继续通过同一组件树、状态模型和 `/api/v1/**` contract 完成业务操作，本切片通过。

## 退役范围

- 永久共享入口：`/web/messages`、`/web/requirements`、`/web/tasks`、`/web/bugs`、`/web/work-items/{item_key}`。
- 删除消息、工作项列表、详情、表格、分页、讨论、流转历史和 rich-text toolbar 模板。
- 删除消息已读/open 路由，以及工作项创建、批量更新、保存视图、状态、移交、编辑、恢复、评论和附件登记的 legacy Web mutation 路由与 handler。
- 删除 `/web/partials/work-items` 与 flow-history HTML route；共享详情原子 contract 已包含 flow history。
- 删除只服务旧 HTML/marker 的集成测试，保留共享 API、领域、权限和文件边界测试，并新增集中式 retired route 回归。
- parity manifest 页面和共享 API action 更新为 `retired`，inventory 与 interaction classification 已重新生成。

## 权限与文件边界

- 永久共享 GET 仍由 Rust 完成 bootstrap、登录、精确 `return_to` 和 CSRF cookie 处理；业务读取和 mutation 由共享 API 的 Cookie/CSRF 或 Desktop device auth 权限边界执行。
- 工作项及评论附件的下载、预览和 preview content GET 保留在 Rust，继续负责签名 URL、Range、MIME、sandbox 与审计，不属于重复业务 UI。
- 附件边界改为直接读取领域 `WorkItemDetail`，不再为文件能力加载评论或构建 SSR view model，减少额外查询和死代码。
- 未引入 macOS Keychain 或 Electron `safeStorage`。

## 验证

- `cargo fmt --all -- --check`
- `cargo check -p yuance-api`
- `cargo test -p yuance-api --test routing_smoke`：31 passed
- `cargo test -p yuance-api --test auth_security_flow -- --test-threads=1`：48 passed
- `cargo test -p yuance-api --test project_management_flow -- --test-threads=1`：86 passed
- `node --test frontend/test/experience-manifest.test.mjs frontend/test/extract-legacy-experience.test.mjs`：11 passed
- `npx playwright test e2e/app-shell.spec.mjs --grep 'app-owner task list|formal web work item|shared work item saved|shared work item creation|work item detail can edit|work item lifecycle|deleted work item restores|work item comments create|work item attachments can list|message center opens|app-owner message center'`：11 passed

## 残留项

- `api/static/app.js` 和 `api/static/app.css` 的工作项逻辑与剩余系统 layout 的通知、项目切换、表单、rich-text 和文件能力交织。本批不做局部大段删除；下一批系统模板退役后连同 `layouts/web.html` 做完整引用清零。
- `/web/current-project` 仍供系统 legacy layout 使用，待系统批次结束后删除。
- U8 还需退役系统管理旧 SSR/Scalar，实现边界页收口、迁移开关删除和最终全量 Gate。
