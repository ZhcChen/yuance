# 共享 Web 正式入口与回滚

## 适用范围

正式 `/web/*` 业务页面永久由共享 React 应用承载，Browser 与 Desktop 使用同一组件树、状态模型、样式源和 `/api/v1/**` contract。Rust 继续负责 bootstrap、登录、精确 `return_to`、Cookie/CSRF、页面权限及文件下载/预览边界。

旧 Askama 业务模板、Web form mutation、`api/static/app.js` 和 `api/static/app.css` 已退役，不能通过环境变量恢复。

## 发布验证

```bash
cargo test --manifest-path api/Cargo.toml --test routing_smoke retired_web_business_pages_share_one_app_entry -- --test-threads=1
cargo test --manifest-path api/Cargo.toml --test routing_smoke retired_system_web_mutation_routes_are_not_registered -- --test-threads=1
cargo test --manifest-path api/Cargo.toml --test auth_security_flow web_app_system_owner_keeps_rust_permission_gate -- --test-threads=1
cargo test --manifest-path api/Cargo.toml --test auth_security_flow web_app_work_item_detail_owner_preserves_deep_link_query_for_unauthenticated_request -- --test-threads=1
```

同时执行 Browser 与 Desktop E2E，确认筛选 query、深链接、登录回跳、权限拒绝、实时刷新和文件能力保持一致。

## 回滚

共享实现是唯一业务 UI owner。发生发行回归时，按正式部署手册回滚到上一个已验证的 API/Web 镜像；不得恢复旧模板、旧静态脚本或重新引入页面级宿主分叉。

认证、设备授权、桌面端下载和文档预览仍是登记过的边界页面。认证边界只加载 `/static/auth.css` 与本地 HTMX，不依赖旧业务脚本。
