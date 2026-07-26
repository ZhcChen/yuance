---
title: feat: 元策下一阶段四项协作效率优化计划
type: feat
status: active
date: 2026-07-26
origin: docs/ideation/2026-07-26-001-yuance-next-optimization.md
---

# feat: 元策下一阶段四项协作效率优化计划

## Overview

围绕当前元策已经成型的项目协作主链路，下一阶段优先聚焦 4 个方向：

1. 工作项列表的**保存筛选视图 + 批量操作**
2. 讨论区的**`@提及 + 草稿恢复 + 待处理提醒`**
3. 资料库的**标签 / 关联 / 版本历史**
4. 周期能力的**看板化与成员负载分析**

本计划只覆盖这 4 个方向，不包含 Flutter `app/` 模块。（see origin: `docs/ideation/2026-07-26-001-yuance-next-optimization.md`）

## Problem Frame

当前元策已经具备：

- 项目 / 需求 / 任务 / Bug 主链路
- 富文本讨论、SSE 实时刷新、typing 提示
- 项目资料库与资料保险箱
- 项目周期与工作项可选归属

但从“可用”走向“高频协作顺手”，还存在 4 个明显短板：

- 工作项列表能筛选，但**不能保存个人常用视图，也缺少真正高频的批量处理能力**
- 讨论区能回复，但**缺少 `@提及`、输入草稿恢复和未处理协作提醒**
- 资料库能存富文本和附件，但**还不够结构化，后续资料一多会难找、难关联、难追溯**
- 周期已经能建、能看时间窗口，但**还没有项目负责人真正关心的“按周期看板推进 + 人员负载判断”**

## Requirements Trace

### A. 工作项保存筛选视图 + 批量操作

- A1：需求 / 任务 / Bug 列表支持保存个人筛选视图。
- A2：筛选视图至少保存：关键词、状态、优先级、处理人、周期、排序方式、每页条数。
- A3：支持设置默认视图。
- A4：支持基于当前筛选条件进行批量操作。
- A5：第一阶段批量操作至少覆盖：指派、状态、优先级、周期。
- A6：批量操作必须沿用现有权限和流转记录，不允许旁路改数据。

### B. 讨论区 `@提及 + 草稿恢复 + 待处理提醒`

- B1：工作项讨论与回复支持 `@提及` 当前项目成员。
- B2：被提及用户收到站内消息，消息可跳到对应评论位置。
- B3：主评论框和回复框支持自动草稿保存与页面刷新恢复。
- B4：富文本草稿恢复不能破坏现有上传中附件、隐藏草稿评论和即时上传链路。
- B5：消息中心与工作台需要提供“待我处理的讨论提醒”视图。
- B6：第一阶段不做后台定时任务催办、不做复杂 SLA，仅做基于现有消息与未读状态的提醒聚合。

### C. 资料库标签 / 关联 / 版本历史

- C1：资料支持多标签。
- C2：资料支持关联到工作项与周期，且关联是可选的。
- C3：资料列表支持按标签、分类、状态、关联对象过滤。
- C4：资料编辑后保留版本历史。
- C5：第一阶段至少支持查看版本历史与版本快照，不强制做版本 diff。
- C6：受保护资料的标签、关联、版本详情仍受现有保险箱访问控制约束。

### D. 周期看板化与成员负载分析

- D1：周期不再只停留在项目详情 tab 的列表 / 路线图摘要。
- D2：需要有更适合负责人查看的周期推进视图。
- D3：至少支持按周期查看工作项状态分布的看板。
- D4：至少支持按成员查看该周期的待处理 / 进行中 / 待确认 / 逾期负载。
- D5：第一阶段不做甘特图、燃尽图、依赖图和复杂预测模型。

## Scope Boundaries

