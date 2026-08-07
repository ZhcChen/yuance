---
title: "refactor: Web 与 Desktop 视觉和逻辑交互完全一致"
type: refactor
date: 2026-08-07
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
origin:
  - docs/plans/2026-07-28-feat-web-desktop-shared-frontend-plan.md
  - docs/plans/2026-07-31-001-refactor-w4-shared-javascript-layer-plan.md
  - docs/plans/2026-08-03-001-feat-d2-desktop-feature-parity-plan.md
execution: code
execution_status: planned
---

# Web 与 Desktop 视觉和逻辑交互完全一致

## Goal Capsule

- **目标：** 以当前正式 `/web/*` 的用户能力、视觉层级和交互语义为基准，把普通业务页与有权限用户可见的系统管理页迁移到唯一的 React `SharedApp` 实现，使 Browser 与 Desktop 在相同身份、权限、项目和数据状态下呈现相同页面、执行相同操作并得到相同结果。
- **核心判断：** 当前正式 Web 仍由 Askama 模板、`api/static/app.css` 和 `api/static/app.js` 驱动；`/web/app` 与 Desktop 虽共享 `SharedApp`，但只覆盖正式 Web 的子集，功能对齐不等于体验完全一致。
- **执行方式：** 先建立可执行差异清单和行为特征测试，再按“基础体系 -> 导航与项目 -> 工作项 -> 协作与实时 -> 系统管理 -> Web 切换与旧实现退役”推进。每个单元必须同时在 Browser 与 Desktop 验证，不接受只修一个宿主。
- **宿主差异：** Browser 保留 Cookie/CSRF、History、DOM 下载和浏览器登录；Desktop 保留 device session、受限 IPC、原生文件能力、系统通知和窗口生命周期。宿主差异只能位于 adapter，不得改变用户可见业务规则。
- **完成标准：** 共享能力只有一个组件、一个状态模型、一个交互实现和一套样式；Browser/Desktop 差异测试仅允许预先登记的宿主能力差异；正式 `/web/*` 默认进入共享实现，旧业务模板和对应重复 JS/CSS 可安全删除。

## Problem Frame

当前仓库存在两套可见体验：

1. 正式 `/web/*` 使用 `api/templates/web/`、`api/static/app.css` 和 `api/static/app.js`，样式约 11,000 行，页面和交互完整。
2. `/web/app` 与 Desktop 使用 `frontend/packages/app-shell/`、`frontend/packages/ui/`，共享样式约 1,000 行，只覆盖首页、项目列表、基础工作项、评论附件和消息等子集。

两套实现造成同一业务在排版、导航、筛选、表单、权限入口、错误状态和操作反馈上不同，也使每次修改需要分别维护。继续把正式 Web CSS 复制到 Desktop 不能解决 DOM、状态机和事件顺序差异；远程嵌入 `/web` 又会破坏 Desktop 安全宿主、离线边界和文件能力。因此必须把正式 Web 行为迁移到共享 React 层，并让两个宿主共同消费。

## Product Contract

### Requirements

#### 唯一实现与一致性边界

- R1. Browser 与 Desktop 的共享页面必须来自同一个 React 组件树、状态模型和样式源；禁止为宿主复制页面组件或维护平行 CSS。
- R2. 相同身份、权限、当前项目、URL/route 和后端数据必须产生相同的信息层级、字段、操作入口、默认值、排序、分页、筛选和反馈状态。
- R3. 宿主 adapter 只负责认证、导航承载、网络传输、文件能力、通知和生命周期；业务校验、权限可见性、请求编排与 UI 状态不得在 adapter 中分叉。
- R4. 正式 `/web/*` 是迁移期行为基准，但不是要求逐字复制历史实现缺陷。修正已确认缺陷时必须同时更新行为契约、Browser 与 Desktop，并记录差异理由。

#### 视觉与布局一致

