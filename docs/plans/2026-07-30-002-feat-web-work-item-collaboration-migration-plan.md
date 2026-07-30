---
title: feat: Web 工作项协作闭环迁移
type: feat
status: active
date: 2026-07-30
origin: docs/plans/2026-07-28-feat-web-desktop-shared-frontend-plan.md
---

# feat: Web 工作项协作闭环迁移

## 概述

本计划承接 Web 与 Desktop 共享前端主线的 W3 阶段，把新 `web/` 应用里的工作项详情从“只读详情 + 评论浏览”推进到首个完整读写业务闭环：用户可以在浏览器应用壳内编辑工作项、推进并指派、发布和编辑评论，并逐步接入工作项与评论附件的列表、下载和上传入口。

该闭环完成并通过 Browser E2E 后，才具备进入 W4 共享 JavaScript 层提炼的业务 feature 基线。当前不提前抽 `frontend/packages/*`，也不把 Desktop renderer 或离线能力纳入本切片。

## 问题框架

`web/src/app.jsx` 目前已经覆盖应用壳、消息中心、项目列表、工作项列表和只读工作项详情，但工作项详情仍把写操作留给旧版 Askama 页面。主线计划要求 W4 必须等待一个完整业务 feature 的读写闭环通过浏览器验证；因此 W3 下一步应优先补齐工作项协作写入能力，而不是继续扩展应用壳或提前做共享包抽象。

本轮代码事实显示，后端 REST 契约大部分已经存在：`PATCH /api/v1/work-items/{item_key}`、`POST /api/v1/work-items/{item_key}/handoff`、评论创建/编辑/草稿/发布，以及工作项附件和评论附件的登记、签名上传、上传完成、下载 URL 等路由已经在 `api/src/web/router.rs` 注册，并在 `api/src/web/api/mod.rs` 实现。前端应优先消费这些既有契约，避免重复建设后端。

## 需求追踪

- R1. 新 Web 工作项详情支持编辑核心字段：标题、描述、状态、优先级、处理人用户名、截止日期。
- R2. 新 Web 工作项详情支持推进并指派，提交后刷新详情、评论/流转记录、顶部状态和可见反馈。
- R3. 新 Web 工作项详情支持新增普通评论，并允许评论作者编辑非流转评论；权限失败由服务端错误模型返回并在页面可见。
- R4. 新 Web 工作项详情展示工作项附件与评论附件，并提供受鉴权下载入口。
- R5. 新 Web 工作项详情提供附件上传入口，复用既有“登记附件 -> 获取签名上传请求 -> 直传对象存储 -> 标记 uploaded -> 刷新列表”的服务端契约。
- R6. 写请求继续使用 `web/src/lib/api.js` 的 Cookie session + CSRF transport，不读取 HTML、不解析 Askama 模板、不拼接旧 `/web/*` 业务 URL 作为协议。
- R7. 所有新增浏览器交互具备加载、busy、成功、失败和刷新后的焦点/状态提示，不因失败丢失用户已输入内容。
- R8. 新增或变更行为必须有对应 JS / Browser E2E 覆盖；后端只在发现契约缺口时补充测试，不重做已覆盖流程。
- R9. 完成本切片后同步更新主线计划的 W3 状态和下一步判断；只有完整读写闭环通过后才评估 W4。

## 范围边界

- 本计划只覆盖 `web/` 新应用壳内的工作项详情协作闭环。
- 不迁移工作项创建 modal、列表保存筛选、批量操作或旧 Askama 的全部工作项页面。
- 不迁移资料库、项目详情、成员、周期或文档预览宿主。
- 不实现富文本编辑器、正文内图片节点、拖拽粘贴上传或图库预览；这些继续归属既有富文本/附件专项计划。
- 不启动 `frontend/packages/*`、Desktop renderer、`app://` 认证、device-session、凭证库、原生通知、离线缓存或双向同步。
- 不改变后端权限、审计、工作项状态流转和对象存储签名规则；前端仅展示服务端结果和错误。

## Context & Research

### Relevant Code and Patterns

