---
title: Web 与 Desktop U5 原子工作项详情视图复核
type: review
status: completed
date: 2026-08-07
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U5 原子工作项详情视图复核

## 结论

Browser 与 Desktop 已通过同一个 `SharedApp`、`WorkItemDetail` 和 API client 原子读取工作项详情首屏。新增 `GET /api/v1/work-item-detail-view/{item_key}` 一次返回详情、周期、处理人和父级候选、合法状态、权限、前后项导航及首屏流转历史，Shared UI 不再根据基础详情响应猜测写权限。

本切片只完成 U5 的详情读取、导航、流转首屏、编辑和移交基础闭环。详情页在 parity manifest 中保持 `in_progress`；恢复、关闭/重开专用交互、富文本主帖、回复与提及、附件预览、正式 `/web/work-items/{item_key}` 切换及旧实现退役仍属于后续 U5 切片。

## 契约与安全边界

- 服务端在原子响应前统一校验 `work_item.view`、token read scope 和项目访问权，写权限由项目状态、RBAC 和项目成员身份计算。
- 状态候选来自服务端合法流转，不允许共享 UI 或 Desktop 自行拼接状态集合。
- 处理人与父级需求改用服务端候选下拉，避免自由文本产生宿主差异。
- 删除态在恢复能力接入前不会显示编辑或移交表单，服务端同时关闭主帖编辑权限。
- Desktop 仅增加 `workitem.detailview` 固定 GET 操作；路径参数、输入字段、响应字段、数组上限和嵌套 DTO 均 fail closed，没有通用 fetch。
- mutation 成功响应是当前详情的已确认事实；后续详情、评论和顶部状态刷新不会用旧 GET 响应回滚已提交结果。
- 未引入 macOS Keychain 或 Electron `safeStorage`。

## 双宿主行为

- 共享详情展示周期、父级关系、前后项导航和流转历史。
- 共享权限控制编辑与移交区域；只读身份不会看到写表单。
- 编辑与移交使用相同候选项、提交锁、错误映射和 companion refresh。
- Browser 保留 Cookie/CSRF；Desktop 保留 device session 与 operation registry，业务组件不识别宿主。
- 原子详情加载失败时清理旧详情和写表单；导航后晚到响应及 mutation 后旧刷新响应不会污染当前状态。

## 验证

```text
共享前端：
- npm run check:frontend：通过

Rust 聚焦验证：
- api_v1_work_item_detail_view_returns_atomic_shared_page_contract：1 passed
- openapi_freezes_d2_device_business_allowlist：1 passed
- device_principal_matches_business_read_write_and_revocation_contract：1 passed

Desktop：
- npm --prefix desktop test：416 passed，3 Windows-only skipped

Browser：
- 原子详情、只读权限和错误态聚焦 E2E：3 passed
- mutation 成功、辅助刷新失败和旧响应竞态聚焦 E2E：3 passed
- 完整 Web E2E：46 passed
```

完整 Browser E2E 首次运行发现两个旧端点 mock 与 mutation 后旧详情覆盖问题；修复后聚焦和完整回归均通过。
