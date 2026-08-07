---
title: Web 与 Desktop U5 工作项生命周期复核
type: review
status: completed
date: 2026-08-08
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U5 工作项生命周期复核

## 结论

工作项关闭、重新打开和删除态恢复已进入唯一共享 React 详情实现。服务端原子详情契约决定可见动作，`SharedApp` 统一确认弹窗、提交锁、错误反馈、mutation 提交和 companion refresh；Browser 与 Desktop 不再分别实现生命周期交互。

## 权限与宿主边界

- 仅当前处理人可关闭未关闭工作项；有项目写权限的成员可重新打开，规则仍由服务端状态转换最终裁决。
- 恢复只对已删除工作项和具备 `work_item.manage` 的项目写入者开放。
- Browser 使用 Cookie/CSRF；Desktop 使用 device access token 和新增的 `workitem.restore` 固定操作。
- Desktop 恢复操作固定为无 body 的 `POST /api/v1/work-items/{item_key}/restore`，输入、路径和响应 DTO 均受 registry 校验。
- OpenAPI Device allowlist 已显式加入恢复端点，并由真实 Device API 流程验证归档后恢复及持久化状态。
- 未使用 macOS Keychain 或 Electron `safeStorage`。

## 交互与竞态

- 关闭、重开和恢复均需在共享 modal 中二次确认。
- mutation 期间详情编辑、移交、评论、附件和生命周期按钮共享同一提交锁。
- 深度复核修正了 lifecycle loading 状态误挂到普通编辑提交的问题；编辑失败后不再残留锁，生命周期确认期间保持自身 loading 状态。
- mutation 成功后立即提交服务端响应，再刷新原子详情、评论和顶部状态；旧 GET 响应不能回滚已确认状态。
- 删除态在恢复前不显示编辑或移交表单，恢复完成后按新原子权限重新开放操作。

## 验证

```text
聚焦单元：
- frontend UI：32 passed
- frontend API client：27 passed
- Desktop registry/transport：16 passed
- Web source/type/lint/unit：39 passed

契约与真实身份：
- openapi_freezes_d2_device_business_allowlist：1 passed
- device_principal_matches_business_read_write_and_revocation_contract：1 passed

Browser：
- 关闭与重开共享确认 E2E：1 passed
- 删除态恢复共享确认 E2E：1 passed

完整 Gate：
- `npm run check:frontend`：通过
- Browser E2E：48 passed
- Desktop：416 passed，3 个 Windows-only skipped
- `cargo fmt --all -- --check`：通过
- `git diff --check`：通过
```

详情页整体仍为 `in_progress`。富文本主帖、回复与提及、附件预览、正式详情路由切换和旧实现退役继续由后续 U5 切片完成。
