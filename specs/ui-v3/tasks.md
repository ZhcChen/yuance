# 元策 UI v3 设计原型模块 任务

输入：`spec.md`、`plan.md`

状态：已执行（视觉基调待评审，React 回迁不在本轮范围）

## 维护与执行约束

- 已有任务先读取再增量维护，保留稳定 ID、完成状态、人工备注和验证证据；不复制模板覆盖旧任务。
- 每项任务写清需求编号、文件范围、依赖和可验证结果；只在真实依赖或用户场景需要时拆阶段。
- 必须包含匹配风险的验证任务，可复用已有测试、构建或静态检查；不要求每项修改新增测试，也不默认要求 TDD。
- `[P]` 仅表示无未完成依赖且文件无交集；并行写入还必须隔离 worktree，并显式使用不同需求目录。
- 代码 review、真实验证和运行/部署授权不能由 analyze、converge 或主 agent 自评替代。

## 阶段一：基础设施与壳层（S1-S2）

- [x] T001 [P] FR-001 FR-005 FR-006 FR-009 FR-011 建立 `ui-v3/styles/tokens.css`：颜色（surface/border/text/状态四层语义）、间距刻度 4/6/8/12/16/20/24、字号刻度 12/13/14/16/18/24、圆角、阴影、动效时长、z-index 层级；仅此文件允许出现原始色值。验收：令牌齐全且被后续样式全部引用。**结果：完成。令牌唯一来源已核对，页面样式无原始色值。**
- [x] T002 [P] FR-007 FR-008 FR-009 建立 `ui-v3/styles/base.css`：reset、排版基线、可见焦点环、对比度达标配色、响应 `prefers-reduced-motion`。验收：Tab 遍历焦点始终可见。**结果：完成。40 个焦点元素全部有可见焦点指示。**
- [x] T003 [P] FR-011 建立 `ui-v3/assets/icons.svg` 图标符号表（导航、动作、状态类），全部为 SVG path，不含 emoji。验收：图标渲染风格统一。**结果：完成。44 个 symbol，24×24 视框 1.7 描边。**
- [x] T004 FR-010 建立 `ui-v3/styles/layout.css`：左侧固定侧边栏 + 顶栏 + 内容区三段壳层布局，含 375/768/1024/1440 四档断点。验收：四档宽度下无横向撑破。**结果：完成。四档 20 路由共 80 次检查，0 溢出。**
- [x] T005 FR-001 FR-010 建立 `ui-v3/styles/components.css`：按钮、输入/选择/文本域、筛选条、数据表格、分页、徽标/状态标签、KPI 指标、标签页、弹层、空态、骨架屏。验收：表格在窄视口由横向滚动容器承载。**结果：完成。**
- [x] T006 FR-001 建立 `ui-v3/scripts/ui.js` DOM 构建原语（元素创建、类名合并、文本/属性/事件绑定、图标引用）。验收：可拼装上述全部组件。**结果：完成。含 panel/metric/dataTable/pagination/emptyState 等工厂。**
- [x] T007 FR-002 建立 `ui-v3/scripts/mock/` 静态数据：当前用户、当前项目、项目列表、工作项列表与详情、资料、消息、搜索结果、系统管理各表。验收：字段命名与 `frontend/packages/api-client` 现有响应结构对齐。**结果：完成。合并为 `scripts/mock/data.js`（偏离 plan 的分文件规划，见 review）。**
- [x] T008 FR-001 FR-002 建立 `ui-v3/index.html`、`scripts/app.js`、`scripts/shell.js`、`scripts/router.js`：单入口 + hash 路由 + 壳层渲染，路由表覆盖 spec 中全部页面 ID；时间管理入口指向现网并显式标注「沿用现有实现」。验收：点击导航可切换页面，控制台无报错。**结果：完成。20 条路由全部渲染，运行时错误 0。**

**Checkpoint**：壳层可点击且各路由可达，样式令牌生效。**已达成。**

## 阶段二：页面实现（S3-S7）

