---
title: Web 与 Desktop U5 详情 partial 退役复核
type: review
status: completed
date: 2026-08-08
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U5 详情 partial 退役复核

## 结论

正式工作项详情切换到共享 React 后，专用 `/web/partials/work-items/{item_key}` route、handler 和 manifest action 已删除。旧 SSR 完整页仍保留为 feature flag 回滚实现；其讨论实时刷新改为请求完整 `/web/work-items/{item_key}` 并提取相同 `data-work-item-discussion` 与 modal 区域，不再依赖重复详情读取 handler。

## 边界

- 完整 SSR 初始渲染继续复用 `WorkItemDetailPartialTemplate`，所以关闭开关时页面、权限和表单语义不变。
- 旧 JS 的刷新去重、编辑/回复阻塞、计数、增量高亮、hash 聚焦和登录失效处理保持不变，只替换读取 URL。
- partial 路径现在稳定返回 404，不保留不可达兼容别名。
- legacy source inventory 已由当前 router、模板和脚本重新生成；experience manifest 不再登记不存在的内部 action。
- Browser 共享实现和 Desktop operation registry 均不受影响。

## 验证

- `project_management_flow::work_item_detail_partial_is_retired`：旧 partial 路径返回 404。
- `project_management_flow::web_work_item_detail_page_renders_full_shell`：feature flag 默认关闭时完整 SSR 仍渲染讨论、编辑和流转能力。
- `routing_smoke::web_shell_owner_serves_migrated_routes_from_same_app_entry`：开关启用时正式详情仍由共享入口承载。
- `npm --prefix frontend run check`：manifest、source inventory 与正式 router 一致。
- `npm --prefix web run test:e2e -- --grep "formal web work item detail keeps web route ownership"`：正式 Browser 详情通过。
- `cargo fmt --all -- --check`、`cargo check -p yuance-api` 与 `git diff --check`：通过。

## 后续

U5 页面与动作已完成共享实现、正式切换和专用 partial 退役。下一提交执行 U5 closure audit，确认没有 U5 baseline/in_progress 条目、悬空调用或遗漏 Gate 后进入 U6。
