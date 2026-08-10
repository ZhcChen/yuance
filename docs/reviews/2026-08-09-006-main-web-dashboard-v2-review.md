---
title: main Web 页面骨架与工作台 V2 复核
type: review
status: completed
date: 2026-08-09
plan: docs/plans/2026-08-09-002-refactor-main-web-visual-parity-plan.md
baseline: main@6c0e56daa5460a9725ee00b8937124d390e9bd0b
---

# main Web 页面骨架与工作台 V2 复核

## 结论

V2 完成。所有业务 route 不再强制渲染旧 `shell-header` 和三块顶部摘要卡；页面切换继续保留稳定的全局导航和同文档路由。非首页暂以 compact `page-heading` 提供页面标题、焦点恢复和图标刷新命令，后续页面族单元将按各自 main hero/detail/compact 模型继续替换。

Dashboard 已恢复 main 的区域顺序和布局：四指标、项目推进 compact table、待我处理讨论、最近动态。1280px 及以下侧栏降为双列下置，960px 及以下指标和侧栏降为单列；四个固定视口均无横向溢出。

## 数据合同

新增 `/api/v1/dashboard` 只读聚合接口，复用既有 RBAC、API token scope、项目可见范围、个人待处理、通知和活动查询。接口不增加写能力，不改变 Browser CSRF、Desktop operation registry、IPC、CSP 或 credential 边界。

Browser 显式 API 门面和 Desktop 共享 client 均调用同一合同。Dashboard 链接继续通过 owner-aware builder 和 SPA navigation 进入项目、个人分析、工作项筛选及消息语义目标。

## 验证

- `cargo fmt --check`、`cargo check -p yuance-api`：通过。
- `npm --prefix frontend run check`：通过。
- `npm --prefix web run check`、`npm --prefix web run build`：通过。
- `npm --prefix desktop run check:renderer`：通过。
- `web/e2e/app-shell.spec.mjs`：72 项完整通过。
- Dashboard 结构断言：4 个 metric、compact table、讨论和动态区域存在，旧 `shell-header` 与顶部摘要为零。
- 响应式几何断言：390/768/1280/1440 的 workspace 与 metric 栅格列数符合 main 断点，无 document 横向溢出。
- 1280px Browser 截图已与固定 main 截图并排复核，区域边界、间距、表格密度和双栏顺序一致；动态数量与时间按 fixture 允许变化。

Web/Desktop 构建仍保留既有 500kB chunk warning。

## 后续

进入 V3，按 main 分别恢复 profile hero、消息 compact heading 和搜索 hero/panel；届时移除这些页面当前的过渡 compact heading 或重复标题。
