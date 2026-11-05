# 元策 UI v3 回迁 React 生产实现 实施方案

- 规格：`spec.md`
- 状态：草稿

## 技术上下文

### 现有实现（已核对）

| 位置 | 现状 | 回迁影响 |
|---|---|---|
| `frontend/packages/ui/src/styles.css` | 3640 行，`yc-*` 命名空间，`:root` 定义 `--yc-*` 令牌，含完整 `html[data-theme="dark"]` 组 | 令牌与组件皮肤的主要落点 |
| `frontend/packages/app-shell/src/application.css` | 1679 行，`shell-*` / `page-*` 命名空间，页面级布局与样式 | 页面布局的主要落点 |
| `frontend/packages/ui/src/primitives.jsx` | 464 行，导出 Button / TextInput / TextArea / Select / Field / FilterBar / FilterField / Feedback / ErrorToast / Badge / PriorityBadge / ContentTabs / ContentTab / Modal / DataTable / Pagination / PaginatedList / PaginatedTable / Skeleton | 组件换皮的主要落点。**`Select` 已是自绘下拉**（隐藏原生 select + listbox + 键盘 + searchable），只需换皮 |
| `frontend/packages/ui/src/global-navigation.jsx` | 250 行，顶部导航组件（品牌、链接、系统管理下拉、项目切换、下载入口） | 壳层改造的主要落点，v3 的左侧栏为新增形态 |
| `frontend/packages/app-shell/src/app.jsx` | 6930 行，按 `route.id` 分派页面，使用 `shell-*` / `page-*` / `metric-grid` / `page-hero` 等类名 | 页面改造的主要落点 |
| `frontend/packages/app-core/src/routes.js` | 共享路由构造与解析，route id 词表独立于 parity 的 page id | 本特性不改 |
| `web/src/app.css` | `@import` ui 与 app-shell 两份样式 | 不改 |
| `desktop/src/renderer/app.jsx` | 渲染同一个 `SharedApp` | **无法与 Web 分开生效** |
| `desktop/src/renderer/main.jsx` | 启动时按宿主偏好设置 `document.documentElement.dataset.theme` | **深色模式是既有能力** |

### Parity 事实源与校验

| 文件 | 性质 | 关键约束 |
|---|---|---|
| `frontend/parity/main-web-visual-contract.json` | 人工维护，31 页 | 顶层硬编码 `tokens.topbarHeight='58px'`、`breakpoints=[1280,1100,980,920,900,860,760,620]`、`globalShell.regionOrder=['topbar','main']`、`viewports` 四档 |
| `frontend/parity/main-web-visual-contract.schema.json` | 封闭 schema | `pages` 条目数写死 31；页面条目必填 16 字段 |
| `frontend/parity/experience-manifest.json` | 人工维护，31 页 + 动作 + 宿主差异 | 与视觉合同按 `id` 双向闭合；每条目 `status` 只能是 `shared`/`retired`；`evidence` 三类证据（browserTests / desktopTests / reviews）必须齐备；`route+method` 只能被一个 owner 登记；page 的 `methods` 只能 `['GET']` |
| `frontend/parity/legacy-source-inventory.json` | **脚本生成** | 必须与 `api/src/web/router.rs` 路由与 `api/templates/web` 模板实时一致；本特性不改 Rust 侧则无需重生成 |
| `frontend/parity/interaction-marker-classification.json` | **脚本生成** | 随 inventory；本特性不动模板则无需重生成 |

校验入口：`npm --prefix frontend run check` → `test` 步骤，4 个文件共 19 项 parity 相关用例，**全部是静态结构校验，不运行浏览器**。

### 已确认的护栏盲区

- `stableAnchors` / `geometryAnchors` 只是登记的 CSS 选择器字符串，**没有任何测试验证它们在真实 DOM 中存在**。
- 仓库内**没有**入库的截图 golden，也没有 `toHaveScreenshot` 断言；视觉基线截图只落在 `.artifacts/visual-parity/main/`（不入库），
  采集命令 `npm --prefix web run capture:main-visual` 需要 cargo + git + agent-browser。
- Parity 页面清单与 `app-core` 的 route id **无机器对应关系**，只靠人工约定。

## 规范与约束核对

