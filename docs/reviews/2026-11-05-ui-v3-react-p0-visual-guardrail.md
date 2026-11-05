# UI v3 回迁 P0 视觉护栏 复核记录

- 规格：`specs/ui-v3-react/spec.md`
- 方案：`specs/ui-v3-react/plan.md`（阶段一 P0）
- 任务：`specs/ui-v3-react/tasks.md`（T001 / T001b / T002 / T003）
- 复核日期：2026-11-05

## 结论

**通过。** P0 的三项交付全部落地并真实执行验证：

1. 锚点存在性静态校验（`frontend/test/visual-contract-anchors.test.mjs`）
2. 视觉合同失效锚点修正（`frontend/parity/main-web-visual-contract.json`，9 个页面共 12 个失效类名）
3. 运行时视觉回归护栏（`web/e2e/visual-regression.spec.mjs` + 16 张入库像素基线）

护栏在落地过程中发现了 3 类真实问题，均已在本阶段修复或显式记录。

## 为什么要先建护栏

`frontend/parity/main-web-visual-contract.json` 登记了 31 个页面的 `stableAnchors` / `geometryAnchors`，
但既有校验（`frontend/test/main-web-visual-contract.test.mjs`，6 项）全部是**静态结构校验**：
只检查「你登记的东西是否自洽、是否在白名单内」，**不检查这些选择器在真实 DOM 中是否存在**。

仓库内也没有入库的截图基线——视觉基线只落在 `.artifacts/visual-parity/main/`（不入库），
采集需要 cargo + git worktree + agent-browser，实际上无法作为日常门禁。

结论：UI 回迁要重写壳层与页面 DOM（换侧栏、换表格、换卡片），
但改动前没有任何机制能发现「合同登记的锚点被改名或删除」。
P0 的目标就是补上这个缺口，且护栏必须能在当前实现上跑绿，否则会被无视。

## 护栏设计

### 静态层：锚点存在性（`frontend/test/visual-contract-anchors.test.mjs`）

把选择器拆成类名 / id / 标签 / 属性片段，在**当前真正提供该路由的实现**里检索：

| 范围 | 内容 |
|---|---|
| `frontend/packages/app-shell/src` | React 共享应用（浏览器端与桌面端同一套） |
| `frontend/packages/ui/src` | 基础组件库 |
| `api/templates`、`api/static`、`api/src/web` | 仍由服务端渲染的边界页（登录、初始化、设备授权、下载、API 文档） |
| `web/index.html` | 共享应用入口 HTML |

两条关键规则：

- **类名必须挂在元素上才算存在。** 样式表里残留同名规则不算数。
  实现细节：只从 `class` / `className` 属性取值，不从 CSS 选择器取值。
  （第一版把 CSS 规则也算进去，导致「删了 JSX、留着 CSS」这类改动漏检，已修正。）
- **校验对象是当前实现，不是历史基线。** legacy 服务端模板已在正式 Web 切换中退役，
  历史基线里的类名对不上时应当**修正合同**，而不是放宽校验。

### 运行时层：结构 + 像素（`web/e2e/visual-regression.spec.mjs`）

- **结构层**：20 个共享应用页面 × 5 档宽度（合同 4 档 + 设计稿最小支持宽度 375），
  断言无横向溢出、唯一 `h1`、合同登记的全部锚点仍在 DOM 中。
  这一层与数据无关，随 `npm --prefix web run test:e2e` 一起跑。
- **像素层**：4 个代表性页面 × 合同 4 档视口截图，基线落在 `web/e2e/visual-regression.spec.mjs-snapshots/` 并入库；
  动态内容按合同 `dynamicMasks`、类名规则（时间戳、头像等）与文本规则（绝对时间、相对时间）三重屏蔽，
  `maxDiffPixelRatio: 0.02`。

