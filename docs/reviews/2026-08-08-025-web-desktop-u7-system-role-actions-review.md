---
title: Web 与 Desktop U7 系统角色操作复核
type: review
status: completed
date: 2026-08-08
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U7 系统角色操作复核

## 结论

角色创建、启停和权限保存已进入唯一共享 React 交互。Browser 与 Desktop 使用同一表单、确认弹窗、提交锁、父子权限联动、错误反馈和 mutation 后最终视图刷新，不存在宿主级业务分叉。

## 契约与边界

- 共享 API client 固定使用角色创建、状态更新和权限原子替换三个语义接口；写入前继续执行 Browser CSRF 或 Desktop device auth 宿主准备。
- Desktop 只新增 `system.rolecreate`、`system.rolestatusupdate` 和 `system.rolepermissionsupdate`，并封闭校验输入字段、角色编码、状态、数据范围和最多 500 个权限键。
- 系统内置角色不展示启停操作且权限控件只读，服务端仍是最终授权与保护边界。
- action 权限被选中时自动补齐同资源 page 权限；取消 page 权限时同步清除其 action 权限。
- 权限键在共享状态和提交边界均按字典序稳定排序，保证 Browser/Desktop 请求序列可复现。
- mutation 不自动重试；写入成功但最终视图刷新失败时明确保留成功事实并单独反馈刷新错误。

## 验证

- `frontend/packages/api-client/test/system.test.mjs`：三个固定写接口、编码和请求体通过。
- `desktop/test/operation-registry.test.mjs`：三个语义 operation、封闭 DTO 和路径注入拒绝通过。
- `desktop/test/renderer-api-transport.test.mjs`：共享 API 到固定 Desktop operation 的映射通过。
- `desktop/test/renderer-composition.test.mjs`：Desktop 继续挂载唯一共享 app-shell 组件树。
- `web/e2e/app-shell.spec.mjs`：父子权限联动、稳定权限序列、禁用确认、创建表单和最终路由通过。
- `api/tests/system_management_flow.rs`、`api/tests/routing_smoke.rs`：角色权限、保护边界和既有路由契约回归通过。

## 后续

三个角色 action 已提升为 `shared`。正式 `/web/system/roles` 和 `/web/system/roles/{role_code}/permissions` 的共享入口、权限拒绝、安全登录回跳及 feature flag 回滚将在下一切片统一完成；`page.system.role-permissions` 在此之前保持 `baseline`。
