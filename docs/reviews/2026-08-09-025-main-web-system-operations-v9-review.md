# main Web 系统运维 V9 汇总复核

## 结论

V9 系统运维页面全部完成。storage、OpenAPI、releases、database stats、audit 和 System API docs 均已按 `main@6c0e56d` 恢复对应结构、排版与响应式边界，visual contract 全部为 `matched`。

Browser 与 Desktop 继续共用唯一 React `SharedApp`。仅正式 `/web/system/api-docs` 按基线恢复为经过 Rust 登录/权限门的独立 Scalar 文档边界；Desktop 使用无远程脚本的共享契约查看器。

## 聚合验证

- App Shell：6 条单元/合同测试通过。
- Web：43 条单元/合同测试通过。
- Browser 系统页面 E2E：23 条通过。
- Rust 系统页面登录与权限门：19 条通过。
- Rust 系统管理 API、状态迁移和权限合同：19 条通过。
- Desktop renderer 构建通过；composition、operation registry 与窗口安全：39 条通过。

## 命令

- `npm --prefix frontend/packages/app-shell run check`
- `npm --prefix web run check`
- `npm --prefix web run test:e2e -- --grep "system dashboard|system permissions|system users|system roles|system role|system storage|system OpenAPI|system release|database stats|system audit|system API docs"`
- `cargo test --manifest-path api/Cargo.toml --test auth_security_flow web_app_system_`
- `cargo test --manifest-path api/Cargo.toml --test system_management_flow`
- `npm --prefix desktop run check:renderer`
- `node --test desktop/test/renderer-composition.test.mjs desktop/test/window-security-policy.test.mjs desktop/test/operation-registry.test.mjs`
