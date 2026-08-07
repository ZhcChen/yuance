---
title: Web 与 Desktop U5 正式工作项详情切换复核
type: review
status: completed
date: 2026-08-08
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U5 正式工作项详情切换复核

## 结论

正式 `/web/work-items/{item_key}` GET 入口已接入共享 React 应用门禁。`YUANCE_WEB_APP_SHELL_V1` 开启时，Browser 正式详情与 Desktop 使用同一个组件树、route model、详情 DTO、mutation state machine 和样式源；关闭时仍执行原 Askama handler。

## 路由与回滚边界

- handler 在旧 SSR 逻辑前统一调用 `shared_web_app_response`，没有新增页面级开关。
- `OriginalUri` 完整保留详情 path/query 和未登录 `return_to`，Browser hash 继续由共享 router 在客户端处理。
- 切换只替换 GET 页面 owner；Cookie/CSRF mutation 和 Desktop 固定 operation registry 不变。
- “打开旧版详情”链接已移除，避免开关启用后指回同一共享入口；旧 SSR 仅通过关闭 feature flag 回滚。
- 旧详情模板、partial、JS handler 和 CSS selector 暂时保留，待下一切片退役 legacy detail partial。

## 验证

- `routing_smoke::web_shell_owner_serves_migrated_routes_from_same_app_entry`：正式详情与其他已迁移路由返回同一共享入口。
- `auth_security_flow::web_app_work_item_detail_owner_preserves_deep_link_query_for_unauthenticated_request`：未登录详情 query 原样进入安全回跳。
- `project_management_flow::web_work_item_detail_page_renders_full_shell`：关闭开关时旧 SSR 仍可回滚。
- `web/e2e/app-shell.spec.mjs`：正式 `/web/work-items/YCE-TASK-2` 保持正式 owner 并渲染共享详情，不显示旧版入口。
- `npm --prefix frontend run check`、`cargo fmt --all -- --check`、`cargo check -p yuance-api` 与 `git diff --check`：通过。

## 范围判断

`page.work-item-detail.detail` 提升为 `cutover`，并登记 feature flag、回滚测试与双宿主证据。U5 尚未闭环：legacy `/web/partials/work-items/{item_key}` 及其调用方仍需退役，随后执行 U5 closure review。
