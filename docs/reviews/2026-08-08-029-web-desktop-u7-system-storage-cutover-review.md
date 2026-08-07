---
title: Web 与 Desktop U7 系统存储正式切换复核
type: review
status: completed
date: 2026-08-08
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U7 系统存储正式切换复核

## 结论

正式 `/web/system/storage` GET 入口已通过 `YUANCE_WEB_APP_SHELL_V1` 切换到唯一共享 React 存储工作台。Browser 与 Desktop 使用同一 route model、脱敏原子视图、组件树和 mutation 状态机；旧 SSR GET 与 POST handler 仅作为短期 flag 回滚路径保留。

## 路由与安全

- 正式入口保留 `page`、`per_page` query，匿名访问登录回跳完整保留 path/query。
- Rust 层在返回共享 app entry 前校验 `system.storage.view`，普通成员直接返回 403。
- 配置读取只返回脱敏 AccessKey 提示，不返回 AccessKey ID、Secret 或存储密文。
- 管理入口由 `can_manage_storage` 控制，保存、探测、初始化和回滚仍由 API 权限门禁最终裁决。
- flag 关闭时 GET 继续渲染原 Askama 页面，原 POST 路由和 CSRF 语义保持不变。

## 验证

- `api/tests/storage_config_flow.rs`：flag-off SSR 回滚、脱敏原子读取和存储动作契约通过。
- `api/tests/auth_security_flow.rs`：正式入口安全登录回跳及普通成员 403 通过。
- `api/tests/routing_smoke.rs`：正式存储路由与其他已迁移入口返回同一 app entry。
- `web/e2e/app-shell.spec.mjs`：正式路径保留 query 并渲染共享工作台；保存、探测、初始化、回滚和写后刷新语义通过。
- `frontend`、`web`、Desktop renderer 静态检查与 Desktop 固定 operation 测试通过。

## 后续

`page.system.storage` 已提升为 `cutover`。旧存储模板和 GET 展示逻辑的删除统一留到 U8 稳定窗口后的 Retire Gate；U7 下一切片进入系统发布管理。
