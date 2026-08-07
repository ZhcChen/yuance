# U7 系统审计日志共享实现复核

## 结论

系统审计日志已进入 Browser 与 Desktop 唯一共享 React 页面。两个宿主共用筛选、分页、动作标签、表格、空状态和错误状态，本阶段状态为 `shared`；正式 `/web/system/audit` 尚未切换，旧 Askama 页面继续作为回滚基线。

## 契约与安全边界

- `frontend/packages/app-core/src/routes.js` 同时识别 `/web/system/audit` 与 `/web/app/system/audit`，并保留操作人、动作、对象和分页查询。
- `frontend/packages/api-client/src/system.js` 只暴露固定 `GET /api/v1/system/audit`，忽略空白筛选并使用服务端既有字段名。
- `desktop/src/network/operation-registry.mjs` 使用固定 `system.audit` operation，对输入字段、文本长度、每页数量和递归响应字段执行白名单与上限校验。
- Desktop renderer 不能传入任意 URL 或 HTTP 方法，Browser 与 Desktop 均不持久化审计数据。
- 本切片未使用 macOS Keychain 或 Electron `safeStorage`。

## 行为证据

- 操作人、动作、对象类型、对象 ID 和每页数量由同一共享表单驱动，并写入 owner-aware URL。
- 分页保留全部筛选和每页数量，筛选提交会回到第一页，重置会清空查询参数。
- 动作同时展示与旧 Web 对齐的中文标签和原始 action，来源同时展示 IP 与 User-Agent。
- 表格覆盖时间、操作人、动作、对象、来源和元数据；无结果时展示共享空状态。
- Browser E2E 证明审计请求始终为 GET；Desktop 测试证明同一查询映射到唯一固定 operation。

## 验证

- `npm run check`（`frontend/`）
- `npm run check`（`web/`）
- `npm run check`（`desktop/`）
- `npx playwright test e2e/app-shell.spec.mjs --grep 'shared system audit'`（`web/`）
- `cargo test -p yuance-api --test audit_flow`

## 后续

下一纵向步骤是将正式 `/web/system/audit` 接入共享壳的可回滚 cutover，补齐登录回跳、403、SSR rollback 和 Rust 路由证据后，再将 manifest 提升为 `cutover`。