- `AGENTS.md`：中型及以上走 `specify → clarify → plan → tasks → analyze → implement → converge`；文档与注释用简体中文；
  仓库相对路径；不擅自建分支、部署；重要改动写 `docs/reviews/`。
- `AGENTS.md` 执行规则：必须包含匹配风险的验证任务并真实执行，勾选与静态检查不算验收。
- `.specify/memory/constitution.md`：规格描述业务结果不提前规定结构；设计尊重现有系统边界；
  验证匹配风险；权限边界内不切分支、不部署。
- `docs/standards/` 与 `docs/runbooks/`：本特性涉及前端构建与 e2e，验证入口沿用 `make frontend-check`、
  `npm --prefix web run test:e2e`；Docker 与本地开发仍走 `make dev-*` 与 `scripts/ops/local-docker.cjs`，本特性不需要。
- 安全边界：UI 变更不触及鉴权、数据写入与接口契约；时间管理页面内容不改。
- Git：默认在当前分支开发，按小闭环提交并推送；提交前 `git diff --check`；不混入无关改动。

## 实现方案与文件范围

### 总体策略

**不做一次性全量回迁。** 依据：

1. Parity 合同是人工维护的静态数据，31 页条目需要逐页手改并保持双向闭合；一次性全改会让它失去可核对性。
2. Web 与 Desktop 共用同一套包，任何改动同时作用于两端，回归面翻倍且无法分端灰度。
3. 设计稿的深色主题尚未产出，全量回迁等于回迁一个未定稿的设计。
4. 现有校验不构成视觉护栏（见上），大改 DOM 缺少发现手段。

因此按 **6 个可独立交付、独立验证、独立回滚的阶段**推进：

| 阶段 | 名称 | 是否改 DOM | 改 parity | 交付价值 |
|---|---|---|---|---|
| P0 | 建立视觉护栏 | 否 | 否 | 让后续所有阶段可自动发现回归 |
| P1 | 令牌归一 | 否 | 否 | 设计稿与生产共用一份令牌 |
| P2 | 组件换皮 | 否 | 少量（令牌硬编码值） | 约七成视觉改善，零结构风险 |
| P3 | 壳层改造 | 是（新增侧栏） | 是（globalShell 等 4 项） | 一级导航形态变更 |
| P4 | 页面改造 | 是（逐页） | 是（逐页条目） | 各页信息结构与布局对齐设计稿 |
| P5 | 暗色与收尾 | 否 | 否 | 深色可用、两端一致、文档沉淀 |

P2 先行是刻意的：视觉改善的主要来源是「阴影 + 留白 + 降饱和 + 单色磁贴」这套质感，
它几乎全部落在令牌与组件皮肤上，不需要动任何 DOM。P2 完成后即可评审观感是否达标，
再决定是否投入 P3/P4 的结构改造。

### P0：建立视觉护栏

新增两件此前不存在的能力：

1. **锚点存在性静态校验**（进 `frontend/test/`，随 `npm --prefix frontend run check` 执行）
   读 `main-web-visual-contract.json` 的 `stableAnchors` / `geometryAnchors`，
   把选择器拆成类名 / id / 标签 / 属性片段，在「当前真正提供该路由的实现」里检索：
   React 生产实现（`frontend/packages/app-shell/src`、`frontend/packages/ui/src`）、
   仍由服务端渲染的边界页模板与静态样式（`api/templates`、`api/static`、`api/src/web`）、
   共享应用入口 HTML（`web/index.html`）。
   选静态方案而非运行时方案的原因：运行时方案需要起完整服务才能跑，而锚点漂移绝大多数是源码级改名，静态检索即可覆盖；
   且静态校验可以进常规 `check`，不像 e2e 那样只在发版前跑。

   **类名必须挂在元素上才算存在**：样式表里残留同名规则不算数，否则「删了 JSX、留着 CSS」
   这类改动会漏检。

   **校验对象是当前实现，不是历史基线。** legacy 服务端模板已在正式 Web 切换中退役，
   历史基线里的类名对不上时应当修正合同，而不是放宽校验——护栏只有在能失败时才有价值。
   实施中发现合同里有 8 个失效类名（5 个页面、20 处引用），已在 P0 内一并修正为 React 侧真实类名。

