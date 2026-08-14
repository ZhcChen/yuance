---
title: 项目新增成员批量选择语义复核
type: review
status: completed
date: 2026-08-14
plan: docs/plans/2026-08-14-fix-project-member-batch-parity-plan.md
---

# 项目新增成员批量选择语义复核

## 目标对齐

以提交 `73a69ec^` 的项目详情成员弹窗和 `project_member_add` 为对照，恢复已启用且尚未加入项目用户的候选筛选、按姓名/用户名/系统角色搜索、多选、统一角色批量加入和提交后成员刷新语义；不恢复旧模板实现。

## 已执行验证

- `cargo test -p yuance-api --test project_management_flow api_v1_project_member_candidates_and_batch_add_match_project_scope -- --exact`：通过。覆盖候选排除既有/停用用户、批量去重、无效成员拒绝且无部分写入、成员角色写入。
- `npm --prefix web run check`：通过。
- `npm --prefix frontend run check`：通过。
- `npm --prefix desktop run check:renderer`：通过。
- `npm --prefix web run test:e2e -- --grep "shared project detail manages project information and member lifecycle"`：通过。覆盖候选搜索、多选、批量请求体、成员刷新、角色调整和移除。
- `jq empty docs/openapi/yuance.openapi.json`、`git diff --check`、`git diff --cached --check`：通过。
- `make crg.review BASE=HEAD`：完成。图审查确认跨 API、共享前端、Web 和 Desktop 的调用范围；报告的相邻成员操作测试缺口均为既有单成员、角色和移除路径，本轮新增路径已有聚焦覆盖。

## 主要发现

### 必须修正的问题

- 无。

### 可接受的残留项

- `cargo fmt --all -- --check` 仅报告 `api/src/web/router.rs:1571` 的基线格式差异，该行不属于本轮成员路由改动，未混入无关格式化变更。

### 建议后续跟进

- 后续继续进行旧版体验对齐时，沿用候选范围、批量操作和提交后刷新作为成员类交互的验收基线。

## 与计划的一致性

- 服务端增加候选读取与批量写入，同时保留单成员接口及其既有用户名校验语义。
- SharedApp、Browser adapter 和 Desktop 受限 transport 使用同一 API 契约；OpenAPI、API client、Desktop 映射、Rust API 与 Web E2E 测试同步完成。
- 批量写入额外保证写入前全量校验和事务提交，避免用户状态变化时出现部分加入结果。

## 回归与风险

- 未发现明显回归。候选读取与批量写入复用原有 `project.manage`、项目范围和项目成员管理权限链，写入仍要求 CSRF。
- 候选集会在每次打开弹窗时重新读取；并发变更导致的无效候选由服务端校验拒绝，不产生部分写入。

## 结论

- 结论：通过。
- 下一步：进入沉淀并提交推送。
