---
title: "refactor: 以 main Web 为基线完成共享界面 1:1 视觉还原"
type: refactor
date: 2026-08-09
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: user-request
origin:
  - docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
  - docs/plans/2026-08-09-001-fix-desktop-stable-spa-shell-plan.md
execution: code
execution_status: in_progress
baseline:
  branch: main
  commit: 6c0e56daa5460a9725ee00b8937124d390e9bd0b
---

# 以 main Web 为基线完成共享界面 1:1 视觉还原

## Goal Capsule

- **目标：** 以 `main@6c0e56d` 实际运行的服务端 Web 为唯一视觉基线，在不恢复旧双实现的前提下，将其信息架构、DOM 层级、排版、尺寸、间距、颜色和交互状态完整迁移到 Browser 与 Desktop 共用的 React `SharedApp`。
- **问题：** `dev` 已完成业务能力迁移和稳定 SPA 壳，但共享 React UI 对旧 Web 做了重新设计；导航、内容宽度、卡片层级、表格、表单和详情页布局均与 `main` 不同。
- **原则：** 旧模板与 `api/static/app.css` 只作为基线证据，最终实现仍位于 `frontend/packages/app-shell/` 与 `frontend/packages/ui/`；Browser 与 Desktop 不维护平行组件或业务 CSS。
- **完成标准：** 同一账号、数据、route、主题与有效视口下，基线 Web、当前 Browser 和 packaged Desktop 的关键布局几何与可见状态一致；自动化截图差异只允许字体抗锯齿和已登记宿主边界差异。

## Scope And Invariants

### 必须还原

- 全局 design token、页面背景、字体、顶部导航、项目切换、搜索、账户菜单和响应式折叠。
- 工作台、消息、搜索、个人资料、项目列表与项目详情。
- 周期、资源、个人分析、需求/任务/Bug 列表、工作项详情与讨论附件。
- 系统首页、用户、角色、权限、存储、OpenAPI、发布、数据库统计、审计和 API 文档。
- loading、empty、error、disabled、hover、focus、active、modal、分页和窄屏状态。

### 不可回退

- 保持唯一 `SharedApp`、稳定 SPA 根壳和 same-document route 切换；不得恢复整页导航或菜单切换时卸载顶部导航。
- Desktop 继续使用 device session、显式 operation registry、受限 IPC/CSP 和原生文件 capability；不得嵌入远程 Web、注入 Cookie、增加通用 fetch 或放宽 sender policy。
- 禁止 macOS Keychain 和 Electron `safeStorage`。
- 不使用固定延时、淡入动画或全屏 loading 遮盖闪烁。
- 登录、设备授权、下载等 SSR/宿主边界页仅对齐同一设计语言，不要求与业务壳具有相同 DOM。

## Baseline Contract

### 规范源优先级

1. `main@6c0e56d` 的实际运行截图和浏览器计算样式。
2. `main:api/templates/layouts/web.html` 与对应页面模板的 DOM 和信息顺序。
3. `main:api/static/app.css` 的 token、布局、断点与状态 selector。
4. `main:api/static/app.js` 的可见交互状态。

历史截图、当前 `dev` 视觉和主观重设计均不能覆盖以上基线。若基线运行行为与源码冲突，以实际运行行为为准并在 review 中记录。

### 固定视口与容差

| 类别 | 视口 | 主要检查 |
|---|---|---|
| Mobile | `390x844` | 导航折叠、单列顺序、控件换行、无横向溢出 |
| Tablet | `768x1024` | 栅格降级、筛选和操作区、详情侧栏位置 |
| Desktop | `1280x800` | 默认内容宽度、导航、表格列和首屏密度 |
| Wide | `1440x900` | 最大宽度、左右留白、详情双栏和 sticky rail |

- 稳定区域的边界框位置和尺寸容差为 `2px`；文字换行、列顺序、显示/隐藏和控件数量必须完全一致。
- 颜色、边框、圆角、阴影、字号、行高和字重取基线 computed style；不得用“近似色”或新的组件默认值替代。
- 截图像素差排除字体抗锯齿、光标、时间文本和 OS 原生界面；排除规则必须结构化登记，不能整块忽略业务区域。

### 完整扫描结论

完整扫描见 `docs/reviews/2026-08-09-002-main-web-visual-baseline-scan.md`。已覆盖 manifest 全部 `30` 页；其中 `21` 页完成 `main/dev` 双侧四视口运行采集。扫描确认所有 21 个业务/系统运行页面均存在结构级差异，首要根因是当前应用对所有 route 强制渲染统一 `shell-header` 和三块摘要卡，而 `main` 使用页面自有 hero、panel、table、tabs 和详情 rail。

