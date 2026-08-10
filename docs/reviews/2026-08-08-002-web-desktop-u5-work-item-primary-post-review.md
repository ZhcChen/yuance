---
title: Web 与 Desktop U5 工作项富文本主帖复核
type: review
status: completed
date: 2026-08-08
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U5 工作项富文本主帖复核

## 结论

工作项正文已从纯文本摘要迁移为唯一 canonical 富文本主帖。Browser 与 Desktop 共用 `RichTextContent`、`RichTextEditor`、API client 和同一 mutation state machine；服务端负责 HTML 消毒、附件引用校验、纯文本摘要同步和主帖身份持久化，普通评论列表不再重复显示主帖。

## 数据与并发

- `work_items.primary_post_comment_id` 保存稳定主帖身份；历史未绑定数据只在首次读取或更新时使用旧摘要启发式，后续立即固化 ID。
- nullable foreign key 使用 `ON DELETE SET NULL`，partial unique index 防止同一评论绑定多个工作项，INSERT/UPDATE trigger 防止跨工作项绑定。
- 主帖定位、创建或更新、附件引用校验、摘要与 ID 同步、活动和提及通知写入同一 SQLite 事务。
- 事务开始后通过工作项 no-op UPDATE 获取写锁，再重新读取已持久化 ID；两个并发首次保存会复用同一 comment ID，不产生孤立评论。
- 旧 Web 保存主帖时同步 canonical ID 与摘要，迁移期间不会让两套入口破坏主帖身份。

## 权限与宿主边界

- `PATCH /api/v1/work-items/{item_key}/primary-post` 只接受 `body_format=html`，正文上限为 20,000 字符，并要求报告人身份以及 `work_item:write`、`comment:write`。
- Browser 使用 Cookie/CSRF；Desktop 使用 Device principal 和固定 `workitem.primarypostupdate` 操作。
- Desktop registry 固定方法、路径、输入字段和响应 DTO；renderer 没有通用 fetch、请求原语、凭证或签名 URL。
- OpenAPI 与 Device allowlist 已登记新端点，并通过真实 Device principal 读写和撤销契约验证。
- 未使用 macOS Keychain 或 Electron `safeStorage`。

## 交互与恢复

- 字段 PATCH 成功而主帖 PATCH 失败时，界面保留已提交字段和待重试正文；再次保存只重试主帖，不重复字段写入。
- 主帖保存成功后立即采用服务端返回的 canonical comment；伴随详情刷新失败时仍用已知主帖 ID 过滤评论。
- 清空编辑器不会重新注入旧摘要；富文本正文与列表纯文本摘要分别遵循各自契约。
- mutation、导航和刷新继续使用既有 action epoch，旧响应不能回滚已确认结果。

## Review 处理

- API contract、correctness、security、testing、project standards、reliability、data migration 与独立跨模型 adversarial review 已执行。
- 已通过 canonical ID 消除绑定后的摘要碰撞，并修复跨工作项绑定、并发首次创建、非原子写入、部分成功重复 PATCH、详情刷新失败重复显示、非法 manifest phase 和空编辑器回退。
- 独立复核实际服务模型为 `deepseek-v4-flash`，请求模型为 `opus`；receipt 支持且独立性已验证。

## 验证

```text
静态与聚焦验证：
- `cargo fmt --all -- --check`：通过
- `cargo check -p yuance-api`：通过
- 主帖消毒、权限与原子详情：2 passed
- 并发首次创建复用 comment：1 passed
- 全量 migration 应用：1 passed
- `npm run check:frontend`：通过
- 部分失败、详情刷新失败和保存成功聚焦 E2E：4 passed

双宿主与契约 Gate：
- Browser E2E：50 passed
- Desktop：416 passed，3 个 Windows-only skipped
- Device OpenAPI allowlist freeze：1 passed
- Device principal 业务读写与撤销契约：1 passed
- OpenAPI、体验清单 JSON 解析：通过
- `git diff --check`：通过
```

## 剩余风险

- 业务事务提交后才写 API audit；若 audit 单独失败，主帖已持久化但请求可能返回错误。后续应统一定义 post-commit audit 失败语义并补故障注入。
- 历史未绑定且使用“见首条图文说明”摘要的工作项仍需一次性启发式定位；若报告人此前存在其他顶层 HTML 评论，首次固化可能选错。正式迁移前应增加离线回填或冲突报告，运行时已绑定数据不再受该问题影响。
- Desktop detail DTO 使用严格字段集合；包含 `primary_post` 的服务端与 Desktop 客户端需要协调发布，错峰版本不兼容。正式发行前应通过版本 capability 或兼容窗口处理。
- 通过通用评论编辑入口修改 canonical 主帖会暂时造成列表摘要陈旧；当前共享详情只通过专用主帖端点编辑，后续评论编辑切片应禁止或重定向该路径。

U5 详情页整体仍为 `in_progress`。评论回复、评论编辑、提及候选、剩余附件语义、正式详情路由切换和旧实现退役继续由后续切片完成。