- R5. 建立共享 design token，覆盖颜色、字体、字号、间距、边框、圆角、阴影、控件高度、状态色、响应式断点和 motion；`web/src/app.css` 与 `desktop/src/renderer/app.css` 只允许宿主 reset，不得定义业务视觉。
- R6. 顶部导航、项目切换、搜索、消息、账户菜单、页面标题、指标区、筛选区、列表/表格、详情、讨论、附件、弹窗、空状态和错误状态必须使用共享组件。
- R7. Desktop 窗口和 Browser 视口在相同有效宽度下使用相同响应式规则；文字不得溢出、遮挡或因宿主不同改变控件尺寸。
- R8. 浅色/暗色、focus、hover、active、disabled、loading、validation、success、warning、danger 状态在两个宿主一致；仅 OS 原生文件对话框和系统通知遵循平台外观。

#### 路由、导航与上下文

- R9. 共享路由覆盖首页、项目、需求、任务、Bug、工作项详情、消息、搜索、个人页、项目详情、周期、资源和个人分析，并保持正式 Web 的 query、fragment、返回路径和深链接语义。
- R10. 顶部计数、当前项目、项目切换、搜索和通知跳转必须在 Browser/Desktop 使用相同状态源和刷新顺序；切换项目后所有项目范围数据必须一致失效并重新加载。
- R11. Browser 使用 History URL；Desktop 使用内部 app route。两者必须由同一 route model 构建和解析，不允许页面组件拼接宿主 URL。
- R12. 未登录、无当前项目、无权限、资源不存在、数据已删除和 session 失效必须进入相同语义状态；宿主只决定如何重新认证。

#### 工作项与协作

- R13. 需求、任务、Bug 列表必须对齐指标、组合筛选、保存视图、默认视图、分页、每页数量、批量选择和批量动作。
- R14. 创建、编辑、指派、状态流转、优先级、周期、父子关系、截止日期和关闭/重开等动作必须共享表单 schema、前端校验、权限判断、提交锁和错误映射。
- R15. 工作项详情必须对齐元数据、前后项导航、流转历史、富文本、代码块、提及、评论编辑/回复、附件上传下载预览和讨论实时状态。
- R16. Browser 与 Desktop 的重复点击、并发刷新、慢请求、提交中断和 SSE 重连必须产生一致状态，禁止一个宿主乐观更新而另一个宿主全量刷新。

#### 项目与系统管理

- R17. 项目创建/编辑、项目详情、成员与角色、周期、资料资源、资源版本/标签、个人分析等普通业务能力必须按权限完整迁移。
- R18. 超级管理员在 Desktop 与 Browser 均可访问用户、角色、权限、存储、版本发布、OpenAPI token、数据库统计和审计页面；普通用户在两个宿主均不可见且 API 仍拒绝。
- R19. 高风险系统操作沿用现有确认、CSRF/设备鉴权、审计和不可逆提示语义；Desktop 不得因使用 device token 获得额外权限。

#### 迁移与退役

- R20. 迁移期间 `/web/app` 不得成为功能较少的永久平行入口；每个切片通过后，正式 Web 对应入口切换到共享实现，并保留可回滚开关直至该阶段验收结束。
- R21. 旧 Askama 业务模板、重复 `app.js` handler 和 `app.css` selector 只有在路由、行为、可访问性和截图回归均有替代证据后才能删除。
- R22. 登录、初始化管理员、设备授权、下载落地页等无需 Desktop 共享的服务端边界页可保留 Askama，但必须消费同一 design token，并明确列入允许差异清单。
- R23. 不通过 iframe、远程 BrowserWindow、注入生产 Cookie、共享 localStorage 或放宽 Desktop CSP/IPC allowlist 实现一致性。

### Actors