## Implementation Units

### V0：冻结基线与视觉合同

- **Files：** 新增 `frontend/parity/main-web-visual-contract.json`、对应 schema 与 `frontend/test/main-web-visual-contract.test.mjs`；扩展 `web/e2e/app-shell.spec.mjs`；新增可复现采集脚本到 `web/scripts/`；复核写入 `docs/reviews/`。
- 从 `main` 提取 token、关键 selector、页面 DOM 顺序、断点和组件几何，建立可校验的 visual parity manifest。
- 为每个页面登记 route、actor、fixture、主题、视口、稳定锚点、动态遮罩和截图名称。
- 基线截图只写入 `.artifacts/visual-parity/main/`，不纳入 Git；可复现脚本和 manifest 纳入 Git。
- **已完成：** 固定 SHA、30 页覆盖分类、35 个模板扫描、21 页双侧四视口截图和结构指标；证据与结论写入 `docs/reviews/2026-08-09-002-main-web-visual-baseline-scan.md`。
- **已实现：** 扫描台账已固化为封闭 schema 校验的 visual contract；固定 SHA、四视口、30 页矩阵、V2-V10 单元、锚点、几何、computed style、响应式状态、动态遮罩和宿主差异均可执行校验。隔离采集脚本支持审计计划与显式采集，不把本地截图提交到 Git。
- **Exit：** 页面矩阵完整，基线 SHA 固定，新增/遗漏页面或无理由扩大遮罩会使测试失败。

### V1：全局 token、画布、导航与基础原语

- **Files：** `frontend/packages/ui/src/styles.css`、`frontend/packages/ui/src/global-navigation.jsx`、`frontend/packages/app-shell/src/application.css` 及测试。
- 将 `main` 的 token 按原值映射为共享 token；恢复 `58px` 顶栏、品牌区、主导航、项目选择、搜索、账户区和断点行为。
- 恢复 `.main` 内容宽度、页面标题、按钮、字段、反馈、modal、表格、分页、badge、tab 和 card 的基线外观。
- **已完成切片：** 根壳改为 58px 顶栏 + `.main` 独立滚动；导航已恢复真实 logo、桌面端下载、RBAC 系统下拉、可搜索项目切换、全局搜索、消息面板、账户菜单，以及 1280/1100/860 响应式行为。剩余工作为基础原语和页面内容画布的 computed style 校准。
- **已完成切片：** button、field、modal 与 table 已按固定基线校准边框、尺寸、padding、hover/focus、backdrop、阴影和结构边界；剩余原语为 feedback、pagination、badge、tab、card 及内容画布。
- **已完成：** feedback、pagination、badge、tabs、card token 与内容画布完成基线校准；消息、搜索、项目和工作项移除平行的 button/tab/badge/pagination 样式并迁移到共享原语。桌面 18px、移动 12px 内容 padding、无 1200px 人工限宽，1280/1440 顶栏区域与工具子项均有不重叠几何断言。
- **Exit：** 所有页面共享相同画布和原语；菜单切换仍不卸载顶栏，Web/Desktop 无业务 CSS 分叉。

### V2：页面骨架与工作台

- **Files：** `frontend/packages/app-shell/src/app.jsx`、`frontend/packages/app-shell/src/application.css`、`frontend/packages/ui/src/primitives.jsx` 及 package/Web E2E tests。
- 移除所有 route 强制共享的 `shell-header` 与三摘要卡，改由页面模型选择基线 `page-hero`、detail hero、compact heading 或无 hero。
- 恢复 Dashboard 的 4 指标、项目 compact table、待处理讨论和最近动态双栏。
- **已完成：** 删除旧 `shell-header` 和三摘要卡；非首页使用无描述区的 compact `page-heading` 保留 route-ready、键盘焦点与图标刷新合同。新增 `/api/v1/dashboard` 聚合只读合同，Dashboard 恢复 4 指标、项目 compact table、待处理讨论与最近动态，并按 1280/960 断点降级。Browser 与 Desktop 均继续渲染同一 `SharedApp`。
- **Exit：** Dashboard 四视口达到基线，其他页面不再出现未登记的通用摘要区。

### V3：个人、消息与搜索

