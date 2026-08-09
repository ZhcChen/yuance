# main Web 周期详情 V5 复核

## 结论

周期详情已按 `main@6c0e56d` 恢复 detail hero、四指标、基础信息/目标双栏、时间进度、状态看板和成员负载卡。既有周期编辑、关闭、工作项导航和只读权限逻辑保持不变。

`page.project.cycle-detail` visual contract 已更新为 `matched`。V5 尚余资料详情及锁定态。

## 验证证据

- `npm --prefix frontend run check --workspace @yuance/frontend-app-shell`
- `npm --prefix web run test:e2e -- e2e/app-shell.spec.mjs --grep 'project cycle|project cycles'`
- 四视口覆盖 `390x844`、`768x1024`、`1280x800`、`1440x900`，检查业务画布无横向溢出、指标/概览/看板列数。
