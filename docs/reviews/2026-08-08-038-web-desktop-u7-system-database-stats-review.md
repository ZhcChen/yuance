# U7 数据库统计共享实现复核

## 结论

数据库统计已进入 Browser 与 Desktop 唯一共享 React 页面，保留旧正式 Web 的缓存优先、手动刷新、重复刷新单飞和失败保留缓存语义。本阶段状态为 `shared`，正式 `/web/system/database-stats` 尚未切换，旧模板与脚本继续作为回滚基线。

## 契约与安全边界

- `frontend/packages/app-core/src/routes.js` 同时识别 `/web/system/database-stats` 与 `/web/app/system/database-stats`。
- `frontend/packages/api-client/src/system.js` 只暴露固定 `GET /api/v1/system/database-stats`。
- `desktop/src/network/operation-registry.mjs` 使用固定 `system.databasestats` operation，并对快照、表和列执行递归字段白名单与数量上限校验。
- Desktop 缓存通过独立语义 IPC 保存到用户数据目录，按用户名隔离；未使用 macOS Keychain、Electron `safeStorage` 或 renderer `localStorage`。
- Browser 缓存使用固定版本前缀，读入后仍由共享层递归校验，损坏缓存按无缓存处理。

## 行为证据

- 初始进入页面只读取宿主缓存，不触发统计 API。
- 手动刷新成功后写入宿主缓存并展示 fresh 状态。
- 同步重复点击由共享单飞锁合并为一次请求。
- 刷新失败且已有缓存时保留表格并显示错误；无缓存时显示可恢复错误空状态。
- 表格与旧页面一致，只展示表名、备注、行数和字段数量；未引入旧运行时不存在的表选择器、列详情或分页。

## 验证

- `npm run check`（`frontend/`）
- `npm run check`（`web/`）
- `npm run check`（`desktop/`）
- `web/e2e/app-shell.spec.mjs` 数据库统计聚焦用例
- `api/tests/system_management_flow.rs` 数据库统计权限与响应聚焦用例

## 后续

下一纵向步骤是将正式 `/web/system/database-stats` 接入共享壳的可回滚 cutover，补齐登录回跳、403、SSR rollback 和 Rust 路由证据后，再将 manifest 提升为 `cutover`。