**像素基线必须独立运行。** 最初把像素层放进主配置，结果在全量套件里失败：
功能用例会切换「当前项目」、增删工作项与评论，共享一份数据时基线随执行顺序漂移。
修法：新增 `web/playwright.visual.config.js`，给视觉回归单独开一份服务与一份全新种子数据
（独立端口 33037、独立数据目录 `.artifacts/web-e2e-visual`），由 `npm --prefix web run test:visual` 单独触发；
主配置加载同一个 spec 时跳过像素层，只跑与顺序无关的结构层。

## 实施中发现并修复的问题

### 1. 视觉合同有 12 个失效类名（9 个页面）

legacy 服务端模板退役后，React 实现沿用了大部分旧类名，但有 12 处没有沿用。合同因此在描述一个不存在的 DOM。

| 页面 | 失效锚点 | 修正为 |
|---|---|---|
| `page.project.detail` | `.metrics` / `.tabs` / `.overview-grid` | `.project-detail-metrics` / `.project-tabs-card` / `.project-detail-overview` |
| `page.project.cycle-detail` | `.cycle-grid` | `.cycle-detail-overview` |
| `page.project.resource-detail` | `.resource-hero` / `.resource-layout` | `.resource-reader-header` / `.resource-content-card` |
| `page.project.personal-analysis` | `.metrics` / `.analysis-grid` / `.page-heading` | `.personal-analysis-output` / `.analysis-columns` / `.analysis-header` |
| `page.work-item-list.*` | `.metrics` / `.work-item-filters` / `.compact-table` | `.work-item-list-metrics` / `.work-item-filter-bar` / `.work-item-table` |
| `page.system.users` | `.compact-table` | `.yc-table` |
| `page.system.storage` | `.storage-version-list` | `.storage-versions-panel` |

同时把这 6 个页面的 `baselineSources` 从已删除的 legacy 模板改为 React 侧真实来源文件。

其中 `.storage-version-list` 换掉的原因是状态相关：对象存储没有配置时渲染 `.storage-empty`，
版本列表不出现；`.storage-versions-panel` 是常驻容器。
数据库统计页的 `.database-stats-toolbar` / `.yc-table` 同样状态相关，
但它可以主动推进到有数据状态（点击「刷新」读取宿主快照），所以在护栏里用 `prepare` 钩子驱动，而不是放宽合同。

### 2. 两个页面缺少 `h1`

- **工作项列表页**（需求 / 任务 / Bug）：页面标题是 `<h2 id="work-item-center-title">`，
  与其余页面用 `h1` 不一致，页面缺少 `h1` 层级入口。
  修法：改为 `<h1 id="work-item-center-title" ref={headingRef} tabIndex={-1}>`。
  样式不受影响——`application.css` 已有 `.panel-head h1, .panel-head h2 { ... }` 同一条规则。
- **系统管理总览**：整个页面没有任何标题元素。
  修法：补 `shell-panel-header` 区块与 `<h1 id="system-dashboard-title">`，与其余系统页一致。

这既是护栏发现的缺陷，也是 `ui-v3/` 设计稿已经确立的约定（每个页面恰好一个 `h1`），
回迁后必须保持，因此在本阶段一次性修掉，避免 P4 逐页改造时重复处理。

### 3. 既有 e2e 套件存在失败，与本阶段无关

首次跑 `e2e/app-shell.spec.mjs` 时有 4 条失败，全量套件里失败更多。
用 A/B 对照确认了归属：把本阶段改动运行时相关的三个文件
（`frontend/packages/app-shell/src/app.jsx`、`web/e2e/app-shell.spec.mjs`、
`web/e2e/session-recovery-skeleton.spec.mjs`）暂存回退后重跑同一组失败用例，
**结果完全相同**——即这些失败在本阶段之前就存在。

