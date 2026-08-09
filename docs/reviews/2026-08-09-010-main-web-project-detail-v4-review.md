# main Web 项目详情 V4 复核

## 结论

项目详情已按 `main@6c0e56d` 恢复 detail hero、四指标、整卡 tabs、概览双栏和 tab panel 层级。Browser 与 Desktop 继续共用唯一 `SharedApp`、route 和 CSS，没有恢复旧 Askama 业务实现或整页导航。

`page.project.detail` visual contract 已由 `pending` 更新为 `matched`，V4 项目列表与项目详情完成。

## 实现证据

- `api/src/web/api/mod.rs` 在项目详情合同中返回需求、任务和 Bug 可见范围统计，三个统计并行读取且沿用当前用户的项目访问边界。
- `frontend/packages/app-shell/src/app.jsx` 恢复 `detail-hero -> 4 metrics -> tabs card -> overview` 顺序，详情 tab 使用基础信息和项目说明双栏。
- `frontend/packages/app-shell/src/application.css` 复用 main 的 `1280px` 概览单列断点和 `720px` 移动端指标/tabs 降级。
- `web/e2e/app-shell.spec.mjs` 对 `390x844`、`768x1024`、`1280x800`、`1440x900` 检查横向溢出、区域顺序、指标列数、tabs 方向和概览列数。

## 已登记差异

- 共享实现保留已有“项目文件”tab；该能力已完成 Browser/Desktop 文件 capability 和权限测试，不为追求旧模板 tab 数量而删除。
- main 的“动态”tab 当前没有完整共享读取合同。本轮不伪造活动数据，待后续存在真实合同后再作为独立能力补入。
- “个人分析”保留在 hero 操作区，其独立页面视觉对齐归入 V5。

## 验证

- `cargo fmt --check`
- `cargo check -p yuance-api`
- `npm --prefix frontend run check --workspace @yuance/frontend-app-shell`
- `npm --prefix web run test:e2e -- e2e/app-shell.spec.mjs --grep 'project detail|project files|project resources|project cycle'`

聚焦项目详情 E2E 共 10 项，功能与四视口几何验证全部通过。
