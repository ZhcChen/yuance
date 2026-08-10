# U6 通知事件状态与恢复复核

## 复核范围

- 计划：`docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md`
- 单元：U6 的事件顺序、重复事实、重连恢复和并发刷新切片
- 共享实现：`frontend/packages/app-core/src/notification-events.js`
- 宿主 adapter：`web/src/platform/browser/events.js`、`desktop/src/renderer/platform/events.js`

## 结论

通过。Browser 与 Desktop 现在都将宿主实时信号转换为同一事件 contract，SharedApp 只消费共享 reducer/coordinator。连接内重复或乱序事实不会重复改变状态；重连的 `connected` 事实强制全量恢复；刷新进行中到达的多个失效事实合并为一次后续刷新，不再由两个宿主分别决定请求竞态。

## 关键证据

- `reduceNotificationEvent` 是唯一业务事件 reducer，拒绝未知字段、非法内部目标和倒退序号。
- `createNotificationEventCoordinator` 串行执行刷新，并以单个 pending 位合并刷新期间的突发失效事实。
- Browser adapter 只负责 EventSource 到共享事件的标准化；浏览器原生重连后服务端再次发送 `connected`，触发共享恢复。
- Desktop adapter 只负责受限 preload fact 到共享事件的标准化；credential epoch、旧连接失效和后台生命周期仍由 main/network coordinator 负责。
- 相同事件序列分别归约得到完全相同的状态快照，覆盖重复、乱序、版本和重连。

服务端 SSE 当前不提供可持久恢复的 event ID，因此本切片不声称断线期间逐事件回放。恢复语义是重连后全量读取服务端最终事实；这是 Browser 与 Desktop 当前协议都能可靠证明的边界。

## 验证

- `npm --prefix frontend run check`：通过，包含 42 项仓库级测试及各 workspace 检查。
- `npm --prefix web run check`：通过，40 项测试通过。
- `npm --prefix desktop run check`：通过，包含 native、IPC、network、renderer 类型检查、lint 和 renderer production build。
- `frontend/packages/app-core/test/notification-events.test.mjs`：覆盖相同快照、重复/乱序、重连恢复和刷新合并。
- `web/test/browser-events.test.mjs`、`desktop/test/renderer-events.test.mjs`：覆盖双宿主标准化 contract。
- `git diff --check`：通过。

## 后续范围

本复核不将 U6 标记为完成。后续仍需统一消息分页、筛选、全部已读竞态、目标删除/权限撤销/跨项目聚焦，随后切换正式 `/web/messages` 并退役旧消息实现。
