---
title: Web 与 Desktop U7 系统发布管理操作复核
type: review
status: completed
date: 2026-08-08
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U7 系统发布管理操作复核

## 结论

Browser 与 Desktop 已共用同一套 React 发布管理状态机，覆盖保留策略、普通与内部版本草稿创建、草稿编辑、内部发行证据校验、发布和撤回。所有写操作执行后均重新读取 `GET /api/v1/system/releases-view`，不使用 mutation 响应推断最终页面状态。

## 行为与边界

- 共享 API client 固定五类写入 method、path 和 JSON body，并在每次写入前调用宿主 `prepareWrite`。
- 页面使用单飞锁阻止重复提交；mutation 失败时刷新服务端最终状态，mutation 成功但刷新失败时保留成功结论并单独提示刷新故障。
- `internal` 草稿只有完成发行证据校验后才显示发布入口；撤回操作必须填写原因并明确提示下载入口失效。
- Desktop renderer 只能映射五个固定 operation，不接受任意 URL、method、header 或额外字段。
- Desktop 主进程会校验输入范围，并从 mutation 资产响应中裁掉 `object_key` 和 `file_object_id`，内部对象标识不会进入 renderer。
- 本切片不包含发布资产创建、文件选择、上传确认、下载和删除；这些能力继续由下一独立切片迁移。

## Manifest

- `action.system.release.settings`、`action.system.release.create` 和 `action.system.release.update` 已提升为 `shared`。
- 校验、发布和撤回作为既有正式 Web 版本更新动作的受控 `apiEffects` 登记，未伪造不存在的 SSR route。
- 每个共享动作均绑定 Browser、共享 API client、Desktop operation/transport 和服务端状态机证据。

## 验证

- `cargo test -p yuance-api --test system_management_flow`：41 项通过，覆盖发布、内部校验、撤回、保留策略、权限与并发下载拒绝。
- `npm --prefix frontend run check:packages`：共享 API client、app shell、UI 与 package 边界全部通过。
- `npm --prefix web run check:js`：Browser 宿主类型检查通过。
- `npm --prefix desktop run check:renderer`：Desktop renderer 类型检查、lint 与生产构建通过。
- `node --test frontend/test/experience-manifest.test.mjs`：8 项 manifest schema、引用闭合与 route owner 校验通过。
- `node --test frontend/packages/api-client/test/system.test.mjs desktop/test/operation-registry.test.mjs desktop/test/renderer-api-transport.test.mjs`：37 项聚焦契约测试通过。
- `npm --prefix web run test:e2e -- --grep 'shared system release'`：2 项发布读取与管理状态机 Browser E2E 通过。

## 后续

下一切片迁移发布资产全生命周期，并确保 Browser 直传与 Desktop 主进程委托传输共用同一业务状态机，同时禁止签名 URL 或对象存储内部字段进入 Desktop renderer。资产切片通过后再切换正式 `/web/system/releases`。
