---
title: Web 与 Desktop U3 项目资料读取与解锁复核
type: review
status: completed
date: 2026-08-07
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U3 项目资料读取与解锁复核

## 结论

项目资料列表、普通资料详情和受保护资料解锁已接入唯一共享 React 页面。Browser 与 Desktop 使用同一 route model、API client、DTO 裁剪和交互状态机；Desktop 仅增加三个固定 operation，不提供通用请求能力。

资源详情 contract 还包含创建、编辑、密码重置、归档和附件，因此页面状态更新为 `in_progress`；本切片完整实现的 `action.project.resource.unlock` 更新为 `shared`。

## 行为证据

- 项目详情新增资料库导航，列表支持关键词、分类、状态和标签筛选，展示保护、归档、标签、关联对象和更新时间。
- 普通资料通过共享详情路由读取；正文按文本安全渲染，不使用 `dangerouslySetInnerHTML`。
- 受保护资料初始只显示摘要和密码表单。错误密码保持锁定并显示服务端错误；正确密码返回完整 DTO、清空密码并展示正文。
- Browser 只在明确的 CSRF 校验错误时重试写请求，业务 `403` 不会重复提交。
- Desktop operation registry 只允许 `project.resources`、`project.resourcedetail` 和 `project.resourceunlock`，校验输入字段、路径和响应 DTO。
- 资源 API 使用既有 D2 principal 支持 device access token，同时继续执行权限、scope、项目范围、CSRF/设备鉴权和密码审计。
- 共享包边界扫描忽略注释和字符串中的领域词，但仍拒绝真实 `window`、`document`、`globalThis` 等宿主全局。
- 延迟的解锁成功或失败响应均绑定 `projectKey + resourceId + route + actionId`；离开详情后不会污染资料列表或另一条资料。
- 资料列表沿用服务端当前无分页契约，不再在 Browser 或 Desktop 对第 501 条合法资料产生客户端硬失败；传输字节和单项 DTO 仍受限。
- 共享包边界扫描使用 TypeScript scanner 屏蔽静态字面量，同时继续扫描模板字符串 `${...}` 中的可执行表达式。

## 验证

```text
npm --prefix frontend run check
npm --prefix web run check
npm --prefix desktop run check:renderer
node --test desktop/test/operation-registry.test.mjs desktop/test/renderer-api-transport.test.mjs desktop/test/renderer-composition.test.mjs
node --test desktop/test/desktop-business-api-integration.test.mjs
npm --prefix web run test:e2e -- --grep "shared project resources filter read and unlock protected details"
npm --prefix web run test:e2e
cargo fmt --manifest-path api/Cargo.toml -- --check
```

结果：共享前端 17/35/4/7/24 项 package tests 与 41 项仓库 tests 通过；Web 36 项通过；Desktop 聚焦测试 25 项、真实 API + Electron 集成 1 项通过；Browser 资料聚焦 E2E 1 项及全量 E2E 34 项通过；两个既有顺序敏感 E2E 另行并行重复 3 轮共 6 项通过；Desktop renderer 生产 bundle 构建成功。

## 后续边界

- 资料创建、编辑、密码重置和归档属于下一纵向切片，当前页面不提前暴露未接通按钮。
- 资料附件下载、预览和富文本统一 renderer 仍待后续切片完成。
- 个人分析完成前，`page.project.detail` 保持 `in_progress`；整个资源详情 contract 完成前，`page.project.resource-detail` 保持 `in_progress`。
