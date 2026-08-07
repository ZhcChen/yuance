---
title: Web 与 Desktop U4 正式工作项列表切换复核
type: review
status: completed
date: 2026-08-07
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U4 正式工作项列表切换复核

## 结论

需求、任务和 Bug 三类正式列表入口已接入共享 React 应用门禁。`YUANCE_WEB_APP_SHELL_V1` 开启时，`/web/requirements`、`/web/tasks`、`/web/bugs` 与 Desktop 使用同一组件树、route model、列表 DTO、保存视图状态和批量操作状态机；关闭时仍执行原 Askama handler。

## 路由与回滚边界

- 三个 GET handler 统一调用既有 `shared_web_app_response`，没有新增页面级开关。
- `OriginalUri` 原样保留筛选、排序、分页、保存视图和项目上下文 query；未登录回跳不重新解析或拼接参数。
- Browser 继续使用 Cookie/CSRF，Desktop 继续使用受限 device operation registry；切换没有扩大 Desktop 网络能力。
- 旧列表模板、partial、JS handler 和 CSS selector 保留到 U8 稳定窗口结束，当前可通过关闭开关回滚。
- 操作步骤和验证命令记录在 `docs/runbooks/shared-web-cutover.md`。

## 验证

```text
Rust 聚焦验证：
- routing_smoke 正式共享入口：1 passed
- auth_security_flow 未登录筛选回跳：1 passed
- project_management_flow SSR 回滚：1 passed

共享前端：
- npm run check:frontend：通过
- experience manifest：42 passed

Desktop：
- 416 passed
- 3 Windows-only skipped

Browser：
- 正式 /web/tasks 聚焦 E2E：1 passed
- 全量 Web E2E：46 passed

格式与差异：
- cargo fmt --check：通过
- git diff --check：通过
```

结果：正式工作项列表切换、认证回跳、旧 SSR 回滚和双宿主共享实现均通过验证；未发现新增宿主能力差异。
