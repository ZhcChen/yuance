---
title: "feat: 完善 Web 工作项 SSE 实时协作"
type: feat
date: 2026-08-10
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
execution_status: in_progress
origin:
  - docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# 完善 Web 工作项 SSE 实时协作

## 目标

在保留现有顶部状态 SSE 的基础上，让共享工作项详情页真正消费服务端已经提供的工作项事件流：其他会话发布评论、回复、流转或附件变化后，当前 Web 页面局部刷新讨论数据；编辑器输入状态按受控频率上报并展示其他用户正在输入。路由切换、断线重连和迟到事件不得污染当前工作项或清空本地草稿。

## 范围

- 扩展宿主事件契约，增加按工作项建立和关闭 SSE 的能力。
- Web 使用原生 `EventSource` 连接 `/api/v1/work-items/{item_key}/events`。
- 解析 `discussion-refresh` 与 `typing`，拒绝无效 typing 数据。
- `discussion-refresh` 只刷新主内容、评论和相关附件，不执行整页刷新。
- 为评论新增、编辑和回复编辑器补充 focus/input/blur typing 生命周期。
- 使用稳定、非敏感的页面会话 client id 调用 `/api/v1/work-items/{item_key}/typing`。
- 对 typing 上报做节流、空闲停止和卸载清理。
- 在讨论区显示其他用户正在输入，并限制用户数量与文本长度。
- Desktop adapter 先提供显式兼容边界，不开放 renderer 通用网络能力；本切片不伪造 Desktop 工作项实时支持。
- 补充单元测试、Browser E2E、迟到事件和快速路由切换测试。

## 非目标

- 不引入 WebSocket。
- 不把进程内 `tokio::broadcast` 迁移到 Redis Pub/Sub。
- 不在本切片实现 Desktop 独立工作项 SSE 网络链路。
- 不对评论列表做复杂增量 patch；服务端事件仍作为失效通知，客户端读取最终事实。
- 不在 SSE 断开时自动重放写操作。

## 关键决策

1. 顶部事件和工作项事件使用两个明确订阅方法，避免一个通用 EventSource 后门。
2. 工作项事件携带 `connectionId`、`sequence` 和 `itemKey`，共享 reducer 丢弃重复、乱序和旧工作项事件。
3. 讨论刷新使用已有的聚焦读取编排，保留正在编辑的正文和评论草稿；刷新期间不切换整页 loading。
4. typing 是临时展示事实，不进入持久业务状态；无效、过期或当前用户数据由服务端快照和前端边界共同过滤。
5. typing POST 失败不弹全局错误，不阻塞编辑；评论等正式写操作仍沿用现有错误策略。
6. Web 的浏览器自动重连后以首个 typing 快照恢复状态；断线期间不显示虚假的在线状态。

## 阶段与执行单元

### 阶段 1：事件适配与讨论局部刷新

#### S1.1 Web 工作项 EventSource

- 修改：`web/src/platform/browser/events.js`、对应测试。
- 完成标准：固定编码路径；映射 `discussion-refresh`、`typing`；关闭订阅会关闭 EventSource；非法 JSON 不进入共享层。

#### S1.2 共享事件状态与详情订阅

- 修改：`frontend/packages/app-core/`、`frontend/packages/app-shell/src/app.jsx`、Desktop events adapter。
- 完成标准：进入详情建立一个订阅；切换 item/离开详情关闭；重复、乱序、迟到事件被忽略。

#### S1.3 局部讨论刷新

- 修改：app-shell 现有 `refreshWorkItemDiscussion` 编排及测试。
- 完成标准：评论、主内容和附件读取最终事实；不清空本地编辑/回复/新增草稿；并发事件合并为至多一次后续刷新。

### 阶段 2：typing 上报与可见反馈

#### S2.1 typing API contract

- 修改：共享 API client、Web adapter、聚焦测试；Desktop contract 保持显式不支持。
- 完成标准：只允许合法 item key、client id 和 boolean active；沿用 CSRF；调用方可将失败降级为无提示。

#### S2.2 编辑器生命周期

- 修改：`RichTextEditor`、`WorkItemComments` 与 app-shell。
- 完成标准：focus/input 启动，持续输入按节流续期，空闲和 blur 停止，路由离开与卸载尽力发送停止；不会因每个按键产生请求风暴。

#### S2.3 typing 提示

- 修改：共享讨论 UI 与样式。
- 完成标准：显示一人、两人和多人摘要；空快照立即隐藏；文本不改变布局宽度或遮挡操作。

### 阶段 3：验证与沉淀

#### S3.1 自动化 Gate

- Browser events 单测：事件映射、非法 payload、close。
- app-core 单测：去重、乱序、item 隔离和刷新合并。
- UI 单测：typing 提示和编辑器回调。
- Browser E2E：双页面评论刷新、typing 展示、快速切换工作项、草稿保持、SSE 重连。
- 构建：共享 packages、Web、Desktop renderer。

#### S3.2 Review 与经验沉淀

- 在 `docs/reviews/` 记录实现边界和证据。
- 在 `docs/solutions/` 记录“失效事件 + 局部读取最终事实 + 草稿保护”的复用模式。
- 更新本计划状态与长期计划对应 U5/U6 证据，修正此前“工作项 SSE 已完整共享”的表述。

## 验证命令

```bash
npm --prefix frontend run check --workspace @yuance/frontend-app-core
npm --prefix frontend run check --workspace @yuance/frontend-api-client
npm --prefix frontend run check --workspace @yuance/frontend-ui
npm --prefix frontend run check --workspace @yuance/frontend-app-shell
npm --prefix web run check
npm --prefix web run test:e2e -- --grep "work item realtime"
npm --prefix desktop run check:renderer
git diff --check
```

## 风险

- EventSource 自动重连会重新发送初始 typing 快照，客户端必须把它视为覆盖而不是追加。
- 讨论事件可能在本地写操作成功刷新后再次到达，刷新编排必须合并而非制造闪烁。
- 评论附件存在多请求组合，局部刷新失败时必须保留当前可见数据并允许后续事件恢复。
- 当前服务端实时总线仅限单进程；正式环境现为单 API 容器，多实例扩容前必须另行规划跨实例事件总线。