- **Files：** `frontend/packages/app-shell/src/app.jsx`、`frontend/packages/app-shell/src/application.css`、profile/message/search API client 的既有读取测试与 `web/e2e/app-shell.spec.mjs`。
- 恢复 profile hero、个人指标、Token/项目/安全区；恢复消息 compact heading、tabs、消息行和 pager；恢复搜索 hero、搜索 panel、结果分组和 pager。
- 覆盖正常、空、loading、错误、权限受限、modal 和窄屏状态。
- **已完成：** 消息中心恢复 compact heading、筛选 tabs、四列消息行、未读状态、pager 与 empty state；全局搜索恢复 page hero、搜索 panel、结果列表与 pager；个人中心恢复 profile hero、三指标、Token/项目双栏、账户安全区及既有 modal。Dashboard 只读指标合同补充全部指派和活跃高优先级计数，Browser/Desktop 继续共用同一读取与呈现路径。三页均增加 390/768/1280/1440 响应式几何断言。
- **Exit：** `/web/me`、`/web/messages`、`/web/search` 在固定视口通过结构、几何和截图对比。

### V4：项目列表与项目详情

- **Files：** `frontend/packages/app-shell/src/app.jsx`、`frontend/packages/app-shell/src/application.css`、`frontend/packages/ui/src/primitives.jsx`、项目 route/API client tests 与 Web E2E。
- 恢复项目列表 hero、3 指标、状态 tabs、项目 card grid 与 pager。
- 恢复项目详情 detail hero、4 指标、整卡 tabs、概览双栏、成员/周期/文件/资料/动态 panel。
- **已完成：** 项目列表已恢复 hero、3 指标、状态 tabs、三列 card grid 与 pager；项目详情已恢复 detail hero、服务端聚合的 4 指标、整卡 tabs、基础信息/项目说明双栏及成员、周期、项目文件、资料库 panel。四视口几何合同覆盖无横向溢出、区域顺序、指标列数、tabs 方向和 `1280px` 概览降级。共享实现保留已登记的项目文件能力；因当前无完整动态读取合同，不在视觉迁移中伪造动态数据。
- **Exit：** 项目列表和详情的各 tab、empty、modal 与窄屏状态达到基线。

### V5：周期、资源与个人分析

- **Files：** `frontend/packages/app-shell/src/app.jsx`、`frontend/packages/app-shell/src/application.css`、project API client/route tests、Web fixture 与 E2E、Desktop parity fixture。
- 先建立周期、资料和角色权限详情的稳定视觉 fixture，再恢复周期 detail grid、资源 hero/锁定态/正文附件和个人分析 8 指标/双栏结构。
- 保持共享 mutation 和文件 adapter，只调整呈现结构与可见交互位置。
- **已完成切片：** 个人分析恢复 analysis header、两组四指标、负载/协作双栏、最近完成列表和说明区；四视口几何合同覆盖指标、效率和分析区域的列数及业务画布无横向溢出。剩余周期详情与资料详情。
- **已完成切片：** 周期详情恢复 detail hero、四指标、基础信息/目标双栏、时间进度、状态看板和成员负载；四视口几何合同覆盖指标、概览、看板断点与业务画布无横向溢出。剩余资料详情。
- **已完成：** 资料详情恢复 resource hero、标签/关联摘要、密码锁定卡、正文卡和附件卡；公开态与锁定态均覆盖四视口几何。周期详情、资料详情和个人分析全部完成，既有 mutation、文件 adapter、项目切换与权限行为保持不变。
- **Exit：** 三类动态详情均具备 populated/empty/locked/error 运行证据，项目域全部达到基线。

### V6：工作项列表

- **Files：** `frontend/packages/app-shell/src/app.jsx`、`frontend/packages/app-shell/src/application.css`、`frontend/packages/ui/src/primitives.jsx`、work-item route/API client tests 与 Web E2E。
- 恢复指标区、保存视图、组合筛选、批量栏、表格、分页以及需求/任务/Bug 状态色。
- **已完成：** 需求、任务和 Bug 共用列表恢复三指标、列表 panel、常用视图、六条件筛选、批量操作、`980px` 紧凑表格和分页；三页四视口几何合同验证移动/平板单列、桌面完整筛选及表格内部滚动，未恢复旧 Web 入口。
- **Exit：** 三类列表的正常/空/筛选/批量/modal/窄屏状态通过视觉回归。

### V7：工作项详情协作

