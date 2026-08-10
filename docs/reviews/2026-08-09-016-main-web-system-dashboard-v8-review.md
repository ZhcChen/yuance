# main Web 系统管理入口 V8 复核

## 结论

系统管理入口已按 `main@6c0e56d` 恢复无额外标题壳的 `system-grid` 和 `system-card`。入口仍由服务端权限合同过滤，Browser 与 Desktop 共用同一组件树。

`page.system.dashboard` visual contract 已更新为 `matched`。

## 验证证据

- 7 个已授权系统入口及正式路由保持不变。
- `390x844` 单列、`768x1024` 双列、`1280x800` 与 `1440x900` 四列，业务画布无横向溢出。
- `npm --prefix frontend/packages/app-shell run check`
- `npm --prefix web run test:e2e -- --grep "system dashboard"`