- [x] T009 [P] [US1] FR-003 FR-004 实现 `ui-v3/scripts/pages/workbench.js`：KPI 指标条 + 项目推进紧凑表格 + 我的待处理 + 最近动态，密度高于现网。验收：与现网工作台信息项一一对应且不遗漏关键操作入口。**结果：完成，已与线上只读比对。**
- [x] T010 [P] [US1] FR-004 实现 `ui-v3/scripts/pages/projects.js`：项目列表 + 项目详情（概览/资料库/周期/个人分析标签页）。验收：详情页标签可切换且内容区分明确。**结果：完成。**
- [x] T011 [P] [US1] FR-004 实现 `ui-v3/scripts/pages/work-items.js`：需求/任务/Bug 列表，含筛选条、状态/优先级标签、分页、批量选择列。验收：三种类型共用一套页面模板，仅参数不同。**结果：完成。**
- [x] T012 [P] [US1] FR-004 实现 `ui-v3/scripts/pages/work-item-detail.js`：描述区、属性区、评论时间线、附件区、状态流转操作。验收：信息层级清晰，评论与附件形态可辨。**结果：完成。**
- [x] T013 [P] [US1] FR-004 实现 `ui-v3/scripts/pages/resources.js`：资料库列表 + 资料详情阅读态。验收：资料目录层级与正文阅读排版均成立。**结果：完成。**
- [x] T014 [P] [US1] FR-004 实现 `ui-v3/scripts/pages/messages.js`：消息中心分类筛选与列表。验收：未读/已读状态同时用文字与图形表达。**结果：完成。**
- [x] T015 [P] [US1] FR-004 实现 `ui-v3/scripts/pages/search.js`：全局搜索结果分组呈现。验收：结果按类型分组且可区分。**结果：完成。**
- [x] T016 [P] [US1] FR-004 实现 `ui-v3/scripts/pages/profile.js`：个人中心信息与偏好展示。验收：信息分组清晰。**结果：完成。**
- [x] T017 [P] [US1] FR-004 实现 `ui-v3/scripts/pages/system.js`：系统管理总览 + 用户/角色权限/对象存储/审计日志/发布等子页。验收：各子页表格与筛选结构成立。**结果：完成。**

**Checkpoint**：全部页面可渲染且导航闭环。**已达成。**

## 阶段三：文档与验证（S8）

- [x] T018 [P] FR-013 编写 `ui-v3/README.md`：模块定位、启动方式（静态服务命令 + `file://` 限制说明）、页面清单、设计约定、令牌表、回迁到 `frontend/packages/ui` 的路径、原型与实现的边界声明。**结果：完成。**
- [x] T019 [P] FR-014 编写 `ui-v3/DESIGN-NOTES.md`：记录 `ui-ux-pro-max` 检索命中项、被否决方向及否决理由（营销站式 pattern、等宽字体正文、GSAP 编排动画、字段串位的配色输出）、最终采用的决策。**结果：完成。**
- [x] T020 验证：启动静态服务，逐路由截图并检查控制台与 pageerror 为空，证据存 `test-results/ui-v3/`。依赖 T008-T019。**结果：完成。20/20 路由渲染，运行时错误 0；截图存 `.artifacts/ui-v3/`（该目录为本地忽略目录，非 `test-results/`）。**
- [x] T021 验证：375/768/1024/1440 四档响应式截图走查，确认无横向撑破与元素重叠。依赖 T020。**结果：完成。80 次检查 0 溢出。**
- [x] T022 验证：键盘 Tab 遍历走查，确认焦点环可见且顺序与视觉顺序一致；正文对比度抽检 ≥ 4.5:1。依赖 T020。**结果：完成。40 个焦点元素全部可见焦点指示；18 组配色组合全部 ≥ 4.5:1。**
- [x] T023 验证：运行 `make frontend-check` 与 `make web-build`，确认通过且生产产物不含 `ui-v3`；`git diff` 确认 `docs/prototypes/time-management/index.html` 未被改动。依赖 T008-T019。**结果：`make web-build` 通过且产物不含 ui-v3；`make frontend-check` 的 web/frontend 段通过，desktop 段因 `desktop/node_modules/typescript` 缺失导致 `tsc: command not found` 中断，属既有环境问题，与本轮无关；`docs/prototypes/time-management/index.html` 未改动。**