- 不做 `app/` 多端模块。
- 不做新的流程引擎、审批流、节点配置。
- 不做跨项目共享筛选视图；筛选视图以**当前用户 + 当前项目 + 工作项类型**为主。
- 批量操作第一阶段只处理**用户显式选中的工作项**，不做“跨页全量匹配结果一键处理”。
- `@提及` 第一阶段只支持项目成员，不支持跨项目用户。
- 待处理提醒第一阶段不引入 cron / worker / 定时推送；只做基于已有通知与页面聚合的提醒。
- 资料版本历史第一阶段以**查看快照**为主，不做正文 diff、附件 diff、版本回滚。
- 周期优化第一阶段优先做**周期详情页**，不把全部复杂分析继续塞进当前项目详情 tab。

## Context & Research

### Relevant Code and Patterns

- `api/templates/web/work_items/list.html`
  - 当前已有统一筛选表单、表格 partial、分页 partial、新建工作项 modal。
  - 是“保存视图 + 批量操作”最直接的 UI 落点。
- `api/templates/web/partials/work_item_table.html`
  - 当前已抽出统一表格 partial，适合作为批量勾选与批量工具栏复用入口。
- `api/src/web/user/mod.rs`
  - 当前集中拼装需求 / 任务 / Bug 列表、工作项详情、资料库详情、周期详情 tab。
- `api/src/domains/projects.rs`
  - 当前已经承载：工作项列表筛选、周期、评论、富文本清洗、评论草稿、项目资源、动态与流转记录。
  - 是四个方向中最关键的领域落点。
- `api/src/platform/realtime.rs`
  - 已有工作项讨论实时事件和 typing presence，可作为 `@提及` 后局部刷新与提醒同步基础。
- `api/static/app.js`
  - 已有：
    - 顶部搜索历史 localStorage
    - 富文本讨论区、资料库富文本、即时上传
    - smart back、toast、局部交互增强
  - 适合承接工作项视图切换、批量工具栏、讨论草稿恢复与 mention 面板。
- `api/templates/web/projects/detail.html`
  - 当前已包含资料库 tab、周期 list / roadmap 双视图、新建周期 modal、新建资料 modal。
- `api/templates/web/projects/resource_detail.html`
  - 当前已具备资料正文渲染、保险箱校验、编辑资料 modal。
- `api/templates/web/partials/work_item_detail.html`
  - 当前讨论区已经有主评论框、回复框、编辑评论 modal、SSE 局部刷新 data hooks。

### Institutional Learnings

- `docs/solutions/` 当前为空，说明后续执行这些跨模块能力时应顺手沉淀经验。
- 项目规范要求：
  - 文档优先使用仓库相对路径
  - 先规划再执行
  - 提交前至少执行 `git diff --check`
- 当前仓库对“批量移除项目成员”的处理已经采用“先校验后执行、整批失败不做部分成功”策略，可直接类比到工作项批量操作：
  - `docs/plans/2026-07-24-003-feat-system-user-project-batch-management-plan.md`

### External Research Decision

当前这 4 个方向主要是**现有能力深化**，仓库内已经有足够强的本地模式：

- 工作项列表与分页已有统一结构
- 讨论区已有富文本、草稿附件、SSE、typing
- 资料库已有独立 domain 与详情页
- 周期已有模型与 tab 入口

因此本轮**不做外部资料研究**，优先遵循当前仓库模式。

## Key Technical Decisions

- **采用“一份主计划 + 四个工作流单元”而不是立即拆成四份独立计划。**
  - 这 4 个方向都属于“协作效率增强”主线，且都共享 `projects.rs`、`web/user/mod.rs`、`app.js` 与现有模板体系。
  - 后续执行时再按单元拆 commit，更利于保持方向一致。

- **工作项保存视图做成“服务端持久化 + 前端轻量增强”。**
  - 仅靠 localStorage 无法跨设备，也不利于后续 MCP / OpenAPI 扩展。
  - 但“最近打开视图 / 最近批量操作表单记忆”仍可用前端本地态增强。

- **工作项批量操作继续沿用“先校验后执行、整批成功或整批失败”策略。**
  - 避免部分工作项更新成功、部分失败造成列表与流转记录混乱。