2. **视觉回归 e2e**（进 `web/e2e/`）
   沿用现有 Playwright 设施（`web/playwright.config.js`，`testDir: ./e2e`，
   `webServer` 走 `scripts/start-web-e2e-server.sh`），分两层：
   - **结构层**：20 个共享应用页面 × 5 档宽度（合同 4 档 + 设计稿最小支持宽度 375），
     断言无横向溢出、唯一 `h1`、合同登记的几何锚点仍在 DOM 中。这一层抗脆弱，挡住结构塌陷，
     与数据无关，随 `npm --prefix web run test:e2e` 一起跑。
   - **像素层**：4 个代表性页面 × 合同 4 档视口截图，基线落在 spec 同级 `*-snapshots/` 并入库；
     动态内容按合同 `dynamicMasks`、类名规则与文本规则三重屏蔽。
     像素基线不能与功能用例共用一份数据（当前项目与工作项会被改动，基线随执行顺序漂移），
     因此另给一份配置 `web/playwright.visual.config.js`：独立端口、独立种子数据目录，
     由 `npm --prefix web run test:visual` 单独触发。

文件范围：新增 `frontend/test/visual-contract-anchors.test.mjs`、
`web/e2e/visual-regression.spec.mjs`、`web/playwright.visual.config.js` 与其截图基线；
修正 `frontend/parity/main-web-visual-contract.json` 中失效锚点与 `baselineSources`；
修复工作项列表页与系统管理总览页缺失的 `h1`。

### P1：令牌归一

- 抽出 `frontend/packages/ui/src/tokens.css` 作为令牌唯一来源，承载浅色与深色两组。
- `frontend/packages/ui/src/styles.css` 改为 `@import './tokens.css'` 后继续定义组件样式。
- `ui-v3/styles/tokens.css` 改为引用同一份生产令牌（原型改为以仓库根为服务根，
  引用 `../frontend/packages/ui/src/tokens.css`），使设计稿与生产不再有两份令牌。
- 令牌命名从 `--yc-*` 保持不变，避免大面积改名带来的回归面。

文件范围：新增 `frontend/packages/ui/src/tokens.css`；改 `frontend/packages/ui/src/styles.css`、
`ui-v3/styles/tokens.css`、`ui-v3/index.html`（服务根调整说明）、`ui-v3/README.md`。

### P2：组件换皮

按设计稿规格重做既有组件皮肤，不改 DOM 结构、不改 props、不改行为：

Button / TextInput / TextArea / Select / Field / FilterBar / FilterField / Badge / PriorityBadge /
DataTable / Pagination / PaginatedList / PaginatedTable / ContentTabs / ContentTab / Modal / Skeleton /
Feedback / ErrorToast / UserAvatar。

新增设计稿用到但现有没有的组件：Card、Panel（带 head/body/foot）、Metric（彩色磁贴指标卡）、
StatusPill（状态胶囊）、ProgressBar、IconTile、EmptyState。

注意：`Select` 已是自绘下拉，**只换皮不重写**；其 `searchable` 模式保留。

文件范围：`frontend/packages/ui/src/primitives.jsx`、`frontend/packages/ui/src/styles.css`、
`frontend/packages/ui/src/index.js`（导出新增组件）；`frontend/packages/ui/src/global-navigation.jsx`（顶部导航换肤）。

### P3：壳层改造

- 新增 `frontend/packages/ui/src/app-sidebar.jsx`：分组侧栏（概览 / 项目 / 交付 / 协作 / 工具 / 系统）、
  活动态指示、当前项目切换入口、「时间管理」作为常规导航项并标注沿用现有实现。
- `frontend/packages/app-shell/src/app.jsx` 的壳层区域由「顶部导航 + 主区」改为「侧栏 + 顶栏 + 主区」。
- 顶栏收敛为搜索、项目切换、通知、账户；移除「桌面端下载」与系统管理下拉（其内容迁入侧栏）。
- 同步 parity 视觉合同的 4 项硬编码值：`globalShell.regionOrder`、`tokens.topbarHeight`、
  `breakpoints`、`viewports`；同步 `frontend/test/main-web-visual-contract.test.mjs` 中对应的硬编码常量。