- `web/src/lib/api.js`：已有 `fetchJson`、CSRF 刷新、登录回跳、通知、项目、工作项列表和只读详情 API client，是新增写操作 client 的直接模式。
- `web/src/app.jsx`：已有 route 加载、顶部状态刷新、消息中心操作、项目当前切换、工作项列表筛选分页和只读工作项详情渲染，应继续沿用单页状态模型和 `statusMessage` 反馈。
- `web/e2e/app-shell.spec.mjs`：已有登录、当前项目切换、工作项列表过滤和打开只读详情的 Browser E2E，可扩展为工作项读写闭环验收。
- `web/test/routes.test.mjs`、`web/test/notification-target.test.mjs`：现有 Node test 组织方式，可新增 API client 级测试以覆盖 URL、method、CSRF 和 payload 序列化。
- `api/src/web/router.rs`、`api/src/web/api/mod.rs`：已有工作项更新、handoff、评论和附件 REST handler。
- `api/tests/project_management_flow.rs`：已有工作项更新、handoff、评论创建/编辑、附件登记/上传/下载权限等后端集成覆盖，前端计划只补缺口。
- `docs/plans/2026-07-13-001-feat-rich-text-discussion-plan.md`、`docs/plans/2026-07-10-001-feat-file-upload-image-preview-plan.md`：富文本和高级附件体验的边界来源；本计划只做 W3 迁移所需的朴素入口。

### Institutional Learnings

- `docs/solutions/2026-07-30-apk-oss-download-boundary.md` 强调下载能力应走受控 API 边界，不向客户端暴露长期对象存储细节。本计划的附件下载只使用已有 `download-url` 契约并避免持久化预签名 URL。

### External References

- 未使用外部研究。当前工作依赖仓库内既有 React/Vite、REST、CSRF、对象存储签名和 E2E 模式，代码库已有足够直接模式。

## 关键技术决策

- **先消费既有 REST 契约，不先补后端。** 当前路由和 handler 已覆盖工作项更新、handoff、评论和附件主流程；先从前端 API client 与 UI 接入开始，只有发现缺口再补 OpenAPI 或后端测试。
- **先保留 `web/src/**` 内聚，不提前提取共享包。** W4 的门槛是至少一个完整业务 feature 通过浏览器验证；在此之前抽象共享层会固化未验证边界。
- **评论首轮使用朴素文本输入。** 既有富文本计划范围更大，包含正文内附件、粘贴/拖拽和格式验证；本切片只保证评论发布/编辑业务闭环，避免把 W3 迁移阻塞在富文本专项上。
- **附件分两层交付。** 先完成列表与下载，使详情页能呈现已有附件；再接登记、签名上传和 uploaded 回写。这样即使上传体验需要后续打磨，读写闭环仍可分阶段验证。
- **前端不复制权限和状态规则。** UI 可做空标题、空评论、文件大小为正数等输入提示，但最终权限、归档项目、关闭工作项、作者编辑限制、对象存储状态均以服务端响应为准。

## Open Questions

### Resolved During Planning

- **是否需要先新增后端 API？** 不需要。当前运行路由已提供 W3 首轮所需契约，优先前端接入。
- **是否现在启动 W4 共享包？** 不启动。当前只有只读详情，必须等本计划形成完整读写闭环后再评估。
- **是否把富文本和正文内上传纳入本计划？** 不纳入。富文本专项已有独立计划，本计划只迁移朴素评论和附件入口。

### Deferred to Implementation

- **附件上传是否需要首轮实现进度百分比？** 延后到上传 UI 实作时根据 `fetch`/XHR 选择决定；首轮可先提供明确 busy/成功/失败状态，不伪造不可计算百分比。
- **评论附件是否跟随草稿流发布，还是先绑定已发布评论？** 实作时以最小可验证路径为准；若先做已发布评论附件，需在计划回填后续草稿/发布增强。
- **工作项编辑表单是否拆组件？** 根据 `web/src/app.jsx` 实际复杂度决定；若单文件继续膨胀明显，再提取 `web/src/components/*`。

## 实施单元

- [x] **Unit 1: 前端 API client 与状态模型补齐**

**Goal:** 在 `web/src/lib/api.js` 中补齐工作项更新、handoff、评论创建/编辑、附件列表/登记/签名/完成/下载的 client 方法和 JSDoc DTO，为 UI 接入提供稳定边界。

