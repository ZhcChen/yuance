---
title: Web 与 Desktop U8 迁移开关与旧项目切换退役复核
type: review
status: completed
date: 2026-08-08
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U8 迁移开关与旧项目切换退役复核

## 结论

共享 React 已是正式 Web 唯一业务入口，`YUANCE_WEB_APP_SHELL_V1` 不再控制任何运行时分支，现已从生产配置、测试和 E2E 启动脚本中删除。旧 Askama layout 使用的 `POST /web/current-project`、form DTO 和 return-to 重写链路也已退役；Browser 与 Desktop 继续只通过共享 `GET/PATCH /api/v1/current-project` contract 切换项目，本切片通过。

## 变更与边界

- 删除 `Settings::web_app_shell_v1_enabled` 和所有测试环境覆写，不再保留无效 rollout 开关。
- 删除 `/web/current-project` route、`CurrentProjectForm`、handler 及其 legacy return-to helpers。
- 保留 `/api/v1/current-project`、共享 API client、Desktop operation registry 和两宿主项目切换状态机。
- manifest 删除所有 retired 条目的 `cutoverFlag`、`rollbackTest` 和已不存在的 legacy layout action。
- inventory 重新生成，正式 Web 路由来源不再包含 `/web/current-project`。
- 历史 plan/review 中当时的 rollout 描述作为过程证据保留，不改写历史结论。

## 验证

- `cargo fmt --all -- --check`
- `cargo check -p yuance-api`
- `cargo test -p yuance-api --test routing_smoke`：30 passed
- `cargo test -p yuance-api --test auth_security_flow -- --test-threads=1`：45 passed
- `cargo test -p yuance-api --test project_management_flow retired_project_web_mutation_routes_are_not_registered -- --test-threads=1`：1 passed
- `npm --prefix frontend run check`：通过，42 项根级测试通过
- 运行时残留扫描：生产源码、脚本、manifest、Web 与 Desktop 中不存在 `YUANCE_WEB_APP_SHELL_V1`、`web_app_shell_v1` 或旧 `/web/current-project` 正向引用。

## 后续

- 审核登录、初始化、设备授权、Desktop 下载和文档预览 6 个 Askama 边界页。
- 执行 U8 最终全量双宿主、视觉、异常、权限、文件和迁移 Gate。
- 形成逐项映射 R1-R23、F1-F7、AE1-AE7 的最终 review。
