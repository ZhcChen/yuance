# 元策 UI v3 设计原型 复核记录

## 标题信息

- 主题：UI v3 设计原型模块（`ui-v3/`）的规格、方案、实现与可访问性复核
- 关联计划：`specs/ui-v3/spec.md`、`specs/ui-v3/plan.md`、`specs/ui-v3/tasks.md`
- 审查范围：`ui-v3/` 全部新增文件；`web/`、`frontend/`、`desktop/`、`api/` 未被修改
- 负责人：Droid（主 agent 自评 + 真实浏览器走查）
- 日期：2026-11-04

## 目标对齐

对照 `specs/ui-v3/spec.md` 的 FR-001 ~ FR-014 与 SC-001 ~ SC-006：

- 产出形态必须是零构建、零依赖的纯 HTML + CSS + 原生 JS 独立模块
- 数据必须是静态 mock，不请求后端
- 必须覆盖全部业务页面，时间管理页面内容不在范围内
- 设计令牌必须集中、字号与间距必须用统一刻度
- 必须满足可访问性、对比度、响应式、动效降级要求
- 不得污染生产构建链路

## 已执行验证

### 命令

| 命令 | 结果 |
|---|---|
| `python3 -m http.server 4183 --directory ui-v3` | 启动成功，`/`、`/scripts/app.js`、`/assets/icons.svg` 均返回 200 |
| `make web-build` | 通过。产物 `web/dist/` 仅含 `index.html`、`manifest.json` 与两个 hash 资源，**不含 ui-v3** |
| `make frontend-check` | `web` 与 `frontend` 两段通过（51 项测试全绿）；`desktop` 段因 `tsc: command not found` 中断 |
| `grep -rn "ui-v3" web/ desktop/ frontend/ scripts/ api/` | 无任何构建或运行链路引用 `ui-v3` |
| `git status --short` | `docs/prototypes/time-management/index.html` 与 `desktop/build/*` 等既有未提交改动未被本轮触碰 |

### 浏览器走查（ego-browser，真实渲染）

| 检查项 | 方法 | 结果 |
|---|---|---|
| 20 条路由渲染 | 逐条切换 hash 并读取 `#view` 内容长度与 `h1` | 20/20 渲染出内容，无空白页 |
| 运行时错误 | `index.html` 内联脚本采集 `window.onerror` 与 `unhandledrejection` | 全部路由累计 0 条 |
| 响应式 | CDP 设定 CSS 宽度 1440 / 1024 / 767 / 375，每档跑 20 条路由 | 80 次检查，**0 次横向溢出** |
| 键盘可达 | Tab 连按 40 次，读取 `activeElement` 的 `:focus-visible` 与焦点指示 | 40 个焦点元素全部有可见焦点指示（34 个 outline，6 个 box-shadow），tab 顺序与视觉顺序一致 |
| 对比度 | Node 脚本解析 `tokens.css`，逐对计算 WCAG 比值 | 18 组配色组合全部 ≥ 4.5:1 |

### 手工检查

- 对照线上 `https://yuance.quanxinfu.com/web`（只读访问，未做任何写操作）与 v3 工作台、需求列表逐项比对信息项，确认 v3 未遗漏现网的关键信息与操作入口。
- 逐页阅读渲染截图，检查密度、层级、对齐、留白与状态表达。
- 检查图标全部来自 `assets/icons.svg` 的 `<symbol>`，无 emoji。

## 主要发现

### 必须修正的问题

均已在提交前修复：

1. **图标未约束尺寸**：`svg` 无默认宽高，导致顶栏与下拉菜单的图标撑成原始尺寸，破坏布局。
   修法：`base.css` 增加 `.icon { width: 16px; height: 16px; flex: none; }` 默认尺寸，各容器再按需覆盖。
2. **下拉菜单默认展开**：账户菜单始终可见。
   修法：改为 `:hover` / `:focus-within` 触发，同时保持键盘可达。
3. **`.tabs` 与宽表撑破窄屏**：系统管理 8 个标签页在 375px 下产生 620px 横向溢出。
   修法：`.tabs` 改为横向滚动容器且 `.tab` 设 `flex: none`；`.stack > *`、`.split > *`、`.grid > *` 统一放开 `min-width: 0`。