**Requirements:** R1, R2, R3, R4, R5, R6, R8

**Dependencies:** 已有后端 REST handler 和 `fetchJson`。

**Files:**
- Modify: `web/src/lib/api.js`
- Create: `web/test/api.test.mjs`
- Test: `web/test/api.test.mjs`

**Approach:**
- 继续复用 `refreshCsrfToken()` + `fetchJson()`；所有非 GET/HEAD 写请求先刷新 CSRF，再提交 JSON。
- 路径统一使用 `encodeURIComponent(itemKey)`、`commentId`、`attachmentId`，避免 UI 层散落 REST URL 拼接。
- 附件下载 client 只返回短期签名请求 payload，不把签名 URL 写入长期状态。

**Execution note:** API client 方法建议 test-first，先用 mock `fetch` 锁定 method、path、CSRF 和 payload 形状，再实现。

**Patterns to follow:**
- `web/src/lib/api.js::updateCurrentProject`
- `web/src/lib/api.js::markNotificationRead`
- `web/test/routes.test.mjs`

**Test scenarios:**
- Happy path：调用工作项更新 client，先请求 `/api/v1/auth/csrf`，再以 `PATCH /api/v1/work-items/YCE-TASK-2` 提交 JSON payload，并返回详情 data。
- Happy path：调用 handoff client，以 `POST /api/v1/work-items/YCE-TASK-2/handoff` 提交 `status`、`assignee_username`、`body`。
- Happy path：调用评论创建/编辑 client，分别命中 `POST /comments` 与 `PATCH /comments/{comment_id}`，默认携带明确 `body_format`。
- Happy path：调用附件列表和下载 URL client，GET 请求不刷新 CSRF，返回附件数组或签名请求 payload。
- Error path：写请求首轮 CSRF 失败时沿用 `fetchJson` 的刷新重试行为，不在新 client 内重复实现错误处理。

**Verification:**
- `web/test/api.test.mjs` 覆盖新增 client 的 URL、method、headers 和 body。
- `npm --prefix web run test` 通过。

- [x] **Unit 2: 工作项详情编辑与推进并指派表单**

**Goal:** 在工作项详情页内接入核心字段编辑和 handoff 表单，提交成功后刷新详情、评论/流转记录和顶部状态，并显示明确成功/失败反馈。

**Requirements:** R1, R2, R6, R7, R8

**Dependencies:** Unit 1。

**Files:**
- Modify: `web/src/app.jsx`
- Modify: `web/src/app.css`
- Modify: `web/e2e/app-shell.spec.mjs`
- Test: `web/e2e/app-shell.spec.mjs`

**Approach:**
- 以当前只读详情状态初始化受控表单；路由或详情 key 变化时重置表单，避免跨工作项残留输入。
- 编辑表单只负责核心字段和基础空值提示；状态、权限、归档/关闭约束交给服务端。
- handoff 成功后刷新 `getWorkItem`、`getWorkItemComments`、`getTopbarStatus`，让流转记录和角标与服务端事实一致。
- 提交失败保留用户输入，并通过现有错误区域或局部提示展示服务端错误。

**Patterns to follow:**
- `web/src/app.jsx::handleProjectSelect`
- `web/src/app.jsx::handleMarkAllRead`
- 现有 `.shell-card`、`.shell-actions-inline`、`.shell-empty` 样式模式

**Test scenarios:**
- Happy path：在 `/web/app/work-items/YCE-TASK-2` 修改优先级或描述并保存，页面显示成功提示，详情区域展示新值。
- Happy path：提交推进并指派，页面显示成功提示，评论与流转列表数量或最新流转记录更新。
- Edge case：标题为空时前端阻止提交并保留输入，不发起工作项更新请求。
- Error path：服务端返回 403/400 时，页面展示错误且表单内容不丢失。
- Integration：保存/推进后顶部状态刷新，导航角标不依赖旧 Askama 页面。

**Verification:**
- Browser E2E 能在新 Web 壳完成编辑和 handoff，不跳转旧版详情。
- `npm --prefix web run check` 通过。

- [x] **Unit 3: 评论新增与编辑闭环**

**Goal:** 在新工作项详情页内支持发布普通评论和编辑非流转评论，提交后刷新评论列表并保留锚点/焦点语义。