- **`@提及` 使用受控富文本节点，而不是解析任意纯文本 `@xxx`。**
  - 这样可以避免用户名歧义、重命名后漂移和渲染不稳定。
  - 存储层仍以 HTML 为主，但由服务端在保存前提取 mention target。

- **讨论草稿恢复优先采用“浏览器本地草稿 + 现有隐藏服务端草稿评论”双轨。**
  - 纯文本输入没必要每次都落服务端草稿。
  - 一旦出现附件上传，仍复用当前隐藏草稿评论链路。

- **待处理提醒第一阶段作为“消息聚合视图”，不是新后台调度系统。**
  - 基于现有通知表、未读状态和工作项状态计算即可，不引入新的后台任务基础设施。

- **资料库结构化采用规范化表，而不把标签 / 关联硬塞进 JSON 字段。**
  - 标签需要过滤、统计和复用。
  - 关联需要保持项目内数据完整性。

- **资料版本历史采用“完整快照表”，首期只读。**
  - 对 SQLite 和服务端渲染最稳。
  - 不引入 diff 算法，也不做编辑合并。

- **周期增强首选新增“周期详情页”，项目详情 tab 保持摘要入口。**
  - 当前项目详情页已经比较重，再继续塞看板与负载会让页面过载。
  - 周期详情页更适合承载负责人视角的推进面板。

## Open Questions

### Resolved During Planning

- 保存视图是否只做前端：否，做服务端持久化。
- 批量操作是否允许部分成功：否，整批校验后整批提交。
- `@提及` 范围：仅当前项目成员。
- 待处理提醒是否引入定时任务：否，第一阶段不引入。
- 资料版本历史是否首期支持回滚：否，第一阶段只读。
- 周期增强是否继续堆在项目详情页：否，优先新增周期详情页。

### Deferred to Implementation

- 视图保存上限已在 Unit 1 实现中落为：**每个项目 / 工作项类型最多 20 个个人视图**。
- `@提及` 输入触发规则（输入 `@` 即弹出，还是空格 / 行首限定）可在实现阶段根据编辑器行为细化。
- 待处理提醒是否同时出现在顶部消息下拉与工作台卡片，执行时可按实际改动量决定先后。
- 周期负载分析中“超负荷”的阈值先做展示统计，不强行在第一阶段给出自动评分。

## High-Level Technical Design

```mermaid
flowchart TB
  A[工作项列表] --> A1[保存筛选视图]
  A --> A2[批量操作工具栏]
  A2 --> A3[批量流转 / 指派 / 调整优先级 / 周期]

  B[工作项讨论区] --> B1[@提及成员]
  B --> B2[本地草稿恢复]
  B --> B3[待处理提醒聚合]
  B1 --> N[通知中心]
  B3 --> N

  C[资料库] --> C1[标签]
  C --> C2[关联工作项 / 周期]
  C --> C3[版本历史]

  D[项目周期] --> D1[周期详情页]
  D1 --> D2[状态看板]
  D1 --> D3[成员负载分析]
```

## Flow Analysis

### 1. 工作项批量操作完整链路

- 列表页筛选出结果
- 用户勾选多个工作项
- 打开批量操作条
- 选择“指派 / 状态 / 优先级 / 周期”
- 服务端先校验：
  - 都属于当前项目
  - 当前用户有写权限
  - 目标状态/周期合法
- 校验通过后统一执行
- 每条工作项仍写入对应流转记录 / 指派记录 / 审计
- 局部刷新列表和统计卡片

### 2. `@提及` 与草稿恢复链路

- 用户在主评论或回复框输入 `@`
- 前端展示项目成员选择面板
- 插入 mention 节点
- 自动本地保存草稿
- 若有附件上传，则沿用现有隐藏草稿评论
- 发表时服务端提取 mention 目标，写通知与消息
- 被提及用户从消息中心点击跳转到对应评论并高亮

### 3. 资料版本历史链路