- A1. 普通项目成员：在 Browser/Desktop 查看项目和工作项、筛选、协作、处理附件与消息。
- A2. 项目管理者：管理项目、成员、周期、资料和工作项流转。
- A3. 超级管理员：访问系统管理页并执行受审计的高风险操作。
- A4. Browser 宿主：提供 Cookie/CSRF、History、DOM 文件能力和浏览器登录。
- A5. Desktop 宿主：提供 device session、受限请求 registry、原生文件能力、系统通知和窗口生命周期。

### Key Flows

- F1. 登录/授权完成 -> 读取身份与顶部状态 -> 恢复当前项目 -> 加载相同默认首页。
- F2. 切换项目 -> 原子更新当前项目 -> 失效旧项目请求/SSE/缓存 -> 刷新导航计数与当前页面。
- F3. 列表筛选/保存视图/分页 -> route model 更新 -> 请求同一 contract -> 呈现相同表格和空错误状态。
- F4. 工作项编辑/流转/批量操作 -> 共享校验 -> 权限请求 -> 提交锁 -> 成功后定向刷新 -> 统一反馈。
- F5. 评论/回复/附件/提及 -> 共享 composer -> 宿主文件 adapter -> 同一业务 API -> SSE 增量更新与冲突恢复。
- F6. 通知到达 -> 更新 badge -> 打开消息 -> 解析统一 target -> 跳转并聚焦同一业务对象。
- F7. 系统管理员进入管理页 -> 共享权限 gate -> 执行高风险操作 -> 相同确认、结果和审计记录。

### Acceptance Examples

- AE1. 同一账号和项目分别打开 Browser 与 Desktop，导航项、badge、页面标题、列表列、排序、筛选默认值、分页和可用按钮逐项一致。
- AE2. 在任一宿主保存默认筛选视图，另一宿主刷新后使用同一视图；删除或改名后两端同步反映。
- AE3. 两端同时打开同一工作项，一端流转、评论或上传附件后，另一端通过 SSE 呈现同一结果，不重复、不丢失、不保留过期提交状态。
- AE4. 普通成员和超级管理员分别登录，两端可见菜单和操作集合完全一致；直接请求不可见操作仍返回相同权限错误。
- AE5. Browser 与 Desktop 在 390、768、1280、1440 有效宽度截图中，页面结构、组件尺寸、换行和状态色在允许的字体渲染误差外一致。
- AE6. 网络中断、401/session 失效、403、404、409、422、500、SSE 重连和上传失败在两端显示相同语义、重试入口和恢复结果。
- AE7. 正式 `/web/*` 切换到共享实现后，旧业务模板回退开关可恢复；稳定窗口结束并删除旧实现后，全仓不再存在同一业务的平行 handler。

### Scope Boundaries

- 不把 Browser Cookie、Desktop device credential 或文件 capability 合并成同一底层实现。
- 不允许 Desktop 使用 macOS Keychain 或 Electron `safeStorage`。
- 不在本计划实现离线写入、自动更新或生产 OS 签名。
- 不要求 OS 原生文件选择器、保存对话框和系统通知像素一致，只要求触发条件、业务结果和取消/失败语义一致。
- 服务端登录、系统初始化、设备授权和公开下载页可保留服务端渲染；其 design token 必须与共享体系一致。

## Planning Contract

### Product Contract Preservation

本计划补齐 W4/D2 已完成范围中未定义的“完全视觉与逻辑交互一致”标准，不撤销其安全宿主、共享 package 和业务功能结论。原计划状态保持 completed，本计划独立跟踪新增的一致性迁移与旧 Web 退役责任。

### Key Technical Decisions

