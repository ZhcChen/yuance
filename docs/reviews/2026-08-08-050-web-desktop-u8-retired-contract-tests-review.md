# Web/Desktop U8 退役契约测试收口复核

## 结论

通过。Bootstrap 后的正式 `/web` 测试已验证共享 React 入口，不再把旧 Askama Dashboard DOM 当作产品契约；浏览器设备会话管理测试已从退役的 `/web/me` 页面和 Web 表单 mutation 迁移到正式 `/api/v1/me/device-sessions` JSON API。旧业务路由仍由独立退役测试证明未注册。

## 变更范围

- `api/tests/bootstrap_flow.rs`：使用最小 Web dist fixture 验证认证后的 `/web` 返回共享 React 入口，并明确排除旧 `topnav` 和服务端用户头像 DOM。
- `api/tests/device_access_auth_flow.rs`：通过 JSON API 验证浏览器会话列表、CSRF、跨用户隔离、撤销、重复撤销、可信代理审计 IP 和按 route family 聚合限流。
- `api/src/web/router.rs`：把设备会话撤销限流从已退役 Web mutation 路径迁移到正式 DELETE API；不同 family ID 共享同一限流键。
- `api/src/web/api/mod.rs`：撤销操作沿用中间件解析后的可信客户端 IP 写审计；已撤销 family 返回稳定 `revoked` 结果，保持重复提交幂等。

## 契约判断

- 未列入 Desktop device operation allowlist 的业务路径由路由表隐藏为 `404`，不再错误断言通用 `403`。
- Browser 使用 Cookie 与 CSRF header，Desktop 使用 device bearer token，但共同调用同一账户设备会话 API 和领域逻辑。
- `/web/me/device-sessions/{family_id}/revoke` 继续保持 `404`，不恢复兼容 handler。
- 限流、审计和撤销状态均以正式 API 为权威，不依赖 SSR 页面文本作为业务证据。

## 验证

- `cargo fmt --all -- --check`：通过。
- `cargo check -p yuance-api`：通过。
- `cargo test -p yuance-api --test bootstrap_flow`：11 passed。
- `cargo test -p yuance-api --test device_access_auth_flow`：10 passed。
- `cargo test -p yuance-api`：第二次完整运行全部通过；首次运行中既有 SSE 心跳时序用例在并行负载下失败，单独重跑与第二次全量运行均通过。
