---
title: Web 工作项 SSE 实时协作复核
type: review
status: completed
date: 2026-08-10
plan: docs/plans/2026-08-10-001-feat-work-item-sse-completion-plan.md
---

# Web 工作项 SSE 实时协作复核

## 结论

通过。Web 工作项详情已消费服务端独立 SSE：讨论事件只重新读取详情、评论和附件最终事实，不进入整页 loading，也不清空新增评论草稿；typing 快照可展示一人、两人和多人摘要，focus/input/blur、5 秒续期、10 秒空闲停止及路由卸载清理均已接入。

Desktop 明确保留不支持边界：`supportsWorkItemTyping: false`，工作项事件 adapter 为 noop，renderer 未增加通用 EventSource、fetch 或 operation registry 项。本复核不宣称 Desktop 已支持工作项实时协作。

## 关键证据

- `web/src/platform/browser/events.js` 固定连接工作项事件路径，并严格解析 `discussion-refresh` 和 `typing`。
- `frontend/packages/app-core/src/work-item-events.js` 隔离 item key、连接序号、重复/乱序事件和刷新合并；typing controller 限制请求频率并尽力停止。
- `frontend/packages/app-shell/src/app.jsx` 在写回局部刷新前核对当前 route/item key，直接使用未包装 `baseApi` 静默降级 typing 失败。
- `frontend/packages/ui/src/work-item-comments.jsx` 只把 typing 生命周期绑定到新增、编辑和回复评论编辑器，主帖和资料编辑器不受影响。
- Browser E2E 证明讨论刷新保留已挂载节点和本地草稿，SPA 切换后旧连接关闭且迟到 typing 事件不污染新工作项。

## 验证

- `npm --prefix frontend run check --workspace @yuance/frontend-app-core`：65 项通过。
- `npm --prefix frontend run check --workspace @yuance/frontend-api-client`：50 项通过。
- `npm --prefix frontend run check --workspace @yuance/frontend-ui`：44 项通过。
- `npm --prefix frontend run check --workspace @yuance/frontend-app-shell`：7 项通过。
- `npm --prefix web run check`：46 项通过。
- `npm --prefix web run test:e2e -- --grep "work item realtime"`：2 项通过。
- `npm --prefix desktop run check:renderer`：类型、lint 与 renderer build 通过；保留既有大 chunk warning。
- `git diff --check`：通过。

## 风险与边界

- 服务端广播和 typing presence 仍是单进程内存状态；API 多实例扩容前需迁移到共享事件总线。
- EventSource 断线由浏览器自动重连，客户端以服务端首个 typing 快照覆盖旧状态，不重放写操作。
- Desktop 独立工作项 SSE 不在本计划范围，后续实现必须经主进程固定事件能力，不得从 renderer 开放通用网络。

## 计划一致性

S1-S3 的 Web 范围、验证和沉淀均完成，没有引入 WebSocket、Redis Pub/Sub 或 Desktop renderer 网络后门。旧最终复核的过度结论已追加勘误。
