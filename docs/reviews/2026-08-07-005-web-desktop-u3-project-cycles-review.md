# Web/Desktop U3 项目周期复核

## 结论

项目周期列表、创建、编辑、关闭和独立周期详情已迁移到唯一共享 React 实现。Browser 与 Desktop 使用同一 route、API client、mutation lock、确认流程、时间进度、指标、状态看板、成员负载和应用内来源返回逻辑。

## 关键边界

- 新增 `/api/v1/projects/{project_key}/cycles` 和周期详情/关闭 JSON contract。
- session 与 Desktop device principal 使用相同项目成员关系和内容写权限；viewer 可读不可写。
- Desktop 仅登记 `project.cycles`、`project.cycledetail`、`project.cyclecreate`、`project.cycleupdate`、`project.cycleclose` 五个固定 operation。
- 周期详情 API 返回受控工作项快照，共享 UI 按状态派生看板，不复用旧模板 view model。
- 时间进度、成员负载和高优先级/逾期统计由同一受控快照派生；应用内上一条路由可用时优先返回来源，否则返回项目周期列表。
- 创建/更新校验名称、文本长度、负责人用户名和完整日期范围；关闭不做乐观更新。
- viewer 仅显示只读周期数据；关闭后的周期不再显示编辑和关闭入口。

## 验证

- `cargo test --manifest-path api/Cargo.toml --test device_business_parity_flow`
- `npm run check --prefix frontend/packages/app-core`
- `npm run check --prefix frontend/packages/api-client`
- `npm run check --prefix frontend/packages/app-shell`
- `npm run check --prefix web`
- `npm run check --prefix desktop`
- `npm run build --prefix web`
- `npm run test:e2e --prefix web -- --grep 'shared project cycle'`
- `node --test --test-name-pattern='real API and Electron complete the D2 business read' desktop/test/desktop-business-api-integration.test.mjs`

## 剩余范围

项目详情页仍为 `in_progress`。资料资源、资源版本/标签、项目附件、活动和个人分析完成后，才能整体退役旧项目详情模板。
