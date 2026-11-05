# 元策 UI v3 回迁 React 生产实现 任务

输入：`spec.md`、`plan.md`

状态：待执行

## 维护与执行约束

- 已有任务先读取再增量维护，保留稳定 ID、完成状态、人工备注和验证证据；不复制模板覆盖旧任务。
- 每项任务写清需求编号、文件范围、依赖和可验证结果；只在真实依赖或用户场景需要时拆阶段。
- 必须包含匹配风险的验证任务，可复用已有测试、构建或静态检查；不要求每项修改新增测试，也不默认要求 TDD。
- `[P]` 仅表示无未完成依赖且文件无交集；并行写入还必须隔离 worktree，并显式使用不同需求目录。
- 代码 review、真实验证和运行/部署授权不能由 analyze、converge 或主 agent 自评替代。
- 每个阶段自成闭环：实现 → 验证 → 提交；未通过验证不得进入下一阶段。

## 阶段一：P0 视觉护栏（所有后续阶段的前提）

- [ ] T001 FR-012 [US2] 新增 `frontend/test/visual-contract-anchors.test.mjs`：
  读 `frontend/parity/main-web-visual-contract.json` 的 `stableAnchors` / `geometryAnchors`，
  提取选择器中的类名与 id，在 `frontend/packages/app-shell/src/**` 与 `frontend/packages/ui/src/**`
  源码中检索；缺失即失败。依赖：无。验收：人为删除一个已登记锚点后该测试失败。
- [ ] T002 FR-012 [US2] 新增 `web/e2e/visual-regression.spec.mjs`：
  沿用 `web/playwright.config.js` 现有设施，覆盖设计稿声明的视口宽度与主要页面，
  截图基线按 Playwright 默认落在 spec 同级 `*-snapshots/` 并入库。依赖：T001。
  验收：首次运行全绿，基线文件进入版本库。
- [ ] T003 验证：运行 `npm --prefix frontend run check` 与 `npm --prefix web run test:e2e`。
  验收：19 项 parity 校验保持通过；新增锚点校验与截图回归可用。

**Checkpoint**：护栏就位，后续 DOM 改动可自动发现回归。

## 阶段二：P1 令牌归一

- [ ] T004 FR-001 FR-002 [US3] 新增 `frontend/packages/ui/src/tokens.css`：
  承载 `ui-v3/` 定稿的浅色与深色两组令牌（颜色、间距、字号、圆角、阴影、动效、层级），
  命名沿用 `--yc-*` 以避免大面积改名。依赖：T001-T003。验收：令牌完整、无重复定义。
- [ ] T005 FR-001 [US3] `frontend/packages/ui/src/styles.css` 改为 `@import './tokens.css'` 后继续定义组件样式，
  移除其内重复的 `:root` 令牌块。依赖：T004。验收：样式表无重复令牌定义。
- [ ] T006 FR-001 [US3] `ui-v3/styles/tokens.css` 改为引用生产令牌，原型服务根由 `ui-v3/` 调整为仓库根；
  同步 `ui-v3/README.md` 与 `ui-v3/index.html` 的启动说明。依赖：T004。
  验收：脚本比对原型与生产令牌值完全一致。
- [ ] T007 验证：运行 `npm --prefix frontend run check`、`npm --prefix web run check`，并截图比对原型与生产。
  验收：全部通过；令牌只有一处来源。

**Checkpoint**：令牌单一来源达成。

## 阶段三：P2 组件换皮

- [ ] T008 FR-003 FR-004 [US1] 重做既有组件皮肤，不改 DOM 与 props：
  Button / TextInput / TextArea / Select / Field / FilterBar / FilterField / Badge / PriorityBadge /
  DataTable / Pagination / PaginatedList / PaginatedTable / ContentTabs / ContentTab / Modal / Skeleton /
  Feedback / ErrorToast / UserAvatar。文件：`frontend/packages/ui/src/primitives.jsx`、`styles.css`。
  注意：`Select` 已是自绘下拉，只换皮不重写，保留 `searchable` 模式。依赖：T007。
  验收：组件表现与 `ui-v3/` 一致；原生控件残留为 0。
- [ ] T009 FR-003 [US1] 新增设计稿用到而现有没有的组件：Card、Panel（head/body/foot）、
  Metric（磁贴指标卡）、StatusPill、ProgressBar、IconTile、EmptyState；
  从 `frontend/packages/ui/src/index.js` 导出。依赖：T008。
  验收：新增组件在 `app-shell` 中可用且有单测或 e2e 覆盖。
- [ ] T010 FR-004 [US1] 清除残留的浏览器原生控件外观（搜索清除按钮等），
  确认图标全部为 SVG、无 emoji。依赖：T008。验收：源码中无针对原生控件外观的补丁残留需求。
- [ ] T011 验证：运行 `npm --prefix frontend run check`、`npm --prefix web run check`；
  浏览器端与桌面端各截一轮图并排比对设计稿。依赖：T009-T010。
  验收：全部通过；两端表现一致；观感达到设计稿水平。

**Checkpoint**：约七成视觉改善落地，DOM 未动。

## 阶段四：P3 壳层改造

- [ ] T012 FR-005 [US1] 新增 `frontend/packages/ui/src/app-sidebar.jsx`：
  分组侧栏（概览 / 项目 / 交付 / 协作 / 工具 / 系统）、活动态指示、当前项目切换入口，
  「时间管理」作为常规导航项并标注沿用现有实现；从 `index.js` 导出。
  依赖：T011。验收：侧栏渲染正确，键盘可达。