- KTD1. **共享 React 为唯一长期实现。** 不把 11,000 行旧 CSS 直接复制到 Desktop；把正式 Web 的行为和视觉迁移到共享组件。Governs R1-R8、R20-R23。
- KTD2. **行为优先于页面搬运。** 每个切片先用旧 Web 特征测试冻结输入、状态和结果，再实现共享页面，避免只做截图相似。Governs R2、R4、R12-R19。
- KTD3. **route model 与 action model 共享。** 页面不识别 Browser/Desktop；路由承载和能力执行由 adapter 注入。Governs R3、R9-R12。
- KTD4. **Desktop registry 显式扩展。** 每个新增动作必须在 `desktop/src/network/operation-registry.mjs` 定义方法、路径、输入白名单、DTO parser、幂等性和测试，不提供通用 fetch 后门。Governs R18-R19、R23。
- KTD5. **迁移采用纵向切片。** 一个页面族同时完成 React UI、API contract、Browser adapter、Desktop registry、两宿主 E2E 和正式 Web 路由切换，不先造一套长期不可用组件库。Governs R20-R21。
- KTD6. **允许差异必须登记。** 仅认证、URL 承载、文件对话框、系统通知和窗口生命周期允许宿主差异；新增差异必须更新 parity manifest 和 review。Governs R3、R22-R23。
- KTD7. **一致性比较基于语义，不依赖脆弱的整页像素相等。** 自动化比较相同 fixture 和动作序列下的 route、可访问名称、可见操作、表单值、请求序列、状态快照与稳定布局几何；截图用于发现 token、层级和响应式回归，并明确排除字体抗锯齿与 OS 原生界面。Governs R2、R5-R8、AE1-AE6。
- KTD8. **切换粒度是可回滚的页面族纵向切片。** 每个切片必须先具备共享实现、双宿主证据和服务端权限回归，再切换正式入口；不得在 U1 仅完成组件外观时提前替换业务入口，也不得等到 U8 一次性切换全部路由。Governs R19-R21。

### Canonical Experience Matrix

| 页面族 | 正式 Web 基准 | 当前 SharedApp | 本计划结果 |
|---|---|---|---|
| 全局壳 | 顶部导航、项目切换、搜索、消息、账户菜单、主题 | 简化 topbar | 共享完整全局壳 |
| 首页/个人 | Dashboard、个人资料 | 简化通知首页 | 共享首页与个人页 |
| 项目 | 创建、详情、成员、周期、资源、个人分析 | 仅项目列表/选择 | 全量共享 |
| 工作项列表 | 指标、保存视图、组合筛选、批量动作、分页 | 基础筛选/分页 | 全量共享 |
| 工作项详情 | 流转历史、富文本、回复、附件预览、前后项 | 基础编辑、评论、附件 | 全量共享 |
| 消息/搜索 | 消息筛选、目标跳转、全局搜索 | 基础消息 | 全量共享 |
| 系统管理 | 用户、角色、权限、存储、发布、OpenAPI、DB、审计 | 无 | 按权限全量共享 |
| 边界页 | 登录、bootstrap、设备授权、下载 | 不适用 | 保留 SSR，共享 token |

## Implementation Units

### U0：冻结差异清单、允许差异与特征基线

- **Goal：** 把旧 Web 的所有页面、动作、状态和权限入口变成可追踪 contract，避免迁移漏项。
- **Files：** `docs/reviews/` 下 parity inventory、`frontend/parity/experience-manifest.json`、`frontend/parity/experience-manifest.schema.json`、`frontend/test/experience-manifest.test.mjs`、现有 Browser E2E。
- **Approach：** 以 `api/src/web/router.rs` 的运行时注册、`api/templates/web/` 的实际渲染、`api/static/app.js` 的事件绑定和请求调用为四类来源，逐个建立稳定 ID。页面记录 route pattern、页面族、模板、actor、permission、controls、states、responsive states 和迁移单元；动作记录 trigger、input schema、validation、confirmation、HTTP method/path、success/error effect、realtime effect、幂等/重复提交语义；仅宿主能力记录枚举化 exception code。状态仅允许 `baseline`、`in_progress`、`shared`、`cutover`、`retired`，并要求状态迁移证据。
- **Coverage algorithm：** 测试从 Rust router 源码提取全部 `/web` route/method，从模板目录提取非 partial 页面及被引用 partial，从 `app.js` 提取登记标记对应的 handler/action；与 manifest 双向比较，新增来源项未登记、manifest 指向不存在来源、重复 ID 或无 owner/unit 时均失败。动态拼接且无法可靠静态提取的调用必须在 inventory 中记录人工核验依据和后续特征测试，不得静默忽略。
- **Tests：** JSON Schema 使用 `additionalProperties: false` 和受控枚举；来源覆盖双向校验；允许差异不能使用自由文本绕过；`shared` 及以后状态必须关联 Browser/Desktop 测试和同一 fixture；`cutover` 必须有关联 route flag/rollback 证据；`retired` 必须证明旧来源已删除。
- **Exit：** 所有正式 Web 页面与动作都有 owner、目标单元和验收证据位置。

