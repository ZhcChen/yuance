---
date: 2026-07-23
topic: work-item-discussion-realtime
status: completed
---

# 工作项讨论区实时同步与输入中提示实施计划

## Problem Frame

当前项目只有顶部角标和消息列表使用 SSE。工作项详情页中的讨论区仍依赖提交后整页刷新，无法在多人协作时实时看到新评论 / 回复，也无法显示“谁正在输入中”。

## Scope

- 为工作项详情页新增独立 SSE 流。
- 评论 / 回复 / 编辑评论后，详情页讨论区局部刷新，不打断当前主输入框。
- 在讨论标题右侧显示其他协作者的“正在输入中”状态。
- 不引入 WebSocket，不做协同编辑，不做整页实时 diff。

## Task List

- [x] **T1. 扩展实时基础设施**
  - 在 `api/src/platform/realtime.rs` 增加工作项级事件订阅与 typing presence 内存存储。
  - 支持讨论刷新事件和 typing 快照事件。

- [x] **T2. 增加工作项实时 API**
  - 在 `api/src/web/router.rs` 新增工作项详情 SSE 与 typing 上报路由。
  - 在 `api/src/web/api/mod.rs` 完成鉴权、SSE 输出和 typing 写入。

- [x] **T3. 评论写入链路发布实时事件**
  - 在 `api/src/domains/projects.rs` 的评论创建、草稿发布、评论编辑完成后发布讨论刷新事件。

- [x] **T4. 前端局部刷新与输入中提示**
  - 在 `api/templates/web/partials/work_item_detail.html` 增加讨论区 data hooks。
  - 在 `api/static/app.js` 新增工作项 SSE、局部替换讨论区、typing 上报、防止回复草稿丢失。
  - 在 `api/static/app.css` 增加 typing indicator 样式。

- [x] **T5. 验证**
  - 增加后端单测 / 路由测试。
  - 运行 `cargo test -p yuance-api`、`node --check api/static/app.js`、`git diff --check`。
