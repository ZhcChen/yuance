---
title: main Web 消息与搜索 V3 切片复核
type: review
status: completed
date: 2026-08-09
plan: docs/plans/2026-08-09-002-refactor-main-web-visual-parity-plan.md
baseline: main@6c0e56daa5460a9725ee00b8937124d390e9bd0b
---

# main Web 消息与搜索 V3 切片复核

## 结论

消息中心与全局搜索已按 main 模板恢复区域顺序、DOM 语义和共享样式。两页继续由唯一 `SharedApp` 渲染，通知目标解析、已读 mutation、owner-aware SPA 路由、搜索与分页行为保持不变。

消息中心恢复 `1040px` 居中内容、compact heading、筛选 tabs、四列消息行、未读状态、pager 和 empty state。全局搜索恢复 page hero、独立搜索 panel、结果 panel、结果条目、pager 和正常/空状态。

## 响应式复核

- `390x844`：消息行降为三列，查看动作下置；tabs 在自身容器内滚动；搜索表单和结果转为单列；业务画布无横向溢出。
- `768x1024`：消息行保持四列，搜索表单和结果保持桌面结构。
- `1280x800`、`1440x900`：消息内容不超过 `1040px`，搜索 hero、panel 和结果列表保持基线顺序。
- 修复共享 tabs 的 content-box 外扩、移动分页控件宽度和窄屏导航内容扩张页面画布的问题。

## 验证

- `npm --prefix frontend run check`：通过。
- `npm --prefix web run build`：通过，保留既有 500kB chunk warning。
- 消息、搜索、根导航聚焦 E2E：6 项通过。
- 新增四视口几何合同，检查消息最大宽度、消息行列数、搜索表单列数、结果方向和业务画布横向溢出。

## 后续

V3 尚余个人中心。需要先补足个人指标与我的项目只读聚合合同，再恢复 profile hero、指标、Token/项目/安全区及 modal、窄屏状态。
