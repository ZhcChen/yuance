---
title: main Web 项目列表 V4 切片复核
type: review
status: completed
date: 2026-08-09
plan: docs/plans/2026-08-09-002-refactor-main-web-visual-parity-plan.md
baseline: main@6c0e56daa5460a9725ee00b8937124d390e9bd0b
---

# main Web 项目列表 V4 切片复核

## 结论

项目列表已恢复 main 的 page hero、三指标、状态 tabs、项目卡片网格、pager 和 empty state。项目创建、分页、状态筛选、详情 SPA 导航与“设为当前项目”能力保持可用。

概览复用 `/api/v1/dashboard` 的完整可见项目集合；卡片继续使用项目分页合同，不增加读取端点或宿主分支。

## 响应式与验证

- `390/768/1280/1440` 的卡片列数分别为 `1/2/3/3`，指标在移动端降为单列。
- tabs 在窄屏由自身容器滚动，业务画布无横向溢出。
- 项目切换与创建聚焦 E2E 通过；四视口几何 E2E 通过。
- `npm --prefix frontend run check`、Web 与 Desktop renderer 构建通过；保留既有 500kB chunk warning。

## 后续

V4 尚余项目详情，包括 detail hero、四指标、整卡 tabs 及各 tab 内容结构。
