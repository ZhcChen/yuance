---
date: 2026-07-25
topic: super-admin-resource-password-reset
status: active
origin: user-request
---

# 超级管理员重置资料库保险箱密码计划

## 目标

- 为项目资料库的“保险箱”访问密码增加超级管理员应急重置能力。
- 允许超级管理员在**不知道旧密码**的情况下，对单条资料执行：
  - 设置新密码
  - 清除密码
- 保持资料库现有“访问密码只作为查看门禁，不做正文加密存储”的模型不变（延续 `docs/plans/2026-07-16-001-feat-resource-password-and-web-dual-token-plan.md`）。

## 问题背景

- 当前资料库密码能力只覆盖：
  - 正常查看时输入密码解锁；
  - 在资料已解锁且具备内容写权限时，通过“编辑资料”修改/清除密码。
- 这导致一个管理死角：
  - 资料被设置了保险箱密码；
  - 项目成员忘记了密码；
  - 超级管理员虽然拥有全项目访问能力，但仍然**无法直接恢复这条资料的访问门禁**。
- 用户当前明确要求：**超级管理员要能对保险箱密码进行重置**。

## 需求拆解

- R1. 只有超级管理员（`is_super_admin = true`）可以使用保险箱密码重置能力。
- R2. 重置操作不要求输入旧密码。
- R3. 重置入口在资料详情页可见，且在“资料仍处于锁定态”时也能操作。
- R4. 重置支持两种动作：
  - `set`：设置/覆盖为新密码
  - `clear`：清除密码
- R5. 重置成功后要写审计日志，能明确记录：
  - 操作者
  - 资料 ID
  - 项目编码
  - 重置动作（`set` / `clear`）
- R6. 不能返回旧密码，也不能在任何地方暴露旧密码 hash。

## 范围边界

- 只处理**资料库（project resources）**的保险箱密码，不扩展到工作项、评论、附件或其他密码能力。
- 不新增“查看旧密码”“导出旧密码”“绕过密码直接读正文”的能力。
- 不修改资料正文、附件访问 token、项目成员权限模型。
- 不把该能力开放给普通系统管理员或项目管理员；本轮仅限超级管理员。

## 现状梳理

### 现有领域能力

- `api/src/domains/project_resources.rs`
  - `create_resource`：创建资料时可设置 `access_password`
  - `update_resource`：通过 `access_password_action=keep/set/clear` 更新密码
  - `verify_resource_password`：校验查看密码
  - 当前更新逻辑绑定在“编辑资料”主流程上，要求走完整资料编辑，不适合做管理员应急重置

### 现有 Web 入口

- `api/src/web/user/mod.rs`
  - `project_resource_detail_page`：资料详情页
  - `project_resource_unlock`：锁定态解锁提交
  - `project_resource_update`：资料编辑提交
- `api/templates/web/projects/resource_detail.html`
  - 锁定态只展示“输入密码解锁”
  - 编辑资料按钮受 `can_manage_resources && is_unlocked` 控制
  - 这意味着当前**锁定态下没有任何密码恢复/重置入口**

### 可复用模式

- `api/templates/web/system/users.html`
  - 系统用户“重置密码”已采用 modal 方式承载敏感操作
- `api/src/web/user/mod.rs`
  - 系统管理侧已存在 `is_super_admin` 分支和敏感操作守卫模式

### 既有知识

- `docs/solutions/` 当前没有与“资料库保险箱密码重置”直接相关的沉淀。

## 关键决策

1. **重置能力单独建模，不复用资料编辑提交。**
   - 原因：应急重置只变更访问门禁，不应要求同时提交标题、正文、分类等字段。
   - 这能避免锁定态下为了改密码还必须先“解锁正文”的循环依赖。

2. **权限以 `is_super_admin` 为准，不走普通 RBAC 权限点扩展。**
   - 原因：用户明确点名“超级管理员”。
   - 这是一类高敏感度越权恢复操作，直接绑定超管身份最清晰。

3. **UI 入口同时覆盖锁定态与已解锁态。**
   - 锁定态：在保险箱验证卡片中增加“超级管理员重置保险箱密码”入口。
   - 已解锁态：在资料详情页右上操作区也保留同一入口，避免必须先回到锁定态。

4. **重置动作只支持 `set` 与 `clear`，不提供 `keep`。**
   - 这是独立的管理员操作面板，不是编辑资料表单的子集。
   - 管理员进入该弹窗就意味着要执行实际变更。

5. **重置成功后的页面反馈按动作区分。**
   - `clear`：资料已不再受保护，可直接返回详情页明文展示正文。
   - `set`：返回详情页锁定态，并给出“已重置，请使用新密码验证”的成功反馈。
   - 这样不引入“管理员自动旁路解锁正文”的额外能力。

6. **审计日志独立命名。**
   - 建议 action：`project_resource.password.reset`
   - metadata 至少包含：`project_key`、`mode`（`set`/`clear`）、`actor_is_super_admin:true`

