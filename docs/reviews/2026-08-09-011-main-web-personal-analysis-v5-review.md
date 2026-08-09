# main Web 个人分析 V5 复核

## 结论

个人项目分析已按 `main@6c0e56d` 恢复页面级 analysis header、两组四指标、负载与协作双栏、最近完成列表和说明区。页面继续复用共享读取、项目切换串行化和 SPA 导航逻辑。

`page.project.personal-analysis` visual contract 已更新为 `matched`。V5 继续处理周期详情和资料详情。

## 验证证据

- 既有 E2E 保持统计值、筛选链接、完成记录、空状态和快速项目切换语义。
- 新增 `390x844`、`768x1024`、`1280x800`、`1440x900` 几何断言，检查业务画布无横向溢出、两组指标列数和分析双栏断点。
- Browser 与 Desktop 仍由同一 `SharedApp` 和 `application.css` 渲染。

验证命令：

- `npm --prefix frontend run check --workspace @yuance/frontend-app-shell`
- `npm --prefix web run test:e2e -- e2e/app-shell.spec.mjs --grep 'project personal analysis'`