- **Files：** `frontend/packages/app-shell/src/app.jsx`、`frontend/packages/app-shell/src/application.css`、`frontend/packages/ui/src/work-item-*.jsx`、`frontend/packages/ui/src/rich-text.jsx` 及 package/Web/Desktop tests。
- 恢复详情 hero、作者正文、主内容与 `280px` sticky action rail、描述、流转、评论、富文本和附件布局。
- 保留 SPA route、共享 mutation、附件 capability 和 SSE reducer。
- **已完成：** 共享详情恢复 hero、作者正文、描述、讨论、附件和 `280px` sticky action rail；编辑、流转与操作记录按基线进入 Modal，移动端和平板端操作栏进入正文流。四视口几何合同及编辑、流转、生命周期、评论、附件、只读、删除和错误回归通过。
- **Exit：** 详情正常/删除/只读/error/modal/窄屏状态通过视觉回归，SSE 更新不引发布局跳动。

### V8：系统管理核心页面

- **Files：** `frontend/packages/app-shell/src/app.jsx`、`frontend/packages/app-shell/src/application.css`、system API client tests、Web E2E 与 Rust permission regression tests。
- 恢复 system dashboard、users、roles/role-permissions 和 permissions 的 card/list/tree/table/modal 结构。
- **已完成切片：** system dashboard 移除额外标题壳，恢复权限过滤的四列 `system-grid` 与 `system-card`；四视口覆盖单列、双列和四列断点。剩余 users、roles/role-permissions 和 permissions。
- **已完成切片：** users 恢复 page hero、用户列表 panel、项目摘要标签、状态样式和 pager；四视口、用户核心 mutation 及项目关系批量/阻断语义通过。剩余 roles/role-permissions 和 permissions。
- **已完成切片：** permissions 恢复 page hero、route query 搜索和按资源分组的只读权限树；四视口层级与业务画布无横向溢出。剩余 roles/role-permissions。
- **已完成：** roles/role-permissions 恢复 page hero、角色列表侧栏、角色摘要和分组权限树，桌面双栏、移动/平板单列；角色创建、状态确认、父子授权联动与只读权限保持不变。system dashboard、users、roles/role-permissions 和 permissions 全部完成。
- **Exit：** 权限树、用户项目关系和角色管理达到基线，普通用户拒绝行为不变。

### V9：系统运维页面

- **Files：** `frontend/packages/app-shell/src/app.jsx`、`frontend/packages/app-shell/src/application.css`、system API client tests、`api/src/web/router.rs` 的文档边界、Web E2E 与 Rust authorization tests。
- 恢复 storage、OpenAPI、releases、database、audit；System API docs 恢复为独立文档边界，不套业务摘要壳。
- 高风险操作的确认、脱敏、一次性密钥和审计逻辑保持不变。
- **已完成切片：** database stats 与 audit 恢复单 panel、自带页面标题、紧凑工具栏/筛选栏、统计表和底部分页布局；审计每页数量移入 pager，正式 route query、缓存刷新失败保留和只读证据语义不变。四视口业务画布无横向溢出。剩余 storage、OpenAPI、releases 和 System API docs。
- **已完成切片：** storage 恢复配置主栏与边界说明侧栏、独立桶状态面板、版本行列表和底部分页；宽屏双栏、1280px 及以下单列，移动端版本行降级。脱敏、确认锁、原子刷新和最终刷新失败语义不变。剩余 OpenAPI、releases 和 System API docs。
- **已完成切片：** OpenAPI 恢复 page hero、文档与接入主栏、接入提示侧栏、scope 摘要和独立 Token 面板；宽屏双栏、1280px 及以下单列。一次性明文、最小 scope、配额、编辑和确认删除语义不变。剩余 releases 和 System API docs。
- **已完成切片：** releases 恢复 page hero、保留策略主栏与发布约束侧栏、独立版本/资产面板和底部分页；宽屏双栏、1280px 及以下单列。内部通道校验、发布/撤回、上传下载删除和最终刷新失败语义不变。剩余 System API docs。
- **已完成：** Browser 正式 System API docs 恢复为经过 Rust 登录/权限门的独立 Scalar 文档应用，不加载共享业务壳；Desktop 与 `/web/app/system/api-docs` 保留无远程脚本的共享契约查看器。storage、OpenAPI、releases、database、audit 和 System API docs 全部完成。
- **Exit：** 系统运维页面全部达到基线；普通用户不可见且直接访问仍被拒绝。

### V10：边界页、双宿主响应式回归与收口

