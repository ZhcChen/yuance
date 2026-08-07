---
title: Web 与 Desktop U4 工作项创建复核
type: review
status: completed
date: 2026-08-07
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U4 工作项创建复核

## 结论

需求、任务和 Bug 的创建已迁移到唯一共享 React Modal。Browser 与 Desktop 使用同一 `createWorkItem` API client；Desktop 只开放固定 `workitem.create` operation。创建成功后两端都进入共享详情页，失败时保留表单，提交期间锁定重复动作。

U4 尚未整体完成。跨页选择、批量操作和正式列表路由收口仍需后续纵向切片。

## 行为证据

- 共享表单覆盖类型、标题、富文本说明、优先级、处理人、周期、截止日期和任务父级需求。
- 原子列表 DTO 同时返回处理人、周期和父级需求候选；只读响应不渲染创建入口。
- 工作项与周期关联在同一个 domain 创建事务中写入，周期无效时不会留下半创建记录。
- Desktop operation 独立校验项目编号、类型、文本长度、优先级、处理人、周期、日期和父级编号，无法注入 URL、method、header 或任意 body。
- Device 业务 allowlist 显式登记创建、原子列表和保存视图端点，并由冻结测试锁定。

## 验证

```text
cargo fmt --manifest-path api/Cargo.toml -- --check
cargo test -p yuance-api --test project_management_flow api_v1_work_item_list_view_returns_atomic_shared_page_contract -- --exact
cargo test -p yuance-api --test project_management_flow api_v1_can_create_and_update_work_item_for_authenticated_member -- --exact
cargo test -p yuance-api --test device_session_contract_flow openapi_freezes_d2_device_business_allowlist -- --exact
cargo test -p yuance-api --test device_business_parity_flow device_principal_matches_business_read_write_and_revocation_contract -- --exact
npm --prefix frontend run check
npm --prefix web run check
npm --prefix web run test:e2e
npm --prefix desktop run check
node --test desktop/test/operation-registry.test.mjs desktop/test/renderer-api-transport.test.mjs
jq empty docs/openapi/yuance.openapi.json
git diff --check
```

## 后续边界

- 下一切片迁移跨页选择模型、批量状态/处理人/周期动作和部分失败反馈。
- 三个工作项列表页面保持 `in_progress`，直到批量动作和正式 Web cutover 完成。