- 用户新建资料
- 首次正文写入后形成版本 1
- 后续每次编辑资料正文 / 标签 / 关联时生成版本快照
- 资料详情页可查看版本列表
- 打开某个历史版本时按当时快照只读渲染
- 若资料受保护，版本查看同样要求通过保险箱访问校验

### 4. 周期看板与负载链路

- 从项目详情周期 tab 点击进入某个周期详情
- 周期详情页加载：
  - 周期基础信息
  - 状态列看板
  - 成员负载矩阵
  - 快捷筛选入口
- 点击某列 / 某成员，可跳转工作项列表并自动带入周期筛选与状态 / 处理人筛选

## Implementation Units

- [x] **Unit 1: 工作项保存筛选视图的数据底座与入口**

**Goal:** 为需求 / 任务 / Bug 列表新增个人保存视图能力。

**Requirements:** A1-A3

**Dependencies:** 无

**Files:**
- Create: `api/migrations/202607260001_create_work_item_saved_views.sql`
- Modify: `api/src/domains/projects.rs`
- Modify: `api/src/web/router.rs`
- Modify: `api/src/web/user/mod.rs`
- Modify: `api/templates/web/work_items/list.html`
- Test: `api/tests/project_management_flow.rs`

**Approach:**
- 新增 `work_item_saved_views` 表，按 `user_id + project_id + item_type + name` 管理。
- 视图内容保存为结构化过滤字段，而不是任意 URL 原文。
- 支持“保存当前视图”“设为默认”“重命名”“删除”。
- 列表页首次加载时优先读取默认视图，再叠加用户显式 query。

**Patterns to follow:**
- `user_project_preferences` 的用户偏好模式。
- 现有工作项列表 query 解析与模板透传模式。

**Test scenarios:**
- Happy path：用户保存任务列表视图后再次进入可看到该视图。
- Happy path：设置默认视图后同项目同类型列表自动命中默认条件。
- Edge case：同名视图冲突时拒绝创建或要求覆盖。
- Permission path：不能读取或操作其他用户的视图。

**Verification:**
- 列表页、视图 CRUD 和默认视图回填通过集成测试验证。

- [x] **Unit 2: 工作项批量操作链路与列表交互**

**Goal:** 在现有统一工作项表格上增加批量操作能力。

**Requirements:** A4-A6

**Dependencies:** Unit 1

**Files:**
- Modify: `api/src/domains/projects.rs`
- Modify: `api/src/web/router.rs`
- Modify: `api/src/web/user/mod.rs`
- Modify: `api/templates/web/work_items/list.html`
- Modify: `api/templates/web/partials/work_item_table.html`
- Modify: `api/static/app.js`
- Modify: `api/static/app.css`
- Test: `api/tests/project_management_flow.rs`

**Approach:**
- 表格增加勾选列与“已选 N 项”的批量工具条。
- 服务端新增批量更新入口，先整批校验，再事务内批量执行。
- 批量状态变更、指派和周期调整仍调用现有领域校验与流转记录逻辑，不能旁路 SQL 直写。
- 列表操作完成后刷新表格和顶部统计。

**Patterns to follow:**
- `system-user-project-batch-management` 的整批校验策略。
- 当前工作项单条更新 / 指派 / 状态变更的领域函数。

**Test scenarios:**
- Happy path：批量指派 3 条任务给同一处理人成功。
- Happy path：批量变更周期成功，流转记录完整。
- Error path：任一工作项不属于当前项目时整批失败。
- Error path：目标状态对当前类型非法时整批失败。
- Visual：批量条在有选中项时出现，无选中时隐藏。

**Verification:**
- 批量接口、记录写入和列表刷新通过集成测试与 `node --check api/static/app.js` 验证。

- [x] **Unit 3: 讨论区 `@提及` 模型、通知与跳转**

**Goal:** 为讨论区和回复区增加项目成员 `@提及` 能力。

**Requirements:** B1-B2

**Dependencies:** 无

