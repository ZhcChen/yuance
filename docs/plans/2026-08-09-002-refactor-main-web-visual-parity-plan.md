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

## Implementation Units

### V0：冻结基线与视觉合同

- **Files：** `frontend/parity/`、`frontend/test/`、`web/e2e/`、`docs/reviews/`。
- 从 `main` 提取 token、关键 selector、页面 DOM 顺序、断点和组件几何，建立可校验的 visual parity manifest。
- 为每个页面登记 route、actor、fixture、主题、视口、稳定锚点、动态遮罩和截图名称。
- 基线截图只写入 `.artifacts/visual-parity/main/`，不纳入 Git；可复现脚本和 manifest 纳入 Git。
- **Exit：** 页面矩阵完整，基线 SHA 固定，新增/遗漏页面或无理由扩大遮罩会使测试失败。

### V1：全局 token、画布、导航与基础原语

- **Files：** `frontend/packages/ui/src/styles.css`、`frontend/packages/ui/src/global-navigation.jsx`、`frontend/packages/app-shell/src/application.css` 及测试。
- 将 `main` 的 token 按原值映射为共享 token；恢复 `58px` 顶栏、品牌区、主导航、项目选择、搜索、账户区和断点行为。
- 恢复 `.main` 内容宽度、页面标题、按钮、字段、反馈、modal、表格、分页、badge、tab 和 card 的基线外观。
- **Exit：** 所有页面共享相同画布和原语；菜单切换仍不卸载顶栏，Web/Desktop 无业务 CSS 分叉。

### V2：工作台、消息、搜索与个人资料

- 按基线恢复模块顺序、指标栅格、项目区、消息列表、搜索结果分组和个人安全设置布局。
- 覆盖正常、空、loading、错误、权限受限和窄屏状态。
- **Exit：** 四个页面族在固定视口通过结构、几何和截图对比。

### V3：项目、周期、资源与个人分析

- 按项目列表 -> 项目详情 -> 成员/文件 -> 周期 -> 资源详情 -> 个人分析的顺序还原。
- 保持共享 mutation 和文件 adapter，只调整呈现结构与可见交互位置。
- **Exit：** 项目域所有 manifest 页面达到基线布局，无功能或权限回归。

### V4：工作项列表与详情协作

- 恢复指标区、保存视图、组合筛选、批量栏、表格、分页以及需求/任务/Bug 状态色。
- 恢复详情 hero、主内容与 `280px` sticky action rail、描述、流转、评论、富文本和附件布局。
- **Exit：** 三类列表和详情的正常/空/错误/modal/窄屏状态通过视觉回归，SSE 更新不引发布局跳动。

### V5：系统管理页面

- 按 dashboard -> users -> roles/permissions -> storage -> OpenAPI -> releases -> database -> audit/API docs 还原。
- 高风险操作的确认、脱敏、一次性密钥和审计逻辑保持不变。
- **Exit：** 超管页面全部达到基线；普通用户不可见且直接访问仍被拒绝。

### V6：双宿主响应式回归与收口

- 使用相同 fixture 对 Browser 和 packaged Desktop 执行页面矩阵；比较 DOM 锚点、computed style、边界框和截图。
- 验证 route 切换、前进后退、项目切换、modal 和主题切换无整壳闪烁、白屏或布局抖动。
- 更新 `docs/reviews/`，逐页记录基线、结果、允许差异和复现命令。
- **Exit：** 所有页面和状态通过 Gate，manifest 无 pending 项，计划状态改为 `completed`。

## Execution Order And Commit Boundaries

执行顺序固定为 `V0 -> V1 -> V2 -> V3 -> V4 -> V5 -> V6`。每个单元按可独立解释的页面族拆分提交并立即推送 `dev`；不得等待全部页面完成后一次提交。每次提交只暂存本单元文件，不包含 `.artifacts/` 或 `test-results/`。

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
- [ ] V0：冻结基线与视觉合同。
- [ ] V1：全局 token、画布、导航与基础原语。
- [ ] V2：工作台、消息、搜索与个人资料。
- [ ] V3：项目、周期、资源与个人分析。
- [ ] V4：工作项列表与详情协作。
- [ ] V5：系统管理页面。
- [ ] V6：双宿主响应式回归与收口。
