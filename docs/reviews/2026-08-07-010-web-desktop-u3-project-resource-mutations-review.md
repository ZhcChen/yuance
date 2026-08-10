---
title: Web 与 Desktop U3 项目资料写操作复核
type: review
status: completed
date: 2026-08-07
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U3 项目资料写操作复核

## 结论

项目资料创建、普通编辑和归档已进入唯一共享 React 交互。Browser 与 Desktop 共用表单、校验输入、提交锁、反馈和路由竞态保护；Desktop 只通过三个固定 operation 调用真实 API。

`action.project.resource.archive` 已完整达到 `shared`。创建和编辑的核心字段、关联对象及密码策略已经双宿主贯通，但既有 contract 还要求富文本附件注册、上传和引用删除，因此两个动作保持 `in_progress`，不以本切片替代后续附件工作。

## 行为证据

- 项目 owner、maintainer 和超级管理员可从资料库创建资料；viewer 不显示写入口。
- 创建表单统一标题、分类、标签、工作项/周期关联、`plain/html` 正文格式、正文和可选初始密码。
- 已解锁且未归档资料可编辑；受保护但未解锁的资料不开放正文编辑，避免用摘要 DTO 覆盖真实正文。
- 编辑密码策略只允许 `keep/set/clear`；`set` 才显示新密码字段，`clear` 显式发送空密码。
- 归档使用确认弹窗，成功后返回资料库并刷新最终归档状态；已归档资料不再显示编辑和归档入口。
- mutation 绑定 `route.id + projectKey + resourceId + actionId`，提交锁由 action ID 持有到原请求真实结束。慢更新期间切换路由后不能发起重叠写入，迟到结果也不会修改新页面、显示错误或重新打开弹窗。
- Desktop renderer 只提交领域字段，主进程 registry 固定映射 `project.resourcecreate`、`project.resourceupdate` 和 `project.resourcearchive`，不暴露通用请求原语。
- 真实 API + Electron 流程以 device principal 完成 create -> update -> archive，并验证三项 mutation 各执行一次。

## 验证

```text
npm --prefix frontend run check
npm --prefix web run test:e2e -- --grep "shared project resource"
node --test desktop/test/operation-registry.test.mjs desktop/test/renderer-api-transport.test.mjs desktop/test/renderer-composition.test.mjs
node --test desktop/test/desktop-business-api-integration.test.mjs
```

结果：共享前端全部 package 与仓库测试通过；Browser 资料读取、创建/编辑/归档、viewer 权限和迟到响应共 4 项聚焦 E2E 通过；Desktop 聚焦测试 25 项和真实 API + Electron 集成 1 项通过。

## 后续边界

- 超级管理员独立密码重置仍需单独 API、固定 Desktop operation、高风险确认和审计证据。
- 富文本资料附件注册、上传、下载、预览、引用删除和一致渲染尚未完成，因此 create/update 与资源详情页保持 `in_progress`。
- 项目个人分析完成前，`page.project.detail` 继续保持 `in_progress`。
