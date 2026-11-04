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
| 键盘可达 | Tab 连按 42 次，读取 `activeElement` 的 `:focus-visible` 与焦点指示 | 42 个焦点元素全部有可见焦点指示，tab 顺序与视觉顺序一致 |
| 对比度 | Node 脚本解析 `tokens.css`，逐对计算 WCAG 比值 | 24 组配色组合全部 ≥ 4.5:1（含深色侧栏色组） |
| 令牌完整性 | 脚本双向核对 `styles/*.css` 的 `var(--x)` 与 `tokens.css` 的定义 | 缺失定义 0 个，未定义引用 0 处 |

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
4. **批量操作条常驻显示**：`hidden` 属性被 `.bulk-bar { display: flex }` 覆盖，未选中时仍显示「已选择 0 项」。
   修法：增加 `.bulk-bar[hidden] { display: none; }`。
5. **属性栏胶囊被拉伸**：`.props` 网格里 `.status` 胶囊横向铺满整列。
   修法：`.props > * { justify-self: start; }`。
6. **对比度不达标**：初版 `--text-tertiary` 在承载面上仅 3.6:1；视觉重做后的第一版 `#858b9f` 更低至 3.39:1，
   侧栏弱化文字 `#6b7391` 仅 3.76:1。
   修法：`--text-tertiary` 调为 `#676d7f`（承载面 5.2:1、页面底 4.7:1），
   `--text-secondary` 同步调深为 `#4f5568`（7.4:1）拉开层级，
   `--nav-text-muted` 调为 `#8088a6`（5.0:1）。
7. **令牌引用缺失**：`var(--fs-15)`、`var(--sp-14)`、`var(--sp-18)`、`var(--surface-canvas)` 在新令牌表中无定义。
   修法：补 `--fs-15`，间距收敛到既有刻度（14→12、18→20），`--surface-canvas` 更名 `--bg`。
   验证方式：脚本双向核对 `styles/*.css` 的 `var(--x)` 与 `tokens.css` 的定义，结果为「缺失定义：无」。
8. **窄屏覆盖规则被层叠盖掉**：窄屏媒体查询写在 `layout.css`，
   但 `components.css` 后加载且拥有同名类（`.topbar__icon-btn`、`.global-search` 等），
   导致 `layout.css` 里的窄屏规则整体失效——顶栏在 300px 下横向溢出 26px。
   修法：控件级窄屏覆盖移到规则归属的 `components.css` 末尾，`layout.css` 只保留布局层自己的选择器。
   验证方式：`matchMedia` 命中状态 + 计算样式逐项核对，不只看截图。
9. **项目切换组换行顶出顶栏**：标签 + 选择器宽度超出容器 5px 导致换行，
   标签被推到 y = -2（顶栏外）。修法：新增 `.topbar__project` 容器禁止换行，选择器最大宽度收到 168px。
10. **侧栏底部区块冗余**（第二轮评审反馈）：底部账户块与顶栏头像菜单重复；
    时间管理被单独隔离在底部。修法：移除底部区块，时间管理并入「工具」分组，与其它一级导航项同级。
11. **原生下拉与设计系统不匹配**（第三轮评审反馈）：6 处原生 `<select>` 的展开菜单由浏览器绘制，
    样式无法控制，在半透明顶栏上还会弹出系统级灰色菜单。
    修法：新增 `select()` 自定义下拉组件（触发按钮 + 浮层菜单），替换全部原生下拉并移除其 appearance 样式。
12. **导航路径被拼成 `##/...`**（由自定义下拉的行为测试暴露）：
    `navigate()` 直接在传入路径前加 `#`，而调用方传的是已带 `#` 的路径，结果 fragment 变成 `##/projects/x`，
    路由匹配失败。修法：`navigate()` 统一剥离前导 `#`。
13. **切换项目后顶栏文字不更新**（由自定义下拉的行为测试暴露）：
    `currentProject` 是静态常量，切换项目只改了 URL。修法：改为可变状态并新增 `setCurrentProject()`；
    项目详情页也改为按路由参数取项目，避免所有项目都显示「零售系统」。
14. **下拉浮层被面板裁剪**（收尾审计发现）：
    `.panel { overflow: hidden }` 用来裁表格圆角，但筛选面板内的自定义下拉菜单也被一起裁掉，
    只剩第一项可见，且选项被下层表格拦截无法点击。修法：`panel()` 增加 `clip` 参数，
    内含浮层的面板改用 `.panel--pop`（`overflow: visible`）。
15. **筛选器行为不一致**（收尾审计发现）：
    同一排筛选控件里，「状态」「优先级」能筛，「项目」不能；审计页两个筛选器、搜索页「范围」、
    项目页分段控件与搜索框同样没接线。已全部接线，筛选条件写入 URL。
16. **卡片套卡片**：筛选条自带边框与阴影又被放进面板里，形成双层卡片。修法：筛选条改为面板内裸行。
17. **404 页缺 h1**：未知路由渲染的「页面不存在」没有标题层级。修法：补 h1、图标与返回入口。
18. **个人中心标题重复**：页面标题同时显示姓名与角色徽标，mock 里两者都是「超级管理员」。修法：标题只留姓名，角色在属性区显示。
19. **项目页统计口径错误**：统计基于搜索结果而非筛选范围，搜索无结果时指标被清零。修法：改按「范围」统计。

### 可接受的残留项

1. **`make frontend-check` 的 desktop 段失败**：`desktop/node_modules/typescript` 未安装，`tsc` 命令缺失。
   该失败与本轮改动无关（`ui-v3/` 不在 desktop 的构建与 lint 范围内，且 desktop 依赖本身不完整）。
   需在补齐 `desktop` 依赖后单独复核。
2. **原型未纳入任何 lint / 类型检查范围**：`web`、`frontend`、`desktop` 的 eslint 与 jsconfig 都只覆盖各自源码目录。
   有意为之——原型是设计产物，不进入生产代码质量门禁；代价是原型代码本身没有静态检查兜底。
3. **深色主题未产出**：待浅色基调定稿后派生。
4. **首轮视觉不达标**：首轮交付的信息结构正确但视觉过于平淡（满屏细线、13px 小字、缺视觉锚点），
   评审未通过。经视觉重做（阶段四 T026-T030）后重测通过，记录在此以保留评审轨迹。

### 建议后续跟进

1. 视觉基调评审：现版本为「深色品牌侧栏 + 靛蓝主色 + 卡片化」的现代工作台方向。
   若评审倾向更保守的企业风，改动集中在色彩与阴影，布局与组件形态可保留。
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
- **视觉基调偏离**：plan 阶段按「延续现网浅蓝灰企业风 + 提高密度」推进，首轮交付后评审判定视觉不达标。
  经视觉重做改为「深色品牌侧栏 + 靛蓝主色 + 卡片化」的现代工作台方向，
  配色来源为 `ui-ux-pro-max` 命中的 `Micro SaaS`（靛蓝 + 翡翠）配色组，
  决策依据与被否决方向记录在 `ui-v3/DESIGN-NOTES.md`。重做过程追加任务 T026–T030。

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
