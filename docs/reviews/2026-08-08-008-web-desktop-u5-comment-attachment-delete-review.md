---
title: Web 与 Desktop U5 评论编辑附件删除复核
date: 2026-08-08
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
unit: U5
status: accepted
---

# Web 与 Desktop U5 评论编辑附件删除复核

## 结论

已发布评论的附件删除已进入唯一共享 React 编辑流程。只有评论作者在编辑态可见删除入口；用户确认后，服务端先验证移除引用不会产生空评论，再删除对象，并在同一个 SQLite 事务中精确移除对应 `data-yuance-attachment-id` 节点与归档附件，客户端同步更新编辑器和附件列表并保持编辑态。即使用户随后取消编辑或离开详情页，持久化正文也不会留下悬空附件引用；对象删除失败时数据库保持不变，事务失败时可利用对象删除幂等语义重试。

Browser 与 Desktop 使用同一个 API client 方法。Browser adapter 固定发送 `x-yuance-editor-context: work-item-comment-edit`；Desktop renderer 只能映射固定 DELETE 路径，operation registry 只登记受控 `editorContext`，REST transport 再映射为固定 header，不能传入 URL、method、header 或 body。服务端统一接受 Cookie 或 Device principal，并继续执行作者/超级管理员权限、项目写权限、`comment:write` scope、正文引用清理、对象删除、附件归档和审计。

## 验证证据

- `npm --prefix frontend run check`：共享 API client、App Shell、UI、边界与 manifest 共计全部通过。
- `npm --prefix web run check`：Browser adapter 类型、lint 和 39 项单元测试通过。
- `npm --prefix web run test:e2e -- --grep "work item comment edit confirms attachment deletion"`：取消确认不请求；确认后固定 header、附件列表、正文引用与保存顺序通过。
- 原工作项附件上传下载 E2E 回归通过。
- Desktop registry、rest transport、renderer transport 测试通过，固定 editor context、header 映射与注入拒绝均有断言。
- `node --test desktop/test/desktop-business-file-integration.test.mjs`：真实 Electron、Device credential、对象上传/读取/删除和删除后列表状态通过。
- `cargo test -p yuance-api --test device_business_parity_flow device_principal_completes_work_item_and_comment_attachment_signing_lifecycle`：Device principal 无上下文拒绝、正确上下文删除、正文引用清理及对象清理通过。
- `api/tests/project_management_flow.rs` 覆盖 Browser Cookie 无上下文拒绝、删除后空评论预检、失败时对象与 uploaded 状态保留、正确上下文成功、精确正文引用清理、对象清理和附件 `deleted` 状态。

## 范围判断

`action.work-item.comment.update` 保持 `shared`，并将附件删除登记为该编辑动作的受控 API effect；没有创建不存在的旧 Web 独立动作。U5 详情页整体仍为 `in_progress`，下一步复核工作项主帖附件删除语义，并完成正式详情路由切换、旧 partial 退役与 U5 closure gate。
