# main Web System API docs V9 复核

## 结论

Browser 正式 `/web/system/api-docs` 已按 `main@6c0e56d` 恢复为独立 Scalar 文档应用，不再套共享业务壳；请求仍先经过 Rust 登录与 `system.api_tokens.view` 权限门。文档直接读取 `/api/system/openapi.json`，并保留 Token 管理入口。

Desktop 与 `/web/app/system/api-docs` 继续使用共享 React 契约查看器，不加载远程 Scalar、iframe 或 Browser transport。两种宿主按能力边界分开，未复制业务页面组件树。

`page.system.api-docs` visual contract 已更新为 `matched`，V9 全部完成。

## 验证证据

- Rust 登录返回路径与权限拒绝 2 条测试通过。
- 独立文档边界及两条整体 SPA 路由归属测试通过。
- Browser E2E 通过，覆盖共享查看器与正式独立 HTML 双边界。
- `cargo test --manifest-path api/Cargo.toml --test auth_security_flow web_app_system_api_docs_owner_`
- `cargo test --manifest-path api/Cargo.toml --test routing_smoke system_api_docs_keep_an_independent_document_boundary`
- `cargo test --manifest-path api/Cargo.toml --test routing_smoke web_shell_owner_serves_migrated_routes_from_same_app_entry`
- `cargo test --manifest-path api/Cargo.toml --test routing_smoke retired_web_business_pages_share_one_app_entry`
- `npm --prefix web run test:e2e -- --grep "system API docs"`