- **Files：** `api/static/auth.css`、保留的 `api/templates/web/*.html` 边界模板、`web/e2e/`、`desktop/scripts/smoke-desktop-feature-parity.mjs`、visual contract 与最终 `docs/reviews/`。
- 复核 login、bootstrap、downloads 和 public API docs；设备授权作为无 main 基线的宿主边界，只对齐共享 token 和自身状态合同。
- **已完成切片：** downloads 的模板结构与断点 CSS 已确认等价于 `main`；内联样式迁移到版本化静态 CSS，增加内部开发版签名信任说明。公开页只展示已发布且上传完成的资产，空态和不可用资产语义保持。
- 使用相同 fixture 对 Browser 和 packaged Desktop 执行页面矩阵；比较 DOM 锚点、computed style、边界框和截图。
- 验证 route 切换、前进后退、项目切换、modal 和主题切换无整壳闪烁、白屏或布局抖动。
- 更新 `docs/reviews/`，逐页记录基线、结果、允许差异和复现命令。
- **Exit：** 所有页面和状态通过 Gate，manifest 无 pending 项，计划状态改为 `completed`。

## Execution Order And Commit Boundaries

执行顺序固定为 `V0 -> V1 -> V2 -> V3 -> V4 -> V5 -> V6 -> V7 -> V8 -> V9 -> V10`。每个单元按可独立解释的页面族拆分提交并立即推送 `dev`；不得等待全部页面完成后一次提交。每次提交只暂存本单元文件，不包含 `.artifacts/` 或 `test-results/`。

每个页面切片必须依次完成：`fixture -> main baseline -> React DOM -> shared CSS -> structure/geometry test -> Browser screenshot -> packaged Desktop screenshot -> review`。不能只调整 CSS 后人工目测结束。

`main` 截图保留在 `.artifacts/`，不直接作为 Git/CI golden image 提交。可执行合同将基线中的稳定 DOM 锚点、区域顺序、computed style、边界框和断点行为写入 `frontend/parity/main-web-visual-contract.json`；CI 校验该结构化合同，并使用 Playwright 自带 screenshot matcher 固定迁移完成后的共享实现。需要重新人工核对 `main` 时，由采集脚本基于固定 SHA 创建隔离 worktree 和 fixture，禁止依赖长期运行的旧服务或个人浏览器状态。

## Verification Contract

| Gate | 必需证据 |
|---|---|
| Source | 基线 SHA、模板、CSS selector、断点和页面矩阵可追溯 |
| Structure | 页面区域顺序、可访问名称、控件和状态锚点一致 |
| Geometry | 固定视口关键边界框误差不超过 `2px` |
| Visual | light/dark 与关键状态截图通过受控 diff |
| Browser | 正式 `/web/*` route、History、Cookie/CSRF、文件和 SSE 回归 |
| Desktop | packaged app、device auth、registry、IPC/CSP、文件和生命周期回归 |
| Stability | 菜单切换不卸载顶栏，无整页闪烁、白屏和无意义 skeleton |
| Security | credential scan、bundle source、sender policy 和 operation registry 测试通过 |

## Definition Of Done

- [ ] `main@6c0e56d` 的页面、状态、视口和允许差异已完整登记。
- [ ] 全局壳、token、原语和所有业务页面按基线完成视觉与排版还原。
- [ ] Browser 与 Desktop 继续使用同一组件树和样式源。
- [ ] 固定视口结构、几何、computed style 和截图 Gate 全部通过。
- [ ] 菜单、路由、项目和主题切换无顶栏卸载、白屏、闪烁或布局抖动。
- [ ] 功能、权限、认证、文件、SSE 与 Desktop 安全边界无回归。
- [ ] 最终 review 可逐页映射到基线证据，且无未说明的视觉差异。

## Current Progress

- [x] 确认 `main` 旧 Web 与 `dev` 共享 React 的实现边界。
- [x] 固定视觉基线提交 `6c0e56daa5460a9725ee00b8937124d390e9bd0b`。
- [x] 完成 30 页静态覆盖扫描及 21 页双侧四视口运行采集。
- [x] V0：将扫描结果固化为可执行 visual manifest 与 fixture。
- [x] V1：全局 token、画布、导航与基础原语。
- [x] V2：页面骨架与工作台。
- [x] V3：个人、消息与搜索。
- [x] V4：项目列表与项目详情。
- [x] V5：周期、资源与个人分析。
- [x] V6：工作项列表。
- [x] V7：工作项详情协作。
- [x] V8：系统管理核心页面。
- [x] V9：系统运维页面。
- [ ] V10：边界页、双宿主响应式回归与收口。
