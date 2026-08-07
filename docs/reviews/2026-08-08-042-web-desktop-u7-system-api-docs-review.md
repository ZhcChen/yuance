# U7 系统 API Docs 共享实现复核

## 结论

系统 API Docs 已进入 Browser 与 Desktop 唯一共享 React 页面。现有远程 Scalar 页面不能满足 Desktop CSP 和双宿主一致性要求，因此共享实现改为读取仓库内置 system OpenAPI JSON，由本地 React 生成端点导航、操作详情、Components 和完整文档视图。本阶段状态为 `shared`，正式 `/web/system/api-docs` 尚未切换。

## 契约与安全边界

- `/api/v1/system/api-docs-view` 需要登录并校验实际存在的 `system.api_tokens.view`，普通成员返回 403。
- 返回值只包含仓库构建时内置的 `yuance-system.openapi.json`，不接受用户 URL、远程文档地址或可执行内容。
- Desktop 使用固定 `system.apidocs` operation，禁止查询参数，并将响应限制为唯一 `source` 字段和 128 KiB 文本上限。
- 共享解析器限制文档大小、路径结构、操作数量和 HTTP 方法；React 只按文本渲染描述与 JSON。
- 未使用 iframe、远程 BrowserWindow、远程脚本、生产 Cookie、共享 localStorage、macOS Keychain 或 Electron `safeStorage`，也未放宽 Desktop CSP/IPC allowlist。

## 行为证据

- Browser 与 Desktop 共用 owner-aware `/system/api-docs` route、页面标题、端点导航和操作详情。
- 每个操作显示方法、路径、摘要、标签和完整原始契约；页面同时提供 Components 与完整 OpenAPI JSON 折叠区。
- Token 管理入口保留当前宿主 owner，Desktop 不会跳到 Browser 页面。
- Browser E2E 证明页面不含 Scalar 远程脚本或 iframe，读取请求始终为 GET。

## 验证

- `cargo test -p yuance-api --test system_management_flow api_system_docs`
- `npm run check`（`frontend/`）
- `npm run check`（`web/`）
- `npm run check`（`desktop/`）
- `npx playwright test e2e/app-shell.spec.mjs --grep "shared system API docs"`（`web/`）

## 后续

下一纵向步骤是将正式 `/web/system/api-docs` 接入共享壳，补齐登录回跳、403、旧 Scalar 回滚和同 bundle 路由证据后，再将 manifest 提升为 `cutover`。
