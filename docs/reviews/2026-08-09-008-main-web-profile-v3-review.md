---
title: main Web 个人中心 V3 复核
type: review
status: completed
date: 2026-08-09
plan: docs/plans/2026-08-09-002-refactor-main-web-visual-parity-plan.md
baseline: main@6c0e56daa5460a9725ee00b8937124d390e9bd0b
---

# main Web 个人中心 V3 复核

## 结论

个人中心已按 main 恢复 profile hero、账号资料、三指标、Token 主区、我的项目侧栏和账户安全区。资料编辑、密码修改、Token 创建/编辑/删除、设备撤销及确认 modal 保持既有共享 mutation，不增加宿主分支。

`/api/v1/dashboard` 的只读指标增加 `assigned_total` 和 `high_priority`。前者统计全部指派工作项，后者仅统计未结束的 P0/P1 指派项，与 main 个人页语义一致；项目列表继续遵循当前用户可见范围和 API token scope。

## 响应式复核

- `390x844`：hero、账号资料、三指标和详情双栏均降为单列，业务画布无横向溢出。
- `768x1024`：三指标保持三列，Token 与项目维持主侧栏结构。
- `1280x800`、`1440x900`：hero 信息、操作区、三指标和 `300px` 项目侧栏保持基线区域顺序。
- 正常、Token/设备空状态以及资料、密码、Token 和确认 modal 已覆盖。

## 验证

- `cargo fmt --check`、`cargo check -p yuance-api`：通过。
- `npm --prefix frontend run check`：通过。
- `npm --prefix desktop run check:renderer`：通过，保留既有 500kB chunk warning。
- Profile 聚焦 E2E：3 项通过，覆盖资料、账户安全与四视口几何。
- `web/e2e/app-shell.spec.mjs`：74 项完整通过。

## V3 收口

个人、消息与搜索三页 visual contract 均为 `matched`。下一执行单元为 V4 项目列表与项目详情。
