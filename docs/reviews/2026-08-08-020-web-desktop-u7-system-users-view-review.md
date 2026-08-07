---
title: Web 与 Desktop U7 系统用户管理原子读取复核
type: review
status: completed
date: 2026-08-08
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U7 系统用户管理原子读取复核

## 结论

用户管理读取已进入唯一共享 React 实现。Browser 与 Desktop 使用同一 `system-users` route、API client、表格和分页组件；`GET /api/v1/system/users-view` 在一个服务端快照中返回用户、角色候选、项目候选、项目关系及操作能力，前端不再跨接口拼接管理事实。

本切片只完成读取能力，`page.system.users` 状态为 `shared`。用户创建、状态、全局角色、密码重置、项目分配及正式 `/web/system/users` cutover 仍按后续独立切片推进。

## 权限与宿主边界

- 原子读取先要求 `system.users.view`；`can_manage_users`、`can_manage_user_projects` 均由 Rust 根据当前主体 RBAC 和全项目数据范围计算。
- 项目负责人关系明确禁止改角色和移除；存在待处理、进行中或待确认工作项时禁止移除，并返回活跃数量与稳定原因。
- 暂停等不可写项目不会进入分配候选；超级管理员不伪造项目成员关系。
- Desktop 只增加固定 `system.usersview` operation，分页输入受控，顶层及所有嵌套 DTO 均闭合并冻结，没有通用 system fetch。
- Desktop `/system/users` 与 query 通过共享 route parser 往返，不开放外部 URL、编码路径或请求原语。

## 验证

- `api/tests/system_management_flow.rs::api_system_users_view_returns_atomic_pagination_permissions_and_project_constraints`：默认 10 条、自定义分页归一化、角色和候选项目、权限布尔值、负责人及活跃工作项阻塞通过。
- `frontend/packages/api-client/test/system.test.mjs` 与 `frontend/packages/app-core/test/routes.test.mjs`：固定读取路径和 Browser/Desktop owner 分页路由通过。
- `web/e2e/app-shell.spec.mjs`：Browser app owner 渲染原子用户行，并验证翻页和每页数量保留在 URL 与请求中。
- `desktop/test/operation-registry.test.mjs`、`renderer-api-transport.test.mjs` 与 `renderer-composition.test.mjs`：固定 operation、闭合 DTO、renderer 映射及 `/system/users` 路由通过。
- `npm --prefix frontend run check`、`npm --prefix web run check`、`npm --prefix desktop run check:renderer`、Rust 聚焦测试与新增 Playwright 用例通过。

## 后续

下一切片接入用户创建、状态切换、全局角色和管理员密码重置；之后接入用户项目分配、批量/单项移除和项目角色更新，最后独立切换正式 `/web/system/users` 并保留 SSR 回滚验证。