**Files:**
- Modify: `api/src/domains/projects.rs`
- Modify: `api/src/domains/notifications.rs`
- Modify: `api/src/web/api/mod.rs`
- Modify: `api/src/web/user/mod.rs`
- Modify: `api/templates/web/partials/work_item_detail.html`
- Modify: `api/static/app.js`
- Test: `api/tests/project_management_flow.rs`

**Approach:**
- 前端在富文本编辑器内增加 mention 选择面板。
- 服务端保存评论 HTML 时解析 mention 节点并提取被提及用户列表。
- 为 mention 生成新的通知类型，并复用现有消息跳转逻辑。
- 跳转到对应评论时继续使用现有滚动 + 高亮容器模式。

**Patterns to follow:**
- 现有回复通知、指派通知、消息中心打开链路。
- 讨论区富文本受控 HTML 与附件节点处理方式。

**Test scenarios:**
- Happy path：评论提及项目成员，成员收到未读消息。
- Happy path：点击消息跳到对应评论并高亮。
- Edge case：提及自己不重复创建消息。
- Permission path：不能提及非当前项目成员。

**Verification:**
- 评论保存、通知写入和消息跳转通过集成测试验证。

- [x] **Unit 4: 讨论草稿自动保存与恢复**

**Goal:** 让主评论框和回复框支持刷新恢复，不破坏现有即时上传链路。

**Requirements:** B3-B4

**Dependencies:** Unit 3

**Files:**
- Modify: `api/static/app.js`
- Modify: `api/templates/web/partials/work_item_detail.html`
- Test: `scripts/test-discussion-js.mjs`
- Test: `api/tests/project_management_flow.rs`

**Approach:**
- 使用浏览器本地存储按 `item_key + parent_comment_id + current_user` 保存草稿。
- 附件上传场景继续复用现有隐藏草稿评论，只在本地额外记录 draft id 和未发正文。
- 页面首次加载和讨论区 SSE 刷新后，尽量恢复用户尚未发表的内容。
- 发表成功后自动清理草稿。

**Patterns to follow:**
- 顶部搜索历史 / 数据库统计缓存的 localStorage 使用模式。
- 现有讨论区隐藏草稿评论与上传状态管理。

**Test scenarios:**
- Happy path：纯文本输入刷新后恢复。
- Happy path：带附件草稿刷新后恢复正文和上传后的附件节点。
- Error path：草稿损坏或结构版本不匹配时安全丢弃，不影响页面加载。
- Regression：SSE 刷新讨论列表时不覆盖正在输入的草稿。

**Verification:**
- JS 测试与讨论流程集成测试通过。

- [ ] **Unit 5: 待处理讨论提醒聚合**

**Goal:** 在消息中心 / 工作台中给出“待我处理”的讨论提醒视图。

**Requirements:** B5-B6

**Dependencies:** Unit 3

**Files:**
- Modify: `api/src/domains/notifications.rs`
- Modify: `api/src/web/user/mod.rs`
- Modify: `api/templates/web/messages.html`
- Modify: `api/templates/web/dashboard.html`
- Test: `api/tests/project_management_flow.rs`

**Approach:**
- 基于未读 mention / reply / assign 通知，聚合“待我处理讨论”列表。
- 优先提供“全部 / 未读 / 待处理”切换，而不是引入新的调度模型。
- 工作台增加简洁卡片或列表块，展示需要优先回应的讨论。

**Patterns to follow:**
- 当前消息中心 tab 与未读计数模式。
- 顶部消息角标与工作台统计卡片模式。

**Test scenarios:**
- Happy path：被提及后消息中心“待处理”中可见。
- Happy path：标记已读后从“待处理”移除。
- Regression：普通系统消息不会混入“待处理讨论”视图。

**Verification:**
- 消息过滤逻辑和页面渲染通过集成测试验证。

- [ ] **Unit 6: 资料标签与可选关联的数据模型**

**Goal:** 为资料库增加标签体系和与工作项 / 周期的可选关联。

