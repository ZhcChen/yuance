---
title: feat: 工作项指派与回复站内通知
type: plan
status: completed
date: 2026-07-11
---

# feat: 工作项指派与回复站内通知

## 问题与目标

需求、任务和 Bug 已支持连续指派与论坛式回复，但接收人只能依赖顶部待处理角标或主动进入详情发现变化。需要增加持久化站内消息，让被指派人和被回复人及时看到通知，并能直接回到对应工作项或评论位置。

## 范围

- 顶部用户头像左侧增加消息入口、未读角标和最近消息下拉。
- 增加独立消息列表页面，展示已读/未读状态并支持筛选、单条查看和全部已读。
- 工作项指派给其他用户时创建通知；评论回复其他用户时创建通知。
- 点击通知时先标记已读，再跳转到工作项顶部或对应评论锚点。
- 回复关联的指派允许携带评论 ID，以便定位到触发指派的内容。
- 不向动作发起人发送自我通知；通知永久保留，不提供删除。

## 非目标

- 不做 WebSocket、SSE、邮件、短信或移动端推送。
- 不做通知删除、撤回、复杂订阅偏好和跨项目广播。
- 不引入消息队列；当前 SQLite 单体事务足以保证一致性。

## 关键决策

1. **通知与业务动作同事务写入。** 指派和回复成功时同步插入通知，避免业务已成功但消息缺失。
2. **顶部通知使用 JSON API 渐进增强。** `api/templates/layouts/web.html` 只提供稳定容器，避免给所有 Askama 页面模板重复增加通知字段；浏览器加载后获取最近 5 条与未读总数。
3. **查看入口由 Web 路由处理。** `/web/messages/{id}/open` 校验消息归属、写入 `read_at` 后 303 跳转，保证即使 JavaScript 不可用也能正确标记已读。
4. **定位使用锚点与滚动间距。** 回复消息跳到 `#comment-{id}`，详情页评论增加 `scroll-margin-top` 和短暂目标高亮；普通指派不带锚点，进入页面顶部。
5. **未读角标口径统一。** 数据库实时统计 `read_at IS NULL`，0 时隐藏，1-99 显示数字，超过 99 显示 `99+`。

## 数据设计

新增 `notifications`：

- `id`
- `recipient_user_id`
- `actor_user_id`
- `kind`：`work_item_assigned` / `comment_replied`
- `work_item_id`
- `comment_id`（可空）
- `title`
- `body`
- `read_at`（可空）
- `created_at`

索引覆盖接收人时间排序、接收人未读统计；外键关联用户、工作项和评论。

## 实施单元

### [x] T1. 通知数据模型与查询服务

**文件：**

- `api/migrations/202607110002_create_notifications.sql`
- `api/src/domains/notifications.rs`
- `api/src/domains/mod.rs`

**实现：** 定义通知摘要、分页列表、未读计数、单条已读、全部已读和归属校验；提供事务内插入帮助函数。

**测试场景：** 空列表、未读统计、单条已读幂等、全部已读、用户不能读取或修改他人消息。

### [x] T2. 指派与回复触发通知

**文件：**

- `api/src/domains/projects.rs`
- `api/src/web/api/mod.rs`
- `api/src/web/user/mod.rs`
- `api/tests/project_management_flow.rs`

**实现：** 指派目标不是操作者时创建指派通知；回复目标不是操作者时创建回复通知；自动“回复并指派”将新评论 ID 传给指派动作作为定位来源。

**测试场景：** 指派产生一条未读消息、回复产生一条未读消息、自我指派/自我回复不通知、事务失败不残留通知、关联评论 ID 正确。

### [x] T3. 通知 API、消息页与查看跳转

**文件：**

- `api/src/web/api/mod.rs`
- `api/src/web/user/mod.rs`
- `api/src/web/router.rs`
- `api/templates/web/messages.html`
- `api/tests/project_management_flow.rs`

**实现：** 最近通知 API、消息列表页、未读筛选、全部已读和单条查看跳转；保持认证、CSRF、项目访问范围和统一错误协议。

**测试场景：** API 只返回当前用户消息；查看未读消息后写入已读时间并跳转正确锚点；直接指派跳转不带锚点；全部已读清零。

### [x] T4. 顶部入口、下拉与评论定位体验

**文件：**

- `api/templates/layouts/web.html`
- `api/static/app.js`
- `api/static/app.css`
- `api/templates/web/partials/work_item_detail.html`

**实现：** 消息图标、`99+` 角标、最近消息下拉、加载/空/错误状态；消息页和下拉统一视觉；评论锚点定位、高亮和减少动画兼容。

**验证：** 桌面与移动端无重叠；下拉键盘可达；0 条隐藏角标；100 条显示 `99+`；点击回复通知定位并高亮评论；普通指派回到详情顶部。

## 顺序与验证

1. T1 migration 与领域服务。
2. T2 事务触发，先完成数据一致性闭环。
3. T3 路由与页面。
4. T4 顶部交互与浏览器验证。
5. 执行 `cargo fmt --all`、`cargo check -p yuance-api`、相关集成测试、完整 `project_management_flow`、`git diff --check`，并使用隔离浏览器会话验证桌面和移动端。

## 风险控制

- 通知插入失败必须使对应指派或回复事务失败，不能静默丢消息。
- 查看路由必须按 `recipient_user_id` 更新，避免越权标记或推断他人消息。
- 消息标题和正文由服务端模板转义，不接受 HTML。
- 评论已被隐藏或不存在时仍回退到工作项详情，不暴露不存在评论的内部信息。
- 未读数使用索引实时查询，当前规模不引入缓存失效问题。
