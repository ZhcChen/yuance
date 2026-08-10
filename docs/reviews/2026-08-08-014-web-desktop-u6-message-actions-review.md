# U6 消息动作与目标解析复核

## 复核范围

- 计划：`docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md`
- 单元：U6 消息全部已读、目标解析、跨项目切换和动作竞态
- 共享实现：`frontend/packages/app-core/src/notification-actions.js`
- 共享页面：`frontend/packages/app-shell/src/app.jsx`

## 结论

通过。消息动作现在由共享 coordinator 编排，Browser 与 Desktop 不再各自决定提交锁、目标解析和失败恢复。正式 Web 消息页保留 `/web` owner，Desktop 保留 `/web/app` owner；两端使用同一 canonical target 和项目切换顺序。

## 关键证据

- `read-all` 重复提交复用同一 Promise，只在服务端提交成功后刷新最终事实，不执行乐观清零。
- 打开消息期间锁定其他消息按钮；未读消息通过 `markNotificationRead` 的响应获取 canonical target，已读消息重新读取 target，避免使用列表中的过期目标。
- 目标属于其他项目时，先调用共享 `updateCurrentProject`，成功后再导航；项目权限撤销会停留在消息页并显示统一错误。
- 目标缺失或不可用时保留消息页，刷新消息最终已读状态，不再静默跳转掩盖错误。
- 操作中、禁用和失败反馈由同一 SharedApp 组件树呈现。

## 验证

- `frontend/packages/app-core/test/notification-actions.test.mjs`：覆盖 read-all 锁、canonical target、跨项目顺序、已读目标重解析、目标缺失和打开锁。
- `npm --prefix frontend run check`：通过，包含各共享 workspace 和 42 项仓库级检查。
- `npm --prefix web run check`：通过，40 项测试通过。
- `npm --prefix web run test:e2e`：54 项通过；正式 Web 与 app-owner 消息目标分别保持正确 owner。
- `npm --prefix desktop run check`：通过，renderer production build 完成。
- `npm --prefix desktop test`：426 项，423 通过，3 项 Windows-only 跳过。
- `git diff --check`：通过。

## 后续范围

消息目标 URL 已保留 comment fragment，但当前共享 route model 尚未消费 hash 并主动聚焦评论。该项与正式消息入口切换、旧消息模板退役仍属于后续 U6 切片。
