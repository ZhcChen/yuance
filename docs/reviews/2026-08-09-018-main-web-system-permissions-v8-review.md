# main Web 系统权限目录 V8 复核

## 结论

系统权限目录已按 `main@6c0e56d` 恢复 page hero、搜索和按资源分组的只读权限树。读取仍来自固定权限目录 API，筛选仍由正式 route query 驱动。

`page.system.permissions` visual contract 已更新为 `matched`。

## 验证证据

- 权限名称、权限键、资源与类型筛选行为保持不变。
- 四视口权限层级均被限制在业务画布内，无页面横向溢出。
- `npm --prefix frontend/packages/app-shell run check`
- `npm --prefix web run test:e2e -- --grep "system permissions"`