根因是 e2e 用例与当前演示数据之间的既有漂移：
`ensureCurrentProject()` 会去项目列表里找编号为 `YCE` 的项目行并点「设为当前项目」，
但当前演示种子已经不再创建编号为 `YCE` 的项目（种子里的项目编号是 TRAIN / OPEN / IM / PAY / IOT / OA 等），
于是该辅助函数永远等不到目标行，60 秒超时。
工作项详情页的 `评论与流转` 标题层级也与用例断言不一致。

> 更正记录：本文件初版把原因写成「`.project-row` 只存在于历史样式里」，
> 实际该类名在 `frontend/packages/app-shell/src/app.jsx` 的项目卡片上仍在使用，
> 失效的是用例依赖的 `YCE` 项目编号，不是类名。

本阶段顺带修正了其中与 `h1` 层级直接相关的断言
（`app-shell.spec.mjs` 7 处、`session-recovery-skeleton.spec.mjs` 1 处，
工作项列表页标题由 `h2` 改为 `h1` 后同步更新）；
`ensureCurrentProject` 与工作项详情结构的漂移不在本阶段范围，单独跟进。

## 验证记录

| 验证项 | 命令 | 结果 |
|---|---|---|
| 前端全量检查 | `npm --prefix frontend run check` | 通过（54 项测试 0 失败，含新增 3 项锚点校验） |
| Web 全量检查 | `npm --prefix web run check` | 通过（68 项测试 0 失败） |
| 锚点护栏有效性 | 人为把 `app.jsx` 中 `project-detail-overview` 全部改名后重跑 | 按预期失败，报出 `page.project.detail` 的 stable / geometry 两条锚点失效；还原后全绿 |
| 视觉回归（建基线） | `npm --prefix web run test:visual -- --update-snapshots` | 9 项通过，16 张基线重新生成 |
| 视觉回归（跨实例纯对比） | `npm --prefix web run test:visual` | 9 项通过；本次是**全新服务 + 全新种子数据**，与上一轮基线逐像素一致 |
| 既有失败归属 A/B | 暂存回退 3 个运行时相关文件后重跑同一组失败用例 | 结果完全相同，确认属既有漂移 |

## 已知环境问题

1. **`make frontend-check` 的 desktop 段无法执行**：`desktop/node_modules/typescript` 未安装，`tsc` 命令缺失。
   与本阶段无关（未触及 desktop），需补齐依赖后单独复核。
2. **既有 e2e 用例与 React 实现漂移**：`ensureCurrentProject()` 依赖只存在于历史样式里的 `.project-row`，
   导致依赖它的用例 60 秒超时；工作项详情页的部分标题层级与断言不一致。
   已用 A/B 对照确认与本阶段无关，需单独跟进修复。
3. **像素基线是平台相关的**：文件名带 `-darwin` 后缀，跨平台需要各自生成基线。
   仓库没有 GitHub Actions（按 `AGENTS.md` 约束），基线只对本地发版前校验有效。
   结构层护栏（溢出 / `h1` / 锚点）不依赖平台，始终有效。
4. **像素基线需要独立运行**：`npm --prefix web run test:e2e` 不再跑像素层，
   像素层由 `npm --prefix web run test:visual` 单独触发（独立端口、独立种子数据）。
   改了界面但只跑了 `test:e2e` 不会发现像素漂移，需要主动跑 `test:visual`。

## 对后续阶段的约束

- P3 壳层改造与 P4 页面改造每改一处 DOM，**必须同步 `frontend/parity/main-web-visual-contract.json` 的
  `stableAnchors` / `geometryAnchors` / `regionOrder` / `responsiveExpectations`**，
  并让 `npm --prefix frontend run check` 与 `npm --prefix web run test:e2e` 同时为绿。
  合同与实现不同步时，护栏会立刻失败——这正是它存在的目的。
- 合同新增锚点时，必须保证它同时满足：静态层（类名挂在元素上）与运行时层（该页该状态下真实出现）。
  只在某个状态下出现的锚点，需要在 e2e 里用 `prepare` 钩子把页面推进到该状态。
