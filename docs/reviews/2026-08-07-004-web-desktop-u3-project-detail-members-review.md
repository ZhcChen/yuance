# Web/Desktop U3 项目详情与成员复核

## 结论

U3 的项目列表/创建、项目基础详情和成员管理已切到唯一共享 React 实现。Browser 与 Desktop 使用同一 route model、API client、页面状态和确认流程；Desktop 仅暴露固定 operation，未增加通用 fetch。

项目详情页仍登记为 `in_progress`，因为周期、资料库、活动和项目内创建工作项属于 U3 后续切片，尚未从旧版详情页退役。

## 已覆盖范围

- 项目列表、状态筛选、分页、创建和当前项目切换。
- `/web/projects/{project_key}` 与 `/web/app/projects/{project_key}` 的统一详情路由及 `?tab=members`。
- 项目摘要、基础信息、编辑和负责人转移输入。
- 成员列表、添加、角色调整、移除确认及 owner 保护。
- Desktop device principal 的项目成员关系、viewer 读取和管理写入权限矩阵。
- Desktop 固定 DTO parser、输入白名单、数组数据根和显式 `204` no-content 契约。

## 验证证据

- `cargo test --manifest-path api/Cargo.toml --test device_business_parity_flow`
- `npm run check --prefix frontend/packages/app-core`
- `npm run check --prefix frontend/packages/api-client`
- `npm run check --prefix frontend/packages/app-shell`
- `npm run check --prefix web`
- `npm run check --prefix desktop`
- `npm run build --prefix web`
- `npm run test:e2e --prefix web -- --grep 'shared project detail manages'`
- `node --test --test-name-pattern='real API and Electron complete the D2 business read' desktop/test/desktop-business-api-integration.test.mjs`

## 剩余边界

- 下一切片迁移项目周期和周期详情。
- 再迁移项目资料、资源版本/标签、附件和个人分析。
- U3 全部完成后再删除 `api/templates/web/projects*` 对应平行实现，并将 `page.project.detail` 更新为 `shared`。