**Requirements:** C1-C3

**Dependencies:** 无

**Files:**
- Create: `api/migrations/202607260002_create_project_resource_tags_and_relations.sql`
- Modify: `api/src/domains/project_resources.rs`
- Modify: `api/src/web/user/mod.rs`
- Modify: `api/src/web/api/mod.rs`
- Modify: `api/templates/web/projects/detail.html`
- Modify: `api/templates/web/projects/resource_detail.html`
- Test: `api/tests/project_management_flow.rs`

**Approach:**
- 新增项目级标签表与资料-标签关联表。
- 新增资料-工作项 / 周期资料关联表，限制关联对象必须属于同项目。
- 列表和详情页展示标签、关联对象摘要与筛选入口。
- 新建 / 编辑资料 modal 增加标签多选与关联选择。

**Patterns to follow:**
- 项目成员与周期下拉的 searchable select 模式。
- 资料库现有分类 / 状态筛选和资源详情页渲染模式。

**Test scenarios:**
- Happy path：创建资料时设置多个标签并关联一个任务。
- Happy path：按标签筛选可命中资料。
- Error path：不能关联其他项目的工作项或周期。
- Regression：受保护资料未解锁前不暴露敏感正文，但可以保留安全元信息展示边界。

**Verification:**
- 标签、关联与筛选链路通过集成测试验证。

- [ ] **Unit 7: 资料版本历史与只读快照查看**

**Goal:** 为资料编辑行为保留版本历史，并可查看历史快照。

**Requirements:** C4-C6

**Dependencies:** Unit 6

**Files:**
- Create: `api/migrations/202607260003_create_project_resource_versions.sql`
- Modify: `api/src/domains/project_resources.rs`
- Modify: `api/src/web/router.rs`
- Modify: `api/src/web/user/mod.rs`
- Modify: `api/templates/web/projects/resource_detail.html`
- Test: `api/tests/project_management_flow.rs`

**Approach:**
- 创建资料和每次编辑资料时都写入版本快照。
- 快照记录标题、分类、正文、正文格式、标签、关联、编辑人和时间。
- 资料详情页增加版本历史入口和历史快照只读查看。
- 受保护资料查看历史版本仍需要通过现有访问控制。

**Patterns to follow:**
- 系统版本管理中的列表 + 详情模式。
- 资料详情页现有受保护访问、上一个 / 下一个资料导航与富文本渲染模式。

**Test scenarios:**
- Happy path：编辑资料两次后产生 3 个版本快照。
- Happy path：查看历史版本时能渲染当时正文。
- Permission path：未解锁受保护资料时不能查看版本正文。
- Regression：普通资料详情更新逻辑不受影响。

**Verification:**
- 版本写入、版本列表和历史详情通过集成测试验证。

- [ ] **Unit 8: 周期详情页与推进总览**

**Goal:** 在现有周期 tab 摘要基础上新增周期详情页，承载更强的推进分析能力。

**Requirements:** D1-D2

**Dependencies:** 无

**Files:**
- Modify: `api/src/web/router.rs`
- Modify: `api/src/web/user/mod.rs`
- Create: `api/templates/web/projects/cycle_detail.html`
- Modify: `api/templates/web/projects/detail.html`
- Test: `api/tests/project_management_flow.rs`

**Approach:**
- 项目详情中的周期列表 / 路线图卡片增加“查看周期详情”入口。
- 新增周期详情页，展示周期元信息、统计卡片、快捷跳转与后续看板区。
- 保持项目详情页作为摘要入口，不继续堆积复杂内容。

**Patterns to follow:**
- 资料详情页与工作项详情页的“摘要页 + 深入详情页”模式。
- 现有项目详情中的 tab 与详情卡片风格。

**Test scenarios:**
- Happy path：从项目详情进入周期详情页成功。
- Happy path：周期详情展示基础统计与时间状态。
- Permission path：无项目访问权限用户不能直接打开周期详情。

