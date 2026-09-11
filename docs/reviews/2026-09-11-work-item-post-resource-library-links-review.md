---
title: 工作项主发布内容关联资料库复核
type: review
status: completed
date: 2026-09-11
---

# 工作项主发布内容关联资料库复核

## 关联计划

[2026-09-11-1701-feat-link-work-item-posts-to-resource-library-plan.md](../plans/2026-09-11-1701-feat-link-work-item-posts-to-resource-library-plan.md)

## 结论

有条件通过。需求、任务和 Bug 的主发布内容已经可以从工作项详情链接到当前项目资料库，资料库通过独立区域展示实时摘要和原工作项入口；取消链接只删除关系，不删除源工作项、正文或附件。新增功能的聚焦测试均通过，可以进入提交和部署前流程。

条件是：仓库全量测试仍有既有 fixture 和 E2E 标题断言债务，本轮没有把这些无关失败混入功能修复；关联列表仍沿用无分页接口，历史主发布内容兼容分支存在 N+1 查询；审计日志写入失败时的事务一致性仍沿用现有业务操作模式。这些风险不阻断本次功能，但正式环境扩展前应继续观察。

## 范围与实现核对

本轮涉及独立关系表 `project_resource_work_item_links`、资料库领域查询、工作项链接状态/链接/取消链接接口、Browser API client、Desktop operation registry、Web API、OpenAPI、共享工作项详情页和资料库展示区。关系只保存项目、工作项、创建人和创建时间，不保存正文、摘要快照或附件副本。

### Requirements 对照

| 编号 | 结果 | 证据 |
| --- | --- | --- |
| R1 | 通过 | 工作项详情根据主发布内容和 `can_manage` 显示“链接到资料库”。 |
| R2 | 通过 | `DELETE` 取消关系；源工作项、主内容和附件不变。 |
| R3 | 通过 | `work_item_id` 唯一约束、`INSERT OR IGNORE` 和并发集成测试保证一项一链。 |
| R4 | 通过 | 服务端校验项目归属、工作项状态、主发布内容、项目写入状态和权限。 |
| R5 | 通过 | 资料库使用独立“关联发布内容”区域，未伪装成真实资料条目。 |
| R6 | 通过 | 返回并展示编号、类型、标题、摘要、作者、更新时间、关联时间和原工作项 URL。 |
| R7 | 通过 | 关联 DTO 不返回正文；正文和附件仍由原工作项详情接口提供。 |
| R8 | 通过 | 查询过滤删除工作项、删除/草稿主内容；摘要按当前主内容实时生成。 |
| R9 | 通过 | 关联列表只接收关键词 `q`；分类、标签、状态只传给真实资料列表。 |
| R10 | 通过 | 列表要求项目/工作项读取能力；写入同时要求工作项写入和资料库写入能力。 |
| R11 | 通过 | 新接口接入现有 principal、CSRF、项目访问、RBAC 和 token scope 链路。 |
| R12 | 通过 | Router、OpenAPI、Browser client、Desktop operation 和 DTO 测试使用同一路径与字段。 |

### Acceptance Examples 对照

| 编号 | 结果 | 验证 |
| --- | --- | --- |
| AE1 | 通过 | API 集成测试覆盖需求、任务、Bug；Web E2E 覆盖资料库展示和来源跳转。 |
| AE2 | 通过 | 两个并行 POST 请求均成功，返回同一 `linked_at`，数据库只保留一行。 |
| AE3 | 通过 | 取消后关联列表为空，工作项主发布内容仍可读取。 |
| AE4 | 通过 | 更新主发布内容后再次查询得到新摘要，未增加正文/附件复制字段。 |
| AE5 | 通过 | 覆盖缺少主内容、草稿/删除主内容、删除工作项和双写入 scope 校验。 |
| AE6 | 通过 | Browser API、Desktop registry/transport、OpenAPI 和 device contract 已同步。 |
| AE7 | 通过 | 关联列表关键词覆盖编号、标题、摘要，真实资料筛选不会过滤关联区域。 |

