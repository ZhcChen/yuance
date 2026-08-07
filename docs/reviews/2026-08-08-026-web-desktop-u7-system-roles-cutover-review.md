---
title: Web 与 Desktop U7 系统角色正式切换复核
type: review
status: completed
date: 2026-08-08
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U7 系统角色正式切换复核

## 结论

正式 `/web/system/roles` 与 `/web/system/roles/{role_code}/permissions` GET 入口已通过 `YUANCE_WEB_APP_SHELL_V1` 切换到唯一共享 React 角色工作台。Browser 与 Desktop 继续使用同一 route model、视图 DTO、组件树和 mutation 交互；旧 SSR GET 实现仅作为短期 flag 回滚路径保留。

## 路由与安全

- 角色列表保留 `role`、`page`、`per_page` query，匿名访问登录回跳完整保留 path/query。
- 独立权限深链映射为同一个 `system-roles` route，并从路径安全解码目标 `role_code` 后读取 `roles-view`。
- 两个正式 GET 入口在 Rust 层先校验 `system.roles.view`，普通成员直接返回 403，不依赖 React 隐藏菜单。
- 系统内置角色的状态和权限仍由服务端保护；共享页面只展示只读能力。
- flag 关闭时列表和权限深链均继续渲染原 Askama 页面，POST 回滚路由保持不变。

## 验证

- `frontend/packages/app-core/test/routes.test.mjs`：Browser/Desktop owner、query 与权限深链解析通过。
- `api/tests/auth_security_flow.rs`：列表和权限深链的安全登录回跳及普通成员 403 通过。
- `api/tests/system_management_flow.rs`：flag-off 下两个角色 GET 路由的 SSR 回滚通过。
- `api/tests/routing_smoke.rs`：两个正式路由与其他已迁移入口返回同一 app entry。
- `web/e2e/app-shell.spec.mjs`：正式权限深链加载同一角色工作台，并按路径角色发起原子读取。
- Frontend、Web、Desktop 静态检查与角色双宿主聚焦测试通过。

## 后续

`page.system.roles` 与 `page.system.role-permissions` 已提升为 `cutover`。旧角色模板、GET handler 和 selector 的删除统一留到 U8 稳定窗口后的 Retire Gate；U7 下一切片按计划进入系统存储管理。
