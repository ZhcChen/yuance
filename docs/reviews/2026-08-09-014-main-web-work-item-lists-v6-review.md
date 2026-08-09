# main Web 工作项列表 V6 复核

## 结论

需求、任务和 Bug 共用列表已按 `main@6c0e56d` 恢复三指标、列表 panel、常用视图、组合筛选、批量操作、紧凑表格和分页。三类页面继续共用同一 route、读取合同和 mutation，不恢复旧版列表入口。

三个工作项列表 visual contract 均更新为 `matched`，V6 完成。

## 验证证据

- 保存视图创建/恢复/重命名/删除、三类型创建、跨页批量操作、只读权限和正式 Web route 回归通过。
- 四视口逐一覆盖需求、任务、Bug，检查画布无横向溢出、指标/筛选列数以及表格滚动被限制在 panel 内。
- `npm --prefix frontend run check --workspace @yuance/frontend-app-shell`
- `npm --prefix web run test:e2e -- e2e/app-shell.spec.mjs --grep 'task list|saved views|work item creation|batch selection|lists hide creation|work item lists preserve'`
