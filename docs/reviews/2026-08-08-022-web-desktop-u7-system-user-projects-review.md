---
title: Web 与 Desktop U7 系统用户项目关系复核
type: review
status: completed
date: 2026-08-08
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U7 系统用户项目关系复核

## 结论

用户项目批量分配、批量移除、单项移除和项目角色调整已进入唯一共享 React 页面。Browser 与 Desktop 使用同一管理弹窗、关系表格、约束提示、确认流程、提交锁和最终快照刷新。

## 契约与保护

- 四个 API 同时要求 `system.users.manage`、`project.manage` 和全项目数据范围；超级管理员目标拒绝额外项目关系。
- 批量分配按旧运行时语义逐项执行；后续项目失败时保留前序成功，UI 刷新最终快照并且不自动重试。
- 批量移除在任何写入前全量检查关系存在、负责人和活跃工作项约束；任一失败时全部关系保留。
- 单项移除必须二次确认；负责人或仍有活跃工作项的关系在共享 UI 禁用，服务端继续做最终校验。
- Desktop 仅开放四个固定 operation，项目 key 数组上限、项目 key 格式、角色枚举和返回 DTO 均 fail closed，不接受请求原语。
- 每次成功 mutation 返回目标用户项目关系快照；共享 UI 仍重新读取当前分页，避免客户端猜测跨项目副作用。

## 验证

- `api/tests/system_management_flow.rs`：分配、角色调整、批量阻塞不产生部分移除、单删和批删 API 流程通过；旧 SSR 关系测试继续覆盖回滚入口。
- `frontend/packages/api-client/test/system.test.mjs`：四个固定 method/path/body 和写前准备通过。
- `desktop/test/operation-registry.test.mjs`：四个非幂等 operation、数组/角色校验和固定路径通过。
- `desktop/test/renderer-api-transport.test.mjs`：共享 URL 仅映射语义 operation，完整最终快照 DTO 通过。
- `web/e2e/app-shell.spec.mjs`：同一共享弹窗完成批量分配、角色调整、约束禁用、单项移除和单元素批量移除，请求序列通过。

## 后续

下一切片将正式 `/web/system/users` 切换到共享 shell，并验证匿名安全回跳、权限拒绝和 feature flag SSR 回滚。