#### U0 Manifest 最小契约

| 实体 | 必填字段 |
|---|---|
| Page | `id`、`route`、`methods`、`family`、`sourceTemplates`、`actors`、`permissions`、`controls`、`states`、`responsiveStates`、`migrationUnit`、`status`、`evidence` |
| Action | `id`、`pageId`、`trigger`、`inputs`、`validation`、`confirmation`、`request`、`successEffect`、`errorEffects`、`realtimeEffect`、`repeatSubmitPolicy`、`migrationUnit`、`status`、`evidence` |
| Host exception | `code`、`capability`、`browserBehavior`、`desktopBehavior`、`sharedOutcome`、`tests` |

首批允许的 `Host exception code` 固定为 `auth.transport`、`route.transport`、`file.picker`、`file.save`、`notification.native`、`window.lifecycle`；新增 code 必须修改 schema、计划 review 和双宿主测试，不能只修改数据文件。

### U1：统一 design token、全局壳和基础交互原语

- **Goal：** 建立唯一视觉基础，并对齐全局导航和通用交互状态。
- **Files：** `frontend/packages/ui/src/`、`frontend/packages/app-shell/src/application.css`、`frontend/packages/app-shell/src/app.jsx`、`web/src/app.css`、`desktop/src/renderer/app.css`、相关 UI tests。
- **Approach：** 提取正式 Web token；实现共享 topbar、项目切换、搜索、通知、账户菜单、主题、按钮、字段、菜单、弹窗、表格、分页、反馈和 skeleton；宿主 CSS 只保留 reset。
- **Tests：** 键盘导航、focus trap、菜单关闭、主题持久语义、长文本、badge 上限、loading/disabled/error；390/768/1280/1440 截图。
- **Exit：** 两宿主全局壳与基础组件无宿主 CSS 分叉。

### U2：统一身份、路由、项目上下文与搜索

- **Goal：** 对齐启动、身份、当前项目、深链接、项目切换和全局搜索。
- **Files：** `frontend/packages/app-core/src/routes.js`、`frontend/packages/platform-contract/`、`frontend/packages/api-client/`、Browser/Desktop router/events/network registry、API v1 routes/tests。
- **Approach：** 扩展统一 route model；共享启动状态机和 request generation；切项目时取消旧请求并重建 SSE；补齐搜索和个人页 API contract。
- **Tests：** 冷启动、无项目、深链接、后退/前进、重复切换、慢响应乱序、session 失效、搜索分页与目标跳转。
- **Exit：** 相同 route/context 在两宿主产生相同页面状态和请求序列。

### U3：迁移项目、成员、周期、资源与个人分析

- **Goal：** 完整覆盖项目域能力，而不是只提供项目列表。
- **Files：** 共享 project components/use cases、API client、Desktop operation registry、项目相关 API tests、Browser/Desktop E2E。
- **Approach：** 按项目列表/创建 -> 详情/成员 -> 周期 -> 资源/版本/标签 -> 个人分析分切片迁移；每切片完成后切换正式 Web 对应入口。
- **Tests：** 权限矩阵、生命周期状态、成员增删、周期边界、资源版本并发、附件能力、空/404/409/422、分页和返回路径。
- **Exit：** `api/templates/web/projects*` 对应业务不再需要平行实现。

