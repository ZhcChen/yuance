---
title: Web 与 Desktop U4 工作项保存视图复核
type: review
status: completed
date: 2026-08-07
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U4 工作项保存视图复核

## 结论

工作项保存视图的创建、重命名、设为默认和删除已迁移到共享 React 交互与 JSON API。Browser 与 Desktop 使用同一 API client；Desktop 的四个 mutation 均由独立固定 operation 约束。无 query 进入列表会恢复默认视图，`clear_default=true` 可显式回到安全默认筛选。

U4 尚未整体完成。创建工作项、跨页选择和批量操作仍需后续纵向切片。

## 行为证据

- 创建视图保存服务端 resolved filters、当前每页数量和默认标记，名称、数量、周期归属及筛选值继续由既有 domain 校验。
- 同项目同工作项类型只有一个默认视图，设为默认使用既有事务原子替换。
- 默认视图作为无 query 请求的筛选基线；URL 非空字段可覆盖，重置使用 `clear_default=true` 跳过默认视图。
- React 在 mutation 期间锁定同组动作，失败保留表单和统一错误，删除前使用明确确认。
- Desktop 只接受固定 ID、名称和筛选字段；拒绝非法枚举、项目编号、周期、分页及请求原语，删除仅允许明确的 `204`。

## 验证

```text
cargo fmt --manifest-path api/Cargo.toml -- --check
cargo test --manifest-path api/Cargo.toml --test project_management_flow api_v1_work_item_saved_view_json_lifecycle_is_user_scoped -- --exact
npm --prefix frontend run check
npm --prefix web run check
npm --prefix web run test:e2e
npm --prefix desktop run check
node --test desktop/test/operation-registry.test.mjs desktop/test/renderer-api-transport.test.mjs
jq empty docs/openapi/yuance.openapi.json
git diff --check
```

## 后续边界

- 下一切片迁移创建需求、任务和 Bug 的共享表单及权限状态。
- 保存视图与列表页面保持 `in_progress`，直到创建、选择、批量动作和正式 Web cutover 全部完成。