## 实施单元

- [ ] Unit 1：资料库密码重置领域能力
  - 目标：为资料库增加独立的保险箱密码重置入口，不依赖资料编辑。
  - 文件：
    - `api/src/domains/project_resources.rs`
  - 方案：
    - 新增独立输入结构，例如 `ResetResourceAccessPasswordInput`
    - 新增领域函数，例如 `reset_resource_access_password(...)`
    - 复用现有 `validate_access_password` 和 hash 逻辑
    - `set` 时生成新 hash，`clear` 时置空 hash
    - 不要求资料已解锁
  - 测试场景：
    - Happy path：`set` 成功覆盖旧密码
    - Happy path：`clear` 成功移除密码
    - Error path：`set` 但新密码为空
    - Error path：动作不是 `set/clear`
  - 验证信号：
    - 数据库中的 `access_password_hash` 按动作正确变化

- [ ] Unit 2：Web 侧超管重置路由与页面状态
  - 目标：在资料详情页增加超管专用保险箱密码重置提交流程。
  - 文件：
    - `api/src/web/router.rs`
    - `api/src/web/user/mod.rs`
  - 方案：
    - 新增 POST 路由，例如：
      - `/web/projects/{project_key}/resources/{resource_id}/password/reset`
    - 在 handler 中：
      - 校验 CSRF
      - 读取当前用户上下文
      - 要求 `context.is_super_admin == true`
      - 保持 `project.view` + 项目可访问校验
      - 调用领域层重置函数
      - 写审计日志
      - 按 `set/clear` 构造回跳和反馈
    - 详情页模板上下文新增：
      - `can_reset_resource_password`
      - `password_reset_error` / `password_reset_success`
  - 测试场景：
    - 超管可提交重置
    - 非超管访问该路由返回 forbidden
    - `clear` 后详情页直接可见正文
    - `set` 后详情页仍为锁定态，旧密码失效
  - 验证信号：
    - 审计日志存在 `project_resource.password.reset`

- [ ] Unit 3：资料详情页重置入口与弹窗交互
  - 目标：在锁定态与正常详情态提供统一的超管重置入口。
  - 文件：
    - `api/templates/web/projects/resource_detail.html`
  - 方案：
    - 在锁定态卡片内增加超管专用次级按钮/说明
    - 在已解锁态右上操作区保留同一入口
    - 使用现有 modal 样式模式，弹窗内提供：
      - 动作选择：设置新密码 / 清除密码
      - 新密码输入框（仅 `set` 时必填）
      - 风险提示：此操作会覆盖原保险箱密码
    - 关闭/提交交互沿用现有 modal 组件和按钮布局
  - 测试场景：
    - 锁定态超管能看到入口，普通用户看不到
    - 已解锁态超管能看到入口，普通用户仍仅保留现有编辑能力
    - 表单报错时弹窗内能看到错误反馈
  - 验证信号：
    - 页面结构稳定，锁定态不再只有“输入密码解锁”单一路径

- [ ] Unit 4：回归测试与文档同步
  - 目标：覆盖超管重置资料密码的关键回归场景。
  - 文件：
    - `api/tests/project_management_flow.rs`
    - 如有必要：`docs/plans/2026-07-16-001-feat-resource-password-and-web-dual-token-plan.md`（仅做关联说明，不改其完成状态）
  - 方案：
    - 补集成测试覆盖：
      - 超管 reset clear
      - 超管 reset set
      - 非超管 forbidden
      - 旧密码失效 / 新密码生效
    - 保持已有资料密码编辑测试不回归
  - 测试场景：
    - 锁定态资料通过超管清除密码后可直接访问
    - 锁定态资料通过超管设置新密码后，新密码可验证，旧密码不可验证
    - 审计日志记录动作和项目信息
  - 验证信号：
    - `cargo test -p yuance-api --test project_management_flow`
    - `git diff --check`

## 风险与注意点

- **权限歧义风险：** 必须明确为 `is_super_admin`，避免普通系统管理权限被误放大成“可重置资料保险箱密码”。
- **页面状态风险：** `set` 成功后不能错误地继续展示正文，否则相当于变相绕过资料门禁。
- **审计缺失风险：** 这是高敏感操作，必须独立记账，不能只依赖普通 `project_resource.update`。
- **交互歧义风险：** 锁定态下超管入口和普通解锁入口要明显区分，避免用户误会“所有人都能重置密码”。

## 验证清单

- 超级管理员在锁定态资料详情页可以看到“重置保险箱密码”入口。
- 普通项目成员、普通系统管理员都看不到该入口，也不能直接 POST 成功。
- 超管执行 `clear` 后，资料正文和附件可正常访问。
- 超管执行 `set` 后，旧密码不可用，新密码可正常解锁。
- 审计日志中存在独立的资料密码重置记录。
