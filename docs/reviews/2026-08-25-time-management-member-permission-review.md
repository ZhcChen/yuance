# 时间管理普通成员权限修复 Review

## 结论

正式环境时间管理页对普通成员提示“无权限访问：缺少操作权限”的问题已修复并重新部署，线上版本
`20260825104135`（发布源 `1c9891f`）。

## 问题原因

- 默认 `member` 角色 seed 只授予 `project.view`、`work_item.view`、`work_item.manage`；
- 时间管理接口要求 `time.management.view` / `time.management.edit`，因此普通成员访问
  `/web/app/time-management` 时被 `403` 拦截。

## 修复内容

- `api/src/domains/rbac.rs`：`member` 默认角色新增 `time.management.view` 与
  `time.management.edit`；
- `api/src/web/api/mod.rs`：
  - 新增 `api_user_can_access_all_time_management`：具备 `time.management.view` 的用户可查看
    全部启用且非超级管理员成员及全部排期；
  - 新增 `ensure_api_time_management_project_access`：具备 `time.management.edit` 的用户可编辑
    任意项目排期，访问 Token 的项目范围仍然生效；
- `api/src/domains/projects.rs`：
  - 新增 `resolve_active_user_id`：全局编辑允许为非项目成员排期；
  - 创建/更新排期支持非项目成员目标；
  - 回退记录改为按启用非超管用户解析，保证回退非成员排期不失败；
- `docs/runbooks/api-v1-contract.md`：同步时间管理权限与成员目录语义。

## 验证记录

- `cargo test -p yuance-api --test project_management_flow time_management_api_supports_overview_and_project_allocation_crud -- --exact`：通过
- `cargo test -p yuance-api --test project_management_flow time_management_change_records_support_restore_flow -- --exact`：通过
- `cargo test -p yuance-api --test system_management_flow`：19 项通过
- `cargo test -p yuance-api --test bootstrap_flow`：11 项通过
- `cargo test -p yuance-api --lib`：69 项通过

## 线上验证

- 正式库角色权限查询：

  ```text
  member|time.management.edit
  member|time.management.view
  ```

- `/api/healthz`、`/api/readyz`：200
- `/api/v1/time-management/{overview,members,changes}`：未登录 401（路由存在且需登录）
- `/version.json`：`20260825104135`
- 迁移 `applied=31 total=31`，`core seed applied`，健康检查与文件审计通过。

## 残留项

- `project_management_flow` 中有 5 个既有用例仍失败（demo 数据已扩充为 12 个项目，但断言仍按
  3 个项目编写），与本次修复无关，建议后续单独修正测试期望。

## 结论

- 结论：通过
- 下一步：用户在正式环境刷新时间管理页，确认普通成员可查看全部人员排期并正常编辑、查看修改记录。
