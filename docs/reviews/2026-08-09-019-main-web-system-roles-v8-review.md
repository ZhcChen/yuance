# main Web 系统角色权限 V8 复核

## 结论

角色权限页已按 `main@6c0e56d` 恢复 page hero、左侧角色列表、右侧角色摘要和分组权限树。桌面保持双栏工作台，移动端和平板降为单列；角色创建、状态确认、父子授权联动和内置角色只读合同不变。

`page.system.roles` 与 `page.system.role-permissions` visual contract 已更新为 `matched`，V8 全部页面完成。

## 验证证据

- V8 聚合 Browser E2E 共 11 条通过，覆盖 dashboard、users、roles、permissions、四视口、用户项目关系与全部核心 mutation。
- Rust Web 权限门 19 条通过；系统管理 API、固定权限目录、父子授权和用户项目约束 19 条通过。
- Desktop renderer 构建及 11 条 feature parity/安全契约测试通过。
- `npm --prefix frontend/packages/app-shell run check`
- `npm --prefix web run check`
- `cargo test --manifest-path api/Cargo.toml --test auth_security_flow web_app_system_`
- `cargo test --manifest-path api/Cargo.toml --test system_management_flow`
- `npm --prefix desktop run check:renderer`
