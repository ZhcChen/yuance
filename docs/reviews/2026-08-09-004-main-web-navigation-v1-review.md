---
title: main Web 导航 V1 切片复核
type: review
status: completed
date: 2026-08-09
plan: docs/plans/2026-08-09-002-refactor-main-web-visual-parity-plan.md
baseline: main@6c0e56daa5460a9725ee00b8937124d390e9bd0b
---

# main Web 导航 V1 切片复核

## 结论

V1 的根壳和全局导航切片完成。共享应用保持同一个 React 根壳和 same-document route；顶栏不参与业务滚动，`.main` 是唯一业务滚动容器。导航恢复 main 的真实品牌、工作台/项目/工作项入口、RBAC 系统管理下拉、桌面端下载、可搜索项目选择器、全局搜索、消息通知面板和账户菜单。

移动端区域顺序按运行基线恢复为“顶部工具、当前项目、搜索、横向导航、品牌”，项目和搜索控件宽度固定为视口减 24px。响应式切换不使用宽度动画，避免视口变化时出现可测量的中间布局。

## 数据与安全

`/api/v1/topbar/status` 增加 `project_options` 和 `system_links`，继续作为 Browser/Desktop 的原子顶部状态 DTO。项目选项只包含当前主体可访问且在 token project scope 内的项目；系统入口按用户 RBAC 过滤。普通 OpenAPI token 还必须具备 `system:admin` scope，否则系统入口返回空数组；Desktop device access token 继续遵守用户 RBAC。

Desktop operation registry 对新增字段执行严格、深度冻结的 DTO 解析，限制项目数量、系统链接数量和 `/web/system` 路径，不接受额外字段或外部 URL。

Browser 的桌面端下载入口保持同源 `/web/downloads`；Desktop 使用既有正式 HTTPS 下载页，并继续由主进程安全外链策略校验后交给系统浏览器，未新增 IPC 或放宽通用导航。项目切换与菜单内导航会在动作触发时主动收起对应菜单。

## 验证

- `cargo test -p yuance-api --test project_management_flow api_v1_topbar_status_returns_current_project_counts_and_project_badges`：通过。
- `cargo test -p yuance-api --test system_management_flow api_system_dashboard_returns_only_fixed_authorized_links`：通过。
- `npm --prefix frontend run check`：通过。
- `npm --prefix web run check`、`npm --prefix web run build`：通过。
- `npm --prefix desktop run check:renderer`：通过，packaged renderer 可构建。
- Desktop topbar 严格 parser 聚焦测试：通过。
- Playwright root navigation 与四视口 global shell E2E：通过。
- 四视口几何断言：390/768 项目和搜索宽度不小于视口减 24px；1280/1440 顶栏高度为 58px；全部视口无 document 横向溢出。

Web/Desktop 构建仍有既有的 500kB chunk size 警告，本切片未扩大网络、IPC、CSP 或 credential 边界。

## 后续

V1 尚未整体完成。下一切片继续校准内容画布、按钮、字段、反馈、modal、表格、分页、badge、tab 和 card；完成后才能勾选 V1，并进入 V2 页面骨架与工作台。
