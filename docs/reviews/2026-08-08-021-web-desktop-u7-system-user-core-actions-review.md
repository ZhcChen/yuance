---
title: Web 与 Desktop U7 系统用户核心操作复核
type: review
status: completed
date: 2026-08-08
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U7 系统用户核心操作复核

## 结论

用户创建、状态切换、全局角色和管理员密码重置已进入唯一共享 React 交互。Browser 与 Desktop 使用同一表格操作入口、表单、确认弹窗、提交锁和错误恢复；成功后均重新读取 `users-view` 原子快照，不在客户端猜测最终用户状态。

## 安全与交互边界

- 四个 API 均要求 `system.users.manage`；Browser 通过共享 `prepareWrite` 刷新 CSRF，Desktop 通过设备主体执行相同 Rust RBAC 和领域校验。
- Desktop 仅开放 `system.usercreate`、`system.userstatusupdate`、`system.userroleupdate`、`system.userpasswordreset` 四个固定 operation，拒绝未知字段、非法状态、外部路径和请求原语。
- 停用前明确提示 Browser/Desktop session、Token 和设备访问将失效；受保护超级管理员不显示状态和角色操作，服务端仍保留最终保护。
- 密码在创建和重置时均要求双输入一致；响应和刷新快照不回显密码。重置确认明确现有会话撤销且新密码不再展示。
- 同一时刻只允许一个用户 mutation；失败保留当前弹窗和错误，成功后关闭弹窗并刷新当前分页。写入成功但刷新失败时明确报告刷新问题，不把已完成的高风险操作误报为失败；取消创建或密码重置会立即清空敏感表单状态。

## 验证

- `frontend/packages/api-client/test/system.test.mjs`：四个固定 method/path/body 和每次写入前准备通过。
- `desktop/test/operation-registry.test.mjs`：四个非幂等 descriptor、字段上限、状态枚举和用户 DTO 通过。
- `desktop/test/renderer-api-transport.test.mjs`：共享 client 仅映射固定 Desktop operation，非法 JSON 在 IPC 前拒绝。
- `web/e2e/app-shell.spec.mjs`：创建、角色、停用风险确认和密码重置完整交互与请求体通过。
- `api/tests/system_management_flow.rs`：RBAC、CSRF、创建校验、保护超级管理员、状态会话失效、角色替换和密码重置会话撤销已有集成覆盖。
- Frontend、Web 和 Desktop renderer 全量检查通过。

## 后续

下一切片接入用户项目批量分配、批量/单项移除和项目角色调整；完成后再独立切换正式 `/web/system/users` 并验证匿名回跳、Rust 权限门禁和 SSR 回滚。
