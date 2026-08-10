---
title: Web 与 Desktop U3 项目资料密码重置复核
type: review
status: completed
date: 2026-08-07
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U3 项目资料密码重置复核

## 结论

项目资料密码重置已进入唯一共享 React 交互，并与普通资料编辑权限分离。Browser 与 Desktop 共用入口、确认弹窗、校验、提交锁、反馈和最终锁定状态；Desktop 只通过固定 operation 调用真实 API。

`action.project.resource.password-reset` 已达到 `shared`。资料详情页仍因富文本附件能力未完成而保持 `in_progress`。

## 行为证据

- 入口仅对超级管理员显示，且资料锁定时仍可操作；viewer 和 maintainer 即使直接请求 API 也统一返回 403。
- 重置只接受 `set/clear`。`set` 要求 4 到 128 位新密码，`clear` 不接受非空密码。
- 独立高风险确认弹窗明确说明跨宿主访问影响，不复用普通编辑表单或其项目管理权限。
- 设置新密码后当前宿主立即回到锁定态；清除密码后显示公开正文。API 向项目成员和有效超级管理员发布 `topbar` 刷新，使其他宿主重新读取最终保护状态。
- 已归档资料在领域层拒绝重置；成功操作记录 `project_resource.password.reset` 审计及执行人快照、项目、模式和超级管理员标记。
- mutation 使用资料 action ID 锁，路由切换后的迟到响应不能修改新页面；Desktop registry 固定映射 `project.resourcepasswordreset`，不暴露通用请求能力。
- 真实 API + Electron 流程覆盖 `set -> clear`，并验证请求字段和最终资料状态。

## 验证

```text
cargo fmt --manifest-path api/Cargo.toml -- --check
cargo test --manifest-path api/Cargo.toml --test device_business_parity_flow
npm --prefix frontend run check
npm --prefix web run check
npm --prefix desktop run check:renderer
node --test desktop/test/operation-registry.test.mjs desktop/test/renderer-api-transport.test.mjs desktop/test/renderer-composition.test.mjs
node --test desktop/test/desktop-business-api-integration.test.mjs
npm --prefix web run test:e2e -- --grep "shared project resource"
```

结果：API 设备业务测试 5 项通过；共享前端、Web 与 Desktop renderer 检查通过；Desktop 聚焦测试和真实 API + Electron 集成通过；Browser 资料聚焦 E2E 覆盖超级管理员设置、重新锁定、清除及 viewer 隐藏入口。

## 后续边界

- 资料附件登记、上传、下载、预览、删除及富文本引用同步尚未完成。
- 富文本渲染与附件引用一致前，资料创建、编辑和详情页继续保持 `in_progress`。