### U4：迁移工作项列表、视图与批量操作

- **Goal：** 对齐需求/任务/Bug 的完整列表工作流。
- **Files：** 共享 work-item list components/state、route/query model、API client、Desktop registry、saved view/batch APIs 与 tests。
- **Approach：** 共享指标、筛选 schema、保存/默认视图、选择模型、批量动作、分页和每页数量；URL 与 Desktop internal route 使用同一 query DTO。
- **Tests：** 组合筛选、默认视图恢复、失效视图、跨页选择清理、批量部分失败、权限变化、快速重复提交、刷新后状态一致。
- **Exit：** 三类列表在两个宿主的控件、状态和副作用一致。

### U5：迁移工作项详情、流转、富文本与附件

- **Goal：** 对齐最复杂的详情协作流程。
- **Files：** `frontend/packages/ui/` 工作项组件、共享 editor/composer、app-core use cases、API client、Desktop file/registry、相关 API/E2E tests。
- **Approach：** 迁移详情元数据、父子关系、前后项、流转历史、编辑/移交、富文本/代码块、评论回复编辑、提及、附件预览上传下载和删除语义。
- **Tests：** 角色权限、字段校验、并发更新、删除态、富文本消毒、提及候选、上传取消/重试、下载 capability、预览降级、重复 SSE 事件。
- **Exit：** 正式 Web 详情页与 Desktop 使用同一组件和 mutation state machine。

### U6：统一消息、通知与实时恢复

- **Goal：** 让实时事实、badge、消息列表和目标聚焦在两端完全一致。
- **Files：** 共享 notification state、events contract、Browser EventSource、Desktop SSE coordinator、消息 UI/tests。
- **Approach：** 定义事件去重/顺序/失效规则；共享消息分页、筛选、全部已读、目标解析与焦点恢复；宿主 adapter 只传事实。
- **Tests：** 断线重连、重复/乱序事件、后台/前台、最小化、权限撤销、目标删除、跨项目目标、read-all 竞态。
- **Exit：** 同一事件序列在两宿主产生相同 UI state snapshot。

### U7：迁移系统管理

- **Goal：** 让超级管理员在两宿主获得同等且受控的管理能力。
- **Files：** 共享 system routes/components、system API client、Desktop registry、OpenAPI、Rust authorization/integration tests、两宿主 E2E。
- **Approach：** 按 dashboard -> 用户 -> 角色/权限 -> 存储 -> 发布 -> OpenAPI token -> DB 统计 -> 审计迁移；每个操作保留确认、审计和最小权限。
- **Tests：** 超管/普通用户矩阵、直接路由拒绝、高风险确认、token 单次展示、存储密钥脱敏、发布状态机、审计过滤、错误恢复。
- **Exit：** 系统管理菜单和操作集合在两宿主一致，Desktop registry 无通用 system fetch。

### U8：切换正式 Web、退役重复实现与最终 Gate

- **Goal：** 让共享实现成为正式入口，并删除已替代的平行业务 UI。
- **Files：** `api/src/web/router.rs`、`api/templates/web/`、`api/static/app.js`、`api/static/app.css`、部署与回滚 runbook、最终 review。
- **Approach：** 汇总并完成 U3-U7 已逐页面族执行的 route cutover；保留短期 feature flag；采集错误率与关键流程；稳定后删除重复模板/handler/selector，边界 SSR 页面继续使用共享 token。U8 不承担首次大爆炸切换，只负责最终收口、跨页面回归和旧实现退役。
- **Tests：** 全路由清单、Browser/Desktop 双宿主 E2E、截图 diff、权限矩阵、异常注入、回滚、无死链接、无旧 selector/handler 引用、bundle/security checks。
- **Exit：** parity manifest 全部 completed；只剩已登记边界页差异；最终 review 可逐项映射 R1-R23 和 AE1-AE7。

