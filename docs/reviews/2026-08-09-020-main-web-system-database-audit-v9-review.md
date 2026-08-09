# main Web 数据库统计与审计 V9 复核

## 结论

数据库统计与审计页已按 `main@6c0e56d` 恢复单 panel、自带页面标题、紧凑工具栏、筛选栏、数据表与底部分页结构。审计每页数量恢复到底部分页区；正式 route query、数据库缓存刷新失败保留和审计只读证据语义不变。

`page.system.database-stats` 与 `page.system.audit` visual contract 已更新为 `matched`。V9 剩余 storage、OpenAPI、releases 和 System API docs。

## 验证证据

- Browser E2E 3 条通过，覆盖数据库缓存刷新、审计筛选分页和两页四视口几何。
- 四个固定视口下业务画布无横向溢出，panel 保持在 `.main` 边界内。
- `npm --prefix frontend/packages/app-shell run check`
- `npm --prefix web run test:e2e -- --grep "database stats|system audit"`