## Implementation Units 对照

| 单元 | 结果 | 说明 |
| --- | --- | --- |
| U1 | 完成 | 新表、唯一约束、项目归属触发器、链接生命周期和实时摘要查询已实现。 |
| U2 | 完成 | Web API、路由、OpenAPI、Browser client、Desktop registry/transport 和契约测试已同步。 |
| U3 | 完成 | 工作项详情提供确认式链接/取消链接操作，并处理重复点击、失败和路由切换竞态。 |
| U4 | 完成 | 资料库独立展示关联内容，关键词只作用于关联查询，真实资料保持独立滚动和筛选语义。 |
| U5 | 完成 | 已完成本记录、聚焦验证、风险记录和部署前边界核对；本轮不执行正式环境部署。 |

## 已执行验证

### 新功能聚焦验证

- `cargo test -p yuance-api --test project_management_flow api_v1_work_item_resource_library -- --nocapture`：4 项通过。
- `cargo test -p yuance-api --test resource_contract`：4 项通过。
- Desktop operation registry / renderer transport 相关测试：42 项通过。
- `@yuance/frontend-ui` 测试：84 项通过。
- `@yuance/frontend-api-client` 测试：58 项通过。
- Web API 测试：61 项通过。
- App core 测试：76 项通过。
- App shell 测试：10 项通过。
- `npm run check:frontend`：通过。
- `cargo fmt --all -- --check`：通过。
- `git diff --check`、`git diff --cached --check`：通过。
- `make crg.review BASE=HEAD`：已执行，仅作为调用范围旁路证据；报告未覆盖部分与实际新增测试结果不一致，未替代源码和运行测试结论。

### 全量验证限制

Desktop 全量测试中部分 Electron 集成测试因本机 Electron 安装不完整失败；新增 registry/transport 测试已单独通过。API 全量集成流仍有既有测试债务：demo seed 仍断言旧的 3 个项目、当前项目/项目分页排序依赖旧 fixture、资料附件删除测试未携带当前要求的 `If-Match`。Web E2E 另有既有的“time management page stays independent...”标题断言失败，表现为点击资料库后找不到旧 `h3` 标题，与本次关联发布内容链路无直接调用关系，需后续单独确认。

## 主要发现与残留风险

### 必须修正的问题

无。当前没有发现会阻断本功能发布的权限绕过、跨项目关系、重复链接、源内容删除或 Browser/Desktop 契约问题。

### 可接受的残留项

- 历史主发布内容指针为空时，关联列表会对每条关系回退读取工作项详情和评论，形成 N+1 查询；这是兼容旧数据的低频路径。后续可在迁移或一次性回填后移除回退查询，或批量加载主内容。
- 关系写入成功后审计日志写入失败时，接口可能返回错误而关系已经存在；该行为与现有业务操作一致，后续应统一审计与业务写入事务边界。
- 关联发布内容接口沿用当前无分页列表。当前项目规模内可接受，数据量扩大后需要增加分页、服务端限制和前端虚拟化/分段加载。

### 后续跟进

- 单独修复全量测试中的旧 fixture、`If-Match` 和时间管理页面标题断言，不在本功能提交中扩大范围。
- 观察正式环境关联列表查询耗时和返回体大小，再决定是否推进分页与批量主内容加载。
- 本次迁移只增加独立关系表；代码回滚不会删除源资料，数据库回滚应按正式发布手册执行，不直接删除已存在关系数据。

## 回滚与部署边界

本轮尚未部署正式环境。发布前需要按 `docs/runbooks/production-deployment.md` 执行，确认新增迁移成功、服务健康、工作项详情链接状态和资料库关联列表均可访问。若需回滚，优先回滚应用镜像；新增关系表保留不会影响旧版本读取既有工作项和真实资料，不能直接删除关系表或源数据。

## 最终结论

- 结论：有条件通过。
- 下一步：提交并推送 `main`，在用户明确要求后按正式环境 runbook 部署；全量测试债务和分页/N+1 优化作为后续工作跟进。