## 阶段四：视觉重做（评审反馈后追加）

> 触发：首轮评审结论「视觉太拉垮，不如线上」。目标是把「信息结构正确但视觉平淡」改成可交付的设计稿。

- [x] T026 [P] FR-005 FR-008 重做 `ui-v3/styles/tokens.css`：改用 `ui-ux-pro-max` 命中的靛蓝主色 + 翡翠强调体系，
  新增深色侧栏色组（`--nav-*`）、7 组状态色三元组（底色/边框/文字）、四级阴影与四级圆角，
  字号刻度补 11/15/22/28。验收：令牌唯一来源，页面样式无原始色值。
- [x] T027 [P] FR-010 重做 `ui-v3/styles/layout.css`：深色渐变品牌侧栏（分组导航 + 活动项左侧指示条 + 底部账户块）、
  半透明模糊顶栏、卡片网格栅格、响应式断点调整为 1120 / 768。验收：深色侧栏与浅色内容区形成双锚点。
- [x] T028 [P] FR-010 重做 `ui-v3/styles/components.css`：层级由描边改为阴影 + 留白，
  指标卡用彩色图标磁贴 + 悬浮上浮，状态改为彩色胶囊，项目卡片新增 `.project-card` 形态，
  进度条、图标磁贴、分段控件、页面入场动效。验收：视觉不再呈「Excel 打印稿」形态。
- [x] T029 [P] FR-004 项目列表由大表格改为卡片网格（`ui-v3/scripts/pages/projects.js`），补充指标条与最近更新工作项面板；
  工作台、需求列表、消息中心、个人中心同步新视觉。验收：项目实体以卡片呈现，信息项与现网一一对应。
- [x] T030 验证：重做后复跑路由、响应式、键盘与对比度全量检查。
  **结果：20 路由 × 4 断点 0 溢出、0 运行时错误；Tab 42 步焦点指示 0 缺失；对比度 24 组全部 ≥ 4.5:1。**

## 复核与交付

- [x] T024 按风险完成代码审查；重要改动安排独立复核。**结果：完成。复核记录见 `docs/reviews/2026-11-04-ui-v3-design-prototype.md`。**
- [ ] T025 执行最终聚焦验证、检查 diff 与 Runbook 一致性，按授权范围提交推送；不自动部署。**结果：验证部分已随 T020-T023 与 T030 完成；提交待本轮收尾执行。**

## 验收证据

已执行，记录如下：

- 静态服务：`python3 -m http.server 4183 --directory ui-v3`，`/`、`/scripts/app.js`、`/assets/icons.svg` 均 200。
- 路由渲染：20 条路由逐条切换，20/20 有内容，`window.__v3Errors` 累计 0 条。
- 响应式：CDP 设定 CSS 宽度 1440 / 1024 / 767 / 375，每档 20 路由，0 次横向溢出。
- 键盘：Tab 42 步，42 个焦点元素全部有可见焦点指示，顺序与视觉顺序一致。
- 对比度：解析 `tokens.css` 逐对计算，24 组组合全部 ≥ 4.5:1（含侧栏色组）。
- 令牌完整性：`styles/*.css` 中 `var(--x)` 引用与 `tokens.css` 定义双向核对，无缺失定义。
- 构建隔离：`make web-build` 通过，`web/dist` 仅含 `index.html`、`manifest.json` 与两个 hash 资源；全仓 grep 无构建链路引用 `ui-v3`。
- 未验证项：`make frontend-check` 的 desktop 段因本地 `typescript` 依赖缺失无法执行，与本轮改动无关，需补齐依赖后单独复核。
- 截图证据：`.artifacts/ui-v3/`（final-workbench、final-projects、final-requirements、final-detail、final-messages、final-profile、final-users、final-resource，及线上现网对照图 current-workbench、current-requirements）。