4. **对比度不达标**：初版 `--text-tertiary: #7c8894` 在承载面上仅 3.6:1，`--sand: #8b6b35` 在沙色底上仅 4.39:1。
   修法：`--text-tertiary` 调深为 `#68747f`（4.8:1），`--sand` 调深为 `#836333`（4.9:1），
   面包屑与搜索提示改用 `--text-secondary`（承载面为页面底色，弱化文字不落在该面上）。

### 可接受的残留项

1. **`make frontend-check` 的 desktop 段失败**：`desktop/node_modules/typescript` 未安装，`tsc` 命令缺失。
   该失败与本轮改动无关（`ui-v3/` 不在 desktop 的构建与 lint 范围内，且 desktop 依赖本身不完整）。
   需在补齐 `desktop` 依赖后单独复核。
2. **原型未纳入任何 lint / 类型检查范围**：`web`、`frontend`、`desktop` 的 eslint 与 jsconfig 都只覆盖各自源码目录。
   有意为之——原型是设计产物，不进入生产代码质量门禁；代价是原型代码本身没有静态检查兜底。
3. **深色主题未产出**：待浅色基调定稿后派生。

### 建议后续跟进

1. 视觉基调评审：确认走「延续浅蓝灰企业风 + 提高密度」还是改向「现代紧凑开发者工具风」。改向后需重做的是排布密度与圆角/阴影强度，令牌层可保留。
2. 设计定稿后另立规格做 React 回迁：`frontend/packages/ui` 按本模块令牌表与组件规格重写，并同步更新 `frontend/parity/main-web-visual-contract.json` 与体验清单（`frontend/parity/` 的 31 页闭包校验会拦截未登记的新页面）。
3. 回迁前保留原型不进入生产构建链路，避免两套实现长期漂移。

## 与计划的一致性

### 哪些内容符合计划

- 目录结构与 `plan.md` 的「项目结构」章节一致：`ui-v3/{index.html,assets,styles,scripts}`，`styles` 四层（tokens/base/layout/components），`scripts/pages` 九个页面模块。
- 零构建零依赖：仅原生 ES Module，无 npm 依赖、无构建配置。
- 静态 mock：`scripts/mock/data.js` 的字段命名对齐 `frontend/packages/api-client` 的现有响应结构（`WorkItemSummary`、`WorkItemDetail`、`WorkItemComment`、`Attachment`、`Pagination`）。
- 时间管理按用户要求处理：侧边栏入口带「现网」标记指向 `https://yuance.quanxinfu.com/web/time-management`，v3 内不提供其重设计版本。
- 令牌集中：颜色、间距、字号、圆角、阴影、动效、层级只在 `styles/tokens.css` 定义。

### 哪些内容偏离计划

- `plan.md` 预定 `scripts/mock/` 为独立目录并按域拆多个文件，实际合并为单个 `scripts/mock/data.js`。
  原因：数据量不足以拆分，单文件更便于评审时通读，且不改变对外契约。
- `plan.md` 的 `files/` 目录树中列出了 `ui-v3/assets/` 下仅 `icons.svg`，实际未再增加其它资源文件，一致。

## 回归与风险

### 是否发现明显回归

无。`ui-v3/` 是全新目录，未修改任何现有文件；`make web-build` 产物不含该目录；
`docs/prototypes/time-management/index.html` 未被改动；既有未提交改动（`desktop/build/*` 删除、`docs/runbooks/browser-smoke.md` 修改）本轮未触碰。

### 仍需关注的风险

1. **原型与实现漂移**：原型停留在仓库里越久，越可能与最终实现脱节。对策已写入 README「定位与边界」与 DESIGN-NOTES「待决事项」。
2. **回迁工本体量**：`frontend/packages/ui` 现有 `styles.css` 3640 行、`primitives.jsx` 463 行，
   回迁时需按 v3 令牌表重写并保持 `frontend/parity` 的视觉合同闭合，这是独立规格的工作量。
3. **未做真实数据与真实交互验证**：本轮为静态 mock 原型，不涉及鉴权、持久化、附件上传、评论发布等写操作，这些在回迁阶段必须补真实集成测试。

## 结论

- 结论：**通过**
- 下一步：进入视觉基调评审。评审结论确定后，按 DESIGN-NOTES 的方向调整或定稿，再另立规格做 React 回迁。
