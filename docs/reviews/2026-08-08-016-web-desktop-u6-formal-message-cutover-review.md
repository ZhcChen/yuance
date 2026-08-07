---
title: Web 与 Desktop U6 正式消息入口切换复核
type: review
status: completed
date: 2026-08-08
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U6 正式消息入口切换复核

## 结论

正式 `/web/messages` GET 入口已接入共享 React 应用门禁。`YUANCE_WEB_APP_SHELL_V1` 开启时，Browser 正式消息中心与 Desktop 使用同一组件树、分页与筛选 route model、通知事件 reducer、消息动作 coordinator 和焦点恢复逻辑；关闭时仍执行原 Askama handler。

## 路由与回滚边界

- handler 在旧 SSR 逻辑前复用 `shared_web_app_response`，没有消息页面专用开关或重复认证分支。
- `OriginalUri` 原样保留 `filter`、`page`、`per_page` 及兼容 query，未登录请求安全进入 `return_to`。
- 切换只替换 GET 页面 owner；共享页面通过 `/api/v1/notifications*` 完成读取和 mutation，Desktop 继续只使用固定 operation registry。
- 旧消息模板、POST read-all 和 GET open redirect handler 暂时保留，供关闭 feature flag 后回滚；稳定窗口结束后由 U8 统一退役。

## 验证

- `routing_smoke::web_shell_owner_serves_migrated_routes_from_same_app_entry`：正式消息路径与其他已迁移页面返回同一共享入口。
- `auth_security_flow::web_app_message_owner_redirects_unauthenticated_request_with_safe_return_to`：未登录消息筛选与分页 query 原样进入安全回跳。
- `project_management_flow::web_messages_page_paginates_notifications_with_shared_controls`：关闭开关时旧 SSR 消息页和 read-all 仍可回滚。
- `web/e2e/app-shell.spec.mjs`：正式 `/web/messages` 和 Desktop-owner `/web/app/messages` 均使用共享消息交互，并验证目标 fragment 焦点。
- `frontend/packages/app-core/test/notification-events.test.mjs` 与 `notification-actions.test.mjs`：覆盖事件恢复、动作锁、权限撤销、目标删除和跨项目顺序。

## 范围判断

`page.message-search.messages` 提升为 `cutover`，并登记统一 feature flag、SSR 回滚和双宿主证据。U6 下一步执行完整 closure audit；旧消息模板、handler 和 selector 的物理删除属于 U8 稳定窗口后的最终退役 Gate。