## Verification Contract

### Automated Gates

| Gate | 必需证据 |
|---|---|
| Source parity | experience manifest 覆盖全部正式路由、动作和允许差异；无未登记模板/handler |
| Shared contract | routes、DTO、form schema、action state、event reducer 单元/性质测试 |
| Browser | Cookie/CSRF、History、DOM 文件、SSE、正式 `/web/*` E2E |
| Desktop | device auth、operation registry、IPC sender policy、原生文件、SSE/生命周期 E2E |
| Differential | 同一 fixture/action sequence 的 DOM 语义、可见操作、请求序列和 state snapshot 一致 |
| Visual | 390/768/1280/1440 与关键 loading/empty/error/modal/dark states 截图回归 |
| Security | 普通/项目管理/超管权限矩阵；Desktop 不放宽 CSP、IPC、network registry |
| Migration | 新旧入口对比、feature flag 回滚、旧模板/JS/CSS 引用清零 |

### Definition Of Done

- [ ] 正式 Web 页面、交互、权限和异常状态已全部进入 parity manifest。
- [ ] Browser 与 Desktop 的共享页面只有一个组件树、状态模型和样式源。
- [ ] 全局壳、项目、工作项、消息、搜索和系统管理在两宿主功能与交互一致。
- [ ] 所有允许宿主差异均有明确 contract 和双端测试，不存在页面级分叉。
- [ ] 正式 `/web/*` 已切换到共享实现并通过回滚演练。
- [ ] 已替代 Askama 业务模板、重复 JS handler 和 CSS selector 已删除。
- [ ] 双宿主权限、异常、实时、文件和截图 Gate 全部通过。
- [ ] 最终 review 逐项证明 R1-R23、F1-F7、AE1-AE7，无“基本一致”或人工目测替代证据。

### 每个纵向切片的固定 Gate

1. **Baseline：** manifest 中页面和动作处于 `baseline`，旧 Web 特征测试冻结权限、默认值、请求顺序与异常反馈。
2. **Shared：** 同一 React 页面、状态模型、表单 schema 和样式在 Browser/Desktop 运行，Desktop operation registry 仅增加该切片所需的显式动作。
3. **Differential：** 使用同一 fixture 和动作序列比较可访问语义树、可见动作、请求序列、业务状态快照和关键布局几何。
4. **Cutover：** 正式 `/web/*` 入口通过可回滚 flag 切至共享实现，权限、CSRF/device auth、深链接和刷新行为回归通过。
5. **Retire：** 稳定窗口结束后删除该切片的旧模板、handler 和 selector；manifest 更新为 `retired` 并保留测试与 review 证据。

## Risks And Controls

- **范围巨大：** 必须按纵向切片提交和发布，不将 U1-U8 作为单个执行目标。
- **历史行为未文档化：** U0 先以运行时、E2E、模板和实际请求顺序冻结，不能只读 CSS 推断。
- **迁移期双实现漂移：** 每个切片完成后立即切正式入口；feature flag 只用于短期回滚，不承载长期 A/B。
- **Desktop 攻击面扩大：** operation registry 逐动作白名单，DTO fail closed，权限仍由服务端最终裁决。
- **视觉像素与 OS 字体差异：** Gate 比较布局、token、控件和语义状态，允许已记录的字体抗锯齿差异。
- **系统管理误操作：** 高风险动作最后迁移，每项要求权限、确认、审计、脱敏和回归证据。

## Execution Start

第一执行阶段固定为 U0，不直接重写页面。U0 完成后才能启动 U1；U1 完成并建立共享基础后，U2-U7 按依赖逐个纵向迁移。每个阶段完成后提交、推送并更新本计划的执行状态与独立 review 证据。