文件范围：新增 `frontend/packages/ui/src/app-sidebar.jsx`；改 `frontend/packages/ui/src/index.js`、
`frontend/packages/app-shell/src/app.jsx`、`frontend/packages/app-shell/src/application.css`、
`frontend/packages/app-shell/src/app-skeleton.jsx`（骨架屏同步侧栏）、
`frontend/parity/main-web-visual-contract.json`、`frontend/test/main-web-visual-contract.test.mjs`。

### P4：页面改造

按页推进，每页独立提交、独立验证、独立同步合同条目：

工作台 → 项目列表 → 工作项列表 → 工作项详情 → 资料库与资料详情 → 消息中心 → 全局搜索 → 个人中心 → 系统管理各子页。

每页改造时同步更新 `frontend/parity/main-web-visual-contract.json` 中该页的
`regionOrder` / `stableAnchors` / `geometryAnchors` / `computedStyleProperties` / `responsiveExpectations`，
以及 `frontend/parity/experience-manifest.json` 中同 `id` 条目的 `evidence` 与 `responsiveStates`。

项目列表由表格改为卡片网格是本阶段 DOM 变化最大的一页，单独验证。

文件范围：`frontend/packages/app-shell/src/app.jsx`（页面结构）、
`frontend/packages/app-shell/src/application.css`（页面样式）、上述两份 parity JSON。

### P5：暗色与收尾

- 依据设计稿补齐暗色主题规格（属 `ui-v3/` 设计侧工作，需先完成）。
- 深色下逐页走查，重点是表格、状态胶囊、下拉浮层、弹层、富文本与附件预览。
- 两端（浏览器、桌面）回归，结论写入 `docs/reviews/`。

## 阶段与依赖

```
P0 护栏 ──┬──> P1 令牌 ──> P2 组件换皮 ──┬──> P3 壳层 ──> P4 页面 ──> P5 暗色收尾
          │                                │
          └────────────────────────────────┘  （P0 完成后可并行开始 P1）
```

- P0 是所有后续阶段的前提：没有护栏就不具备改动 DOM 的条件。
- P1 → P2 → P3 → P4 有严格依赖：令牌先于组件，组件先于壳层，壳层先于页面。
  页面按 P4 内部顺序逐页推进，每页自成闭环。
- P3 与 P4 是否合并执行需在实施前确认（见 `spec.md` 未决事项）：
  合并可减少一次布局返工，但会使 parity 合同一次性变更面扩大到 31 页。

## 验证与验收

| 阶段 | 验证命令 | 通过标准 |
|---|---|---|
| P0 | `npm --prefix frontend run check`；`npm --prefix web run test:e2e` | 锚点校验能发现人为删除的锚点；截图基线入库且首次全绿 |
| P1 | `npm --prefix frontend run check`；`npm --prefix web run check` | 令牌无重复定义；原型与生产令牌值一致（脚本比对） |
| P2 | `npm --prefix frontend run check`；`npm --prefix web run check`；两端截图 | 组件表现与设计稿一致；两端无差异 |
| P3 | `npm --prefix frontend run check`；`npm --prefix web run test:e2e`；桌面端启动走查 | parity 31 页双向闭合保持；4 项硬编码值与实现一致；侧栏在 4 档视口无溢出 |
| P4 | 同上 + 逐页锚点与截图比对 | 每页合同条目与实现一致；两页之间无交叉破坏 |
| P5 | 全量：`make frontend-check`、`make web-build`、两端逐视口截图 | 浅色深色均达标；`make frontend-check` 全绿 |

失败场景必须明确记录为未通过，不得以「基本可用」代替。截图证据落 `.artifacts/`，结论写入 `docs/reviews/`。

## 运行与恢复

- 本特性无数据库迁移、无接口变更、无部署。
- 本地验证沿用 `make dev-*` 与 `npm --prefix web run test:e2e`；不涉及 Docker（若 e2e 需要则按
  `docs/runbooks/local-development.md` 走 `scripts/ops/local-docker.cjs`）。
- 每阶段独立提交，回滚方式为 revert 对应阶段提交；P3 与 P4 的结构改动涉及 parity JSON，
  回滚时必须同时回滚 JSON 与测试常量，否则 `npm --prefix frontend run check` 会失败。
- 部署不在本特性默认授权范围内。
