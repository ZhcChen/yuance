---
title: Web 与 Desktop U3 正式 Web 路由切换复核
type: review
status: completed
date: 2026-08-07
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U3 正式 Web 路由切换复核

## 结论

U3 项目列表、项目详情、周期详情、资料详情和个人分析的正式 `/web/*` GET 路由均已接入 `YUANCE_WEB_APP_SHELL_V1` 切换门禁。开关启用时返回同一 React 应用构建物；关闭时继续执行原 Askama handler，可用于 U8 最终退役前的短期回滚。

## 路由与身份边界

- `/web/projects`、`/web/projects/{project_key}`、周期详情、资料详情和个人分析共享同一个切换函数，不存在页面级开关分叉。
- 门禁在有数据库的运行环境先检查 bootstrap 和 Browser session；未登录请求仍跳转 `/web/login`。
- 登录回跳使用 Axum `OriginalUri`，完整保留项目筛选、详情 tab 和资料 access query，不重新拼接或解释 opaque 参数。
- 切换只替换 GET 页面 owner；既有 Browser Cookie/CSRF mutation 与 Desktop device operation registry 保持不变。
- 开关关闭时原 handler、权限检查、SSR 模板和返回状态不变，旧实现删除仍留给 U8。

## 验证

```text
cargo fmt --manifest-path api/Cargo.toml -- --check
cargo test --manifest-path api/Cargo.toml --test routing_smoke web_shell_owner_serves_root_messages_and_project_routes_from_same_app_entry
cargo test --manifest-path api/Cargo.toml --test auth_security_flow web_app_project_owner_preserves_deep_link_query_for_unauthenticated_request -- --test-threads=1
git diff --check
```

结果：五类 U3 正式深链接均返回与 `/web` 相同且禁止缓存的共享应用入口；资料详情未登录请求保留完整 access query；格式与 diff 检查通过。

## 后续边界

- U3 manifest 收口需汇总项目详情、周期、文件、资料和个人分析全部复核证据后单独提交。
- U8 稳定窗口结束后删除已替代 Askama 模板、旧 handler 分支和 selector，并将对应条目从 `shared` 提升为 `retired`。
