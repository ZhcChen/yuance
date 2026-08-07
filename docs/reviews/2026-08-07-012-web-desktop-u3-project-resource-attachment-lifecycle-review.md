---
title: Web 与 Desktop U3 项目资料附件生命周期复核
type: review
status: completed
date: 2026-08-07
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U3 项目资料附件生命周期复核

## 结论

项目资料附件的登记、上传、继续上传、下载、Desktop 显示文件位置和删除已进入唯一共享 React 交互。Browser 与 Desktop 共用按钮、状态、确认弹窗、错误反馈和文件业务 use case；Desktop renderer 只使用逐动作白名单能力，不持有 URL、header、对象 key 或通用网络请求能力。

`action.project.resource-attachment.download` 已达到 `shared`。资料附件预览、预览内容流和富文本附件引用仍未完成，因此 `page.project.resource-detail`、`action.project.resource.create` 与 `action.project.resource.update` 继续保持 `in_progress`。

## 行为证据

- 公开资料进入详情后直接加载附件；受保护资料锁定时不读取附件，解锁成功后携带短时 grant 加载和下载。
- grant 绑定用户、资料 ID 和当前密码 hash，有效期 15 分钟。设置或轮换密码后旧 grant 立即失效，清除密码后附件恢复公开访问。
- 密码校验与 grant 签发使用同一次密码 hash 快照；即使管理员并发轮换密码，也不会向只验证过旧密码的请求签发绑定新密码的 grant。
- 上传遵循 `register -> sign -> PUT -> uploaded`，失败或 pending 附件可继续上传；删除使用独立确认弹窗并刷新最终列表。
- 资料编辑、归档、密码重置与附件上传、删除共享互斥边界，避免两个 mutation 并发覆盖状态或产生误导反馈。
- viewer 可查看和下载公开资料附件，但看不到上传和删除入口；写 API 使用 D2 principal，Browser session 与 Desktop device token 保持同一权限结果。
- Desktop preload 只暴露 `uploadProjectResourceAttachment`、`downloadProjectResourceAttachment` 与 reveal 能力；主进程固定构造资料附件路径并私有化签名传输信息。
- 真实 API + Electron 集成覆盖资料附件上传、列表、下载、内容哈希、reveal 和删除，Browser E2E 覆盖同一用户流程。

## 验证

```text
cargo fmt --manifest-path api/Cargo.toml -- --check
cargo test --manifest-path api/Cargo.toml --test device_business_parity_flow
cargo test --manifest-path api/Cargo.toml --test device_session_contract_flow
npm --prefix frontend run check
npm --prefix web run check
npm --prefix desktop run check:renderer
node --test desktop/test/attachment-operation-registry.test.mjs desktop/test/business-attachment-coordinator.test.mjs desktop/test/file-commands.test.mjs desktop/test/preload-contract.test.mjs desktop/test/operation-registry.test.mjs desktop/test/renderer-api-transport.test.mjs desktop/test/renderer-composition.test.mjs desktop/test/app-bundle-verification.test.mjs
node --test desktop/test/desktop-business-file-integration.test.mjs
npm --prefix web run test:e2e -- --grep "shared project resource"
```

结果：API 设备业务与 session 契约、共享前端、Web、Desktop renderer、固定 IPC/operation、bundle 边界、真实 Electron 文件流程和 Browser 资料聚焦流程均通过。

## 后续边界

- 资料附件 preview 与 preview-content 尚未迁移到共享实现。
- 富文本安全渲染、附件插入、引用校验及移除引用后删除同步尚未完成。
- 上述能力完成并通过双宿主验证后，再提升资料详情页和 create/update 动作为 `shared`。
