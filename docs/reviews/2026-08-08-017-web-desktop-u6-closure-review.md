---
title: Web 与 Desktop U6 消息通知收口复核
type: review
status: completed
date: 2026-08-08
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U6 消息通知收口复核

## 结论

U6 通过。正式 Browser 消息中心和 Desktop 消息中心使用唯一共享 React 组件树、通知事件 reducer、消息动作 coordinator、route model 与焦点恢复逻辑。U6 的一个页面和两个动作均已离开 `baseline` / `in_progress`；正式 GET 入口已切换，旧 SSR 仅作为统一 feature flag 的短期回滚实现。

## 需求与证据

- 实时事实：`notification-events.js` 对连接内重复与乱序事件去重，重连后强制读取全量最终事实；刷新期间的突发失效合并为一次后续刷新。相同事件序列由共享 reducer 产生相同快照。
- 消息列表：共享 route model 统一 `all`、`unread`、`pending`、`read`、分页和 owner-aware URL；Browser 与 Desktop 消费同一通知 DTO 和页面状态。
- 全部已读：共享 coordinator 锁定重复提交，不乐观清空；服务端提交成功后刷新最终 badge、筛选和列表事实。
- 打开目标：未读消息使用 read 响应中的 canonical target，已读消息重新请求 target；跨项目时先切换当前项目再导航。
- 失效目标：目标删除或权限撤销时停留消息页、显示统一错误并刷新最终已读状态，不使用列表中的过期目标静默跳转。
- 焦点恢复：合法 comment fragment 在详情加载完成后聚焦并滚动目标评论；非法或已删除 fragment 回退到页面标题。
- 正式入口：`YUANCE_WEB_APP_SHELL_V1` 开启时 `/web/messages` 返回共享应用；关闭时旧 Askama 消息页和 legacy 动作仍可回滚。

## 自动化验证

- `npm --prefix frontend run check`：共享 package 边界、类型、lint、事件/动作/route 与 manifest 测试通过。
- `npm --prefix web run check`：Browser adapter、router 和 API transport 测试通过。
- `npm --prefix web run test:e2e -- --grep "message center"`：正式 `/web/messages` 与 `/web/app/messages` 两条目标导航及焦点流程通过。
- `api/tests/project_management_flow.rs`：通知筛选分页、target/read/read-all、目标删除和权限变化行为通过。
- `api/tests/routing_smoke.rs` 与 `api/tests/auth_security_flow.rs`：正式入口共享 owner、query 回跳和关闭开关回滚通过。
- Desktop operation registry、renderer transport、事件 adapter 与 composition 测试覆盖固定操作和相同共享页面。

## 清单审计

- `page.message-search.messages`：`cutover`，具备统一开关和 SSR 回滚证据。
- `action.messages.read-all`：`shared`，实际 mutation 明确登记为 `POST /api/v1/notifications/read-all`。
- `action.messages.open-target`：`shared`，明确登记 target/read/current-project 的固定 API 顺序。
- U6 无 `baseline` 或 `in_progress` 条目，没有新增宿主差异 code，Desktop 不具备通用网络请求能力。

## U8 退役边界

稳定窗口结束后，U8 删除 `api/templates/web/messages.html`、旧消息 GET/POST/open handler、`api/static/app.js` 中专用消息表单 handler 与对应 selector，并重新生成 legacy source inventory 和 interaction marker classification。删除回滚实现前不得宣称物理退役，也不得提前移除统一 feature flag。
