---
title: Web 与 Desktop U7 系统存储操作复核
type: review
status: completed
date: 2026-08-08
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U7 系统存储操作复核

## 结论

对象存储配置保存、激活配置探测、Bucket 初始化和版本回滚已进入唯一共享 React 状态机。Browser 与 Desktop 使用同一表单、确认、单飞锁、成功反馈和写后 `storage-view` 刷新语义；宿主只负责 Cookie/CSRF 或固定 device operation 传输。

## 契约与边界

- 保存配置必须重新填写完整 AccessKey；页面和响应只保留脱敏 hint，切换 Endpoint/Bucket 前明确提示对象不会自动迁移。
- 探测只针对当前激活配置，不接受未保存候选配置；初始化明确提示创建 Bucket、配置 CORS 和写入初始化标记。
- 回滚从不可变快照生成新的激活版本，不修改历史记录，并在确认框展示目标版本和 Bucket。
- 四个 Desktop operation 均为固定路径、封闭输入和非幂等请求，不开放通用 system fetch，也不自动重试。
- mutation 单飞；写成功后的视图刷新失败单独报告，不把已提交操作误报为失败。

## 验证

- `frontend/packages/api-client/test/system.test.mjs`：四个固定 JSON mutation 与写准备顺序通过。
- `desktop/test/operation-registry.test.mjs`、`desktop/test/renderer-api-transport.test.mjs`：固定 operation、输入校验、非幂等标记和路径映射通过。
- `api/tests/storage_config_flow.rs`：保存脱敏、CSRF/RBAC、探测、初始化、回滚和审计基础契约通过。
- `web/e2e/app-shell.spec.mjs`：目标切换、初始化、回滚确认，重复提交锁、动作顺序、写后刷新和已提交/刷新失败区分通过。

## 后续

`page.system.storage` 与四个存储 action 已达到 `shared`。正式 `/web/system/storage` route cutover、Rust 路由门禁、登录回跳和 flag-off SSR 回滚留在下一个独立切片。