**Requirements:** R3, R6, R7, R8

**Dependencies:** Unit 1。

**Files:**
- Modify: `web/src/app.jsx`
- Modify: `web/src/app.css`
- Modify: `web/e2e/app-shell.spec.mjs`
- Test: `web/e2e/app-shell.spec.mjs`

**Approach:**
- 首轮评论正文使用 plain text textarea，`body_format` 明确传递后端支持的 `plain`；不处理内联附件节点。
- 评论编辑入口只展示在非流转、非草稿评论上；服务端仍是最终作者/管理员权限裁决者。
- 新增或编辑成功后刷新评论列表；失败时保留草稿输入并显示错误。

**Patterns to follow:**
- 现有工作项评论列表渲染
- `api/src/web/api/mod.rs::create_work_item_comment`
- `api/src/web/api/mod.rs::update_work_item_comment`

**Test scenarios:**
- Happy path：发布一条普通评论后，评论列表出现新正文和当前用户作者信息。
- Happy path：编辑刚发布的评论后，评论列表展示新正文和更新后的时间字段。
- Edge case：空白评论不能提交，输入框保留焦点并展示提示。
- Error path：编辑无权限评论返回错误时，列表保持原正文。
- Integration：从消息中心打开带 `#comment-{id}` 的详情后，新增评论不破坏锚点路由解析。

**Verification:**
- Browser E2E 覆盖新增与编辑评论。
- 新评论/编辑评论不依赖旧 `/web/messages/{id}/open` 或旧详情 HTML。

- [x] **Unit 4: 附件列表、下载与上传入口**

**Goal:** 在工作项详情页展示工作项附件和评论附件，支持下载已上传附件，并提供最小可用上传入口。

**Requirements:** R4, R5, R6, R7, R8

**Dependencies:** Unit 1；Unit 3 若首轮实现评论附件上传绑定已发布评论。

**Files:**
- Modify: `web/src/app.jsx`
- Modify: `web/src/app.css`
- Modify: `web/e2e/app-shell.spec.mjs`
- Test: `web/e2e/app-shell.spec.mjs`

**Approach:**
- 详情加载时并行读取工作项附件；评论附件可按评论逐条懒加载或在评论渲染后批量加载，具体由实现复杂度决定。
- 下载按钮调用 `download-url` client 后按返回签名请求打开/下载，不缓存预签名 URL。
- 上传走现有四段式契约：登记附件、获取 upload-url、执行签名请求、mark uploaded、刷新附件列表。
- pending/failed 状态以行式文件卡提示，不做图片缩略图、拖拽粘贴或正文内占位。

**Patterns to follow:**
- `api/static/app.js` 既有附件上传/下载流程中的用户反馈语义
- `api/tests/project_management_flow.rs` 的 API 附件流程覆盖
- `docs/plans/2026-07-10-001-feat-file-upload-image-preview-plan.md` 的“不要伪造进度”和“pending 可重试”原则

**Test scenarios:**
- Happy path：已有工作项附件在详情页展示文件名、大小、状态和下载按钮。
- Happy path：点击已上传附件下载时，请求 `download-url` 并触发受控下载入口。
- Happy path：选择文件上传后，附件列表刷新并展示 uploaded 状态。
- Edge case：pending 附件展示状态但不暴露不可用下载动作。
- Error path：对象存储上传或 mark uploaded 失败时，页面展示可重试/失败状态，不清空已选择文件说明。
- Integration：评论附件展示在对应评论下，不与其他工作项或评论附件串项。

**Verification:**
- Browser E2E 至少覆盖附件列表和下载入口；上传若环境具备测试存储，则覆盖完整四段式流程。
- 附件流程不把签名 URL 写入 localStorage 或持久 DOM 状态。

- [ ] **Unit 5: 收口验证、状态回填与 W4 门槛复核**

**Goal:** 完成本切片的质量检查、计划状态回填和 W4 是否可启动的证据复核。

**Requirements:** R8, R9

**Dependencies:** Unit 2、Unit 3、Unit 4 的首批闭环完成。