- [ ] T013 FR-005 [US1] `frontend/packages/app-shell/src/app.jsx` 壳层由「顶部导航 + 主区」改为
  「侧栏 + 顶栏 + 主区」；顶栏收敛为搜索、项目切换、通知、账户，
  移除「桌面端下载」与系统管理下拉（内容迁入侧栏）。
  文件：`app.jsx`、`application.css`、`app-skeleton.jsx`（骨架屏同步侧栏）。依赖：T012。
  验收：四档视口无溢出、无遮挡。
- [ ] T014 FR-011 [US4] 同步 parity 视觉合同的 4 项硬编码值：
  `globalShell.regionOrder`、`tokens.topbarHeight`、`breakpoints`、`viewports`；
  同步 `frontend/test/main-web-visual-contract.test.mjs` 中对应的硬编码常量。
  文件：`frontend/parity/main-web-visual-contract.json`、该测试文件。依赖：T013。
  验收：`npm --prefix frontend run check` 通过。
- [ ] T015 验证：运行 `npm --prefix frontend run check`、`npm --prefix web run test:e2e`；
  桌面端启动后走查深浅两色。依赖：T014。
  验收：31 页双向闭合保持；两端一致。

**Checkpoint**：壳层形态切换完成。

## 阶段五：P4 页面改造

> 每页独立提交、独立验证、独立同步合同条目。顺序：工作台 → 项目列表 → 工作项列表 → 工作项详情 →
> 资料库与资料详情 → 消息中心 → 全局搜索 → 个人中心 → 系统管理各子页。

- [ ] T016 FR-006 FR-007 [US1] 工作台：指标条 + 项目推进紧凑表 + 我的待处理 + 右侧活动流。
- [ ] T017 FR-006 [US1] 项目列表：表格改为卡片网格（本阶段 DOM 变化最大，单独验证）。
- [ ] T018 FR-006 FR-007 [US1] 工作项列表：需求/任务/Bug 拆分列、勾选批量操作条、状态胶囊与形状优先级。
- [ ] T019 FR-006 [US1] 工作项详情：主栏（描述/讨论/附件）+ 右侧属性栏分栏。
- [ ] T020 FR-006 [US1] 资料库与资料详情：卡片列表与正文阅读排版。
- [ ] T021 FR-006 FR-007 [US1] 消息中心：分类筛选、未读双通道表达。
- [ ] T022 FR-006 [US1] 全局搜索：结果按类型分组、范围筛选。
- [ ] T023 FR-006 [US1] 个人中心：信息分组与偏好设置。
- [ ] T024 FR-006 [US1] 系统管理各子页：总览、用户、角色权限、权限目录、对象存储、审计日志、发布记录、数据库统计。
- [ ] T025 FR-011 [US4] 逐页同步 `frontend/parity/main-web-visual-contract.json` 的
  `regionOrder` / `stableAnchors` / `geometryAnchors` / `computedStyleProperties` / `responsiveExpectations`，
  以及 `frontend/parity/experience-manifest.json` 同 `id` 条目的 `evidence` 与 `responsiveStates`。
  依赖：T016-T024 逐页进行，与对应页面任务同批提交。
- [ ] T026 FR-014 [US1] 确认附件、富文本、评论、时间分配甘特图仅做皮肤调整未改行为；
  时间管理页面内容未改动。依赖：T024。
- [ ] T027 验证：每页执行 `npm --prefix frontend run check` 与 `npm --prefix web run test:e2e`；
  全阶段结束后执行 `make frontend-check` 与 `make web-build`。依赖：T025-T026。
  验收：全部通过；两端逐视口无溢出；锚点校验与截图回归全绿。

**Checkpoint**：各页结构对齐设计稿。

## 阶段六：P5 暗色与收尾

- [ ] T028 FR-002 FR-014 [US1] 依据设计稿补齐暗色主题规格（属 `ui-v3/` 设计侧工作，需先完成）。
- [ ] T029 FR-002 [US1] 暗色主题逐页走查，重点是表格、状态胶囊、下拉浮层、弹层、富文本与附件预览。
- [ ] T030 FR-015 [US1] 更新 `ui-v3/DESIGN-NOTES.md` 的回迁记录；
  独立复核结论写入 `docs/reviews/`。
- [ ] T031 验证：全量 `make frontend-check`、`make web-build`；两端逐视口截图；暗浅两色对照。
  验收：全部通过；对比度在两色下均不低于 4.5:1。

## 复核与交付

- [ ] T032 按风险完成代码审查；P3 与 P4 属跨模块变更，安排独立复核并记录到 `docs/reviews/`。
- [ ] T033 执行最终聚焦验证、检查 diff 与 Runbook 一致性，按授权范围提交推送；不自动部署。

## 验收证据

待执行。完成时记录实际命令、结果、关键边界、失败/跳过/未验证项和提交。

## 已知环境问题（非本特性引入）

- `make frontend-check` 的 desktop 段因本机 `desktop/node_modules/typescript` 缺失而无法执行（`tsc: command not found`）。
  需补齐依赖后单独复核；在补齐前，desktop 侧只能靠启动应用人工走查，不能宣称已自动验证。