**Verification:**
- 新路由和周期详情渲染通过集成测试验证。

- [ ] **Unit 9: 周期状态看板与成员负载分析**

**Goal:** 在周期详情页提供负责人真正关心的推进可视化。

**Requirements:** D3-D5

**Dependencies:** Unit 8

**Files:**
- Modify: `api/src/domains/projects.rs`
- Modify: `api/src/web/user/mod.rs`
- Modify: `api/templates/web/projects/cycle_detail.html`
- Modify: `api/static/app.css`
- Test: `api/tests/project_management_flow.rs`

**Approach:**
- 周期详情页增加：
  - 按状态分列的工作项看板
  - 按成员聚合的负载表
  - 快捷筛选链接（例如：查看该周期待处理 Bug）
- 负载至少统计：
  - 待处理数
  - 进行中数
  - 待确认数
  - 高优先级数
  - 逾期数
  - 未指派数
- 看板和成员负载的点击动作统一跳回现有工作项列表，并自动携带筛选条件。

**Patterns to follow:**
- 当前工作项列表 query 过滤与分页模式。
- 项目个人分析页的统计表达方式。

**Test scenarios:**
- Happy path：周期详情看板按状态正确分组工作项。
- Happy path：点击成员负载行可跳到带周期 + 处理人筛选的工作项列表。
- Edge case：无工作项周期仍渲染空看板与空负载状态。
- Regression：现有项目周期 tab 摘要统计保持一致。

**Verification:**
- 统计准确性、跳转筛选与渲染通过集成测试验证。

## Sequencing

建议执行顺序：

1. Unit 1-2：先把工作项列表从“能看”提升到“能批量处理”
2. Unit 3-5：再补讨论区协作闭环
3. Unit 6-7：随后提升资料库结构化沉淀能力
4. Unit 8-9：最后升级周期视图为负责人工作台

原因：

- 工作项批量操作对当前效率提升最直接，回报最高
- 讨论区增强会触达通知、富文本与实时能力，适合单独一段收口
- 资料库标签 / 版本历史属于沉淀层增强，优先级略低于高频处理链路
- 周期详情页和负载分析更偏管理视角，适合作为本轮压轴

## System-Wide Impact

- **Shared backend surface:** `api/src/domains/projects.rs`、`api/src/web/user/mod.rs`、`api/static/app.js` 会继续成为高频修改点，执行时要注意拆小闭环，避免一次混入全部改动。
- **Notification consistency:** `@提及`、待处理提醒、批量指派都会影响消息中心口径，需要统一消息分类语义。
- **Audit / flow integrity:** 批量操作不能跳过现有操作记录；资料版本历史不能和保险箱访问控制分裂。
- **UI consistency:** 新增的保存视图区、批量条、tag、版本面板、周期详情页都应复用当前扁平化样式系统与统一弹窗/表格组件风格。

## Risks & Dependencies

- **工作项批量操作风险：** 若复用领域逻辑不完整，容易出现单条操作有记录、批量操作无记录的不一致。
  - **Mitigation:** 批量入口只做聚合调度，不单独发明状态变更旁路。

- **讨论草稿恢复风险：** 本地草稿和服务端隐藏草稿评论可能状态漂移。
  - **Mitigation:** 本地草稿保存结构增加版本号与 draft id；恢复失败时安全降级。

- **mention 富文本风险：** 若允许任意 HTML 形式的 mention，后续用户名变化和 XSS 风险都会放大。
  - **Mitigation:** 使用受控节点结构与服务端白名单提取。

- **资料版本膨胀风险：** 频繁编辑会快速增加 SQLite 体积。
  - **Mitigation:** 第一阶段先接受快照增长，但要预留后续归档/压缩策略。

- **周期详情复杂度风险：** 若继续把复杂分析放在项目详情 tab 内，会让页面过重、切换与回退体验变差。
  - **Mitigation:** 单独周期详情页承载深度分析，项目详情只保留入口与摘要。
