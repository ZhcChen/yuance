# 时间管理功能 Review

## 结论

时间管理 MVP（P0-P6）已完成：独立排期表、跨项目 overview、项目详情“时间”tab、拖拽创建/移动/缩放、冲突高亮与本地 API 写操作均通过验证。线上 API 未执行任何写操作或迁移。

## 交付内容

- 数据库迁移：`api/migrations/202608240001_create_project_time_allocations.sql`
- 领域层：`api/src/domains/projects.rs` 新增时间排期 CRUD 与校验
- 权限：`api/src/domains/rbac.rs` 新增 `time.management.view` / `time.management.edit`
- API：`api/src/web/api/mod.rs`、`api/src/web/router.rs` 新增 overview 与项目内 CRUD 路由
- 前端：
  - `frontend/packages/api-client/src/time-management.js`
  - `frontend/packages/app-core/src/routes.js`（时间管理路由 + 项目 `time` tab）
  - `frontend/packages/ui/src/time-allocation-gantt.jsx`
  - `frontend/packages/app-shell/src/app.jsx`（全局入口 + 页面挂载）
  - `web/src/lib/api.js`（web 宿主显式导出时间管理方法）

## 验证记录

- `cargo check --manifest-path api/Cargo.toml -p yuance-api`：通过
- `cargo test --manifest-path api/Cargo.toml -p yuance-api --lib`：69 项通过
- `cargo test --manifest-path api/Cargo.toml -p yuance-api --test project_management_flow time_management_api_supports_overview_and_project_allocation_crud -- --exact`：通过
- `npm run check --prefix frontend/packages/api-client`：50 项通过
- `npm run check --prefix frontend/packages/app-core`：74 项通过
- `npm run check --prefix frontend/packages/ui`：67 项通过（含时间粒度切换渲染测试）
- `npm run check --prefix frontend/packages/app-shell`：10 项通过
- `npm run lint --prefix web`：通过

## 浏览器交互验证

使用本地临时 SQLite、本地 API（`127.0.0.1:33133`）与独立 Vite dev server（`127.0.0.1:4174`，代理本地 API）验证：

1. 登录后进入 `/web/app/time-management`，页面渲染成员行与时间轴；
2. 手动添加排期，POST 成功且列表刷新；
3. 拖拽色块，PATCH 请求发出且位置更新；
4. `/web/app/projects/OPS?tab=time` 显示项目“时间”tab 与项目内排期；
5. 控制台无 React key 冲突或运行时错误。

补充：时间条新增“日 / 周 / 月”粒度切换，默认月视图；切换后按粒度重排时间轴刻度，并保持拖拽创建/移动/缩放的日粒度换算。

## 已知边界

- 线上 API 未部署新接口/迁移，当前线上代理下页面会自动进入 mock 数据模式（404 回退）；
- 成员与项目下拉数据来自 overview + 项目成员接口，数据量大时后续可增加服务端聚合；
- 时间轴为纯前端日粒度渲染，未做任务级工时、节假日与时区计算（MVP 范围外）。

## 下一步

- 提交并推送当前改动；
- 由用户决定是否将本地 dev 代理切回线上、何时发布 API 与前端。
