---
title: Web 与 Desktop U3 项目个人分析复核
type: review
status: completed
date: 2026-08-07
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U3 项目个人分析复核

## 结论

项目个人分析已迁移到唯一共享 React 页面。Browser 正式路径 `/web/projects/{project_key}/my-analysis` 与 Desktop `/web/app/projects/{project_key}/my-analysis` 复用同一路由模型、服务端统计契约、页面结构和交互逻辑；宿主差异只体现在 owner-aware 内部路径。

正式 Browser 路径在 `YUANCE_WEB_APP_SHELL_V1` 开启时返回共享应用壳，关闭时仍保留旧 SSR 回退。旧模板及 handler 的删除留给 U8 最终退役门禁。

## 对齐证据

- 页面保留累计处理、近 30 日、已处理 Bug、当前待处理四项产出指标，以及日均、单日峰值、月均、单月峰值四项自然周期指标。
- 平均值固定显示两位小数；待处理为零时三类入口仍可点击；最近完成为空时显示原有空态文案。
- 待处理链接完整保留 `project_key`、`status=pending` 和 `assignee_username`，并在筛选、分页、重置和宿主切换过程中不丢参数。
- 最近完成记录按 API 顺序展示类型、编号、标题和完成时间，并跳转到当前宿主的共享工作项详情。
- 进入分析页通过受控 `updateCurrentProject` 动作对齐旧 SSR 的当前项目副作用；React StrictMode 重放复用同一 single-flight，不会重复提交。不同项目的连续选择串行执行，迟到请求不能把持久化当前项目覆盖回旧值。
- 项目详情与分析数据并行读取，并复用共享 request generation 门禁，离开页面后的迟到响应不能写回当前视图。

## Desktop 边界

- renderer 只请求固定 `project.personalanalysis` operation，不持有通用 `fetch` 或可注入 URL。
- operation registry 从 `projectKey` 构造固定路径，并对完整 DTO、非负数字、嵌套待处理统计及最多 8 条完成记录执行闭合解析。
- Desktop 路由将 `/projects/{key}/my-analysis` 映射到共享 app owner，待处理和完成记录继续使用 `/web/app/*` 内部导航。
- 未引入 macOS Keychain、Electron `safeStorage` 或新的 renderer IPC primitive。

## 验证

```text
cargo test --manifest-path api/Cargo.toml --test routing_smoke web_shell_owner_serves_root_messages_and_project_analysis_from_same_app_entry
cargo test --manifest-path api/Cargo.toml --test device_business_parity_flow
cargo test --manifest-path api/Cargo.toml --test project_management_flow web_project_personal_analysis_renders_current_user_metrics -- --test-threads=1
cargo test --manifest-path api/Cargo.toml --test project_management_flow personal_project_analysis_counts_only_real_terminal_transitions -- --test-threads=1
cargo test --manifest-path api/Cargo.toml --test project_management_flow web_project_detail_returns_404_for_missing_project -- --test-threads=1
npm --prefix frontend run check
npm --prefix web run check
npm --prefix web run test:e2e
npm --prefix desktop test
```

结果：Frontend 与 Web 检查通过，Browser E2E 41/41；Desktop 416 项通过，3 项 Windows-only 测试按平台跳过；聚焦 Rust 路由、Device API、统计口径和 SSR 回退测试通过。

## 后续边界

- U3 项目资料条目的最终 `shared` 状态及旧项目模板整体退役需要单独执行 U3 收口审计，不能仅由个人分析页面完成推断。
- U8 在 feature flag 稳定后删除 `projects/personal_analysis.html` 及旧 SSR 渲染分支，并执行跨页面正式 Web 回归。