**Files:**
- Modify: `docs/plans/2026-07-30-002-feat-web-work-item-collaboration-migration-plan.md`
- Modify: `docs/plans/2026-07-28-feat-web-desktop-shared-frontend-plan.md`
- Test: `web/e2e/app-shell.spec.mjs`

**Approach:**
- 对照本计划逐项标记已完成单元和剩余后续，不把未做附件高级体验伪装成完成。
- 主线计划只更新索引、阶段状态和下一步判断，不合并本子计划正文。
- 若工作项详情已形成可复现读写闭环，则在主线 W4 门槛处记录“可开始评估共享包提炼”；否则保留 W3 active。

**Patterns to follow:**
- `docs/plans/2026-07-28-feat-web-desktop-shared-frontend-plan.md` 的“计划索引与当前切片”。
- `docs/plans/2026-07-30-web-first-w0-inventory-and-contract-parity.md` 的执行产物归属说明。

**Test scenarios:**
- Test expectation: none -- 文档状态回填本身不改变运行行为；运行验证由前序单元覆盖。

**Verification:**
- `npm --prefix web run check` 和相关 Browser E2E 通过或记录明确环境限制。
- 主线计划的 W3/W4 状态与实际功能证据一致。

## 系统级影响

- **Interaction graph:** 新增交互都从 `web/src/app.jsx` 发起，经 `web/src/lib/api.js` 进入 `/api/v1/work-items/*`；服务端继续触发领域服务、审计、通知和实时广播。
- **Error propagation:** `ApiError` 继续作为前端统一错误模型；局部表单失败不应覆盖全页加载状态，也不应清空用户输入。
- **State lifecycle risks:** 工作项详情、评论、附件和顶部状态需要在写入后重新同步；避免只乐观更新一部分导致页面与服务端事实分裂。
- **API surface parity:** 旧 Askama 页面继续可用；新 Web 不能破坏已有 HTML handler、OpenAPI 契约或 PAT/Bearer 兼容路径。
- **Integration coverage:** 至少通过 Browser E2E 覆盖“登录 -> 打开详情 -> 写入 -> 页面刷新验证”的真实链路。
- **Unchanged invariants:** 服务端权限、CSRF、项目归档/工作项关闭写入限制、对象存储签名、审计和通知规则保持不变。

## 风险与依赖

| Risk | Mitigation |
|------|------------|
| 前端重复实现服务端权限或状态流转规则 | 前端只做基础输入提示，最终以服务端响应为准；错误展示保留原输入。 |
| `web/src/app.jsx` 继续膨胀导致维护困难 | 先按最小闭环实现；当表单和附件逻辑明显复杂时再提取组件，避免提前抽共享包。 |
| 附件上传环境在 E2E 中不稳定 | 先覆盖附件列表和下载入口；上传完整链路在测试存储可用时纳入 E2E，否则保留 API client/单元测试和手工验证证据。 |
| 写入后局部状态不同步 | 写入成功后重新拉取详情、评论、附件和顶部状态，优先服务端事实。 |
| 提前启动 W4 导致抽象不稳定 | Unit 5 明确以完整读写闭环和 E2E 证据作为 W4 评估门槛。 |

## 文档与运维说明

- 本计划完成后需要同步主线计划的 W3/W4 状态。
- 不新增生产拓扑、环境变量、数据库迁移或部署脚本。
- Post-deploy 可观测重点：`/api/v1/work-items/*` 写请求 4xx/5xx、CSRF retry、对象存储签名失败、浏览器壳错误率和附件上传失败率。

## Sources & References

- Origin: `docs/plans/2026-07-28-feat-web-desktop-shared-frontend-plan.md`
- W0 baseline: `docs/plans/2026-07-30-web-first-w0-inventory-and-contract-parity.md`
- Web app shell: `web/src/app.jsx`
- Web API client: `web/src/lib/api.js`
- Web E2E: `web/e2e/app-shell.spec.mjs`
- Backend routes: `api/src/web/router.rs`
- Backend API handlers: `api/src/web/api/mod.rs`
- Backend integration tests: `api/tests/project_management_flow.rs`
- Related rich text plan: `docs/plans/2026-07-13-001-feat-rich-text-discussion-plan.md`
- Related attachment plan: `docs/plans/2026-07-10-001-feat-file-upload-image-preview-plan.md`
