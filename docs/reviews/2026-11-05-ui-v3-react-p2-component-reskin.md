# UI v3 回迁 P2 组件换皮 复核记录

- 规格：`specs/ui-v3-react/spec.md`
- 方案：`specs/ui-v3-react/plan.md`（阶段三 P2）
- 任务：`specs/ui-v3-react/tasks.md`（T008 / T009 / T010 / T011）
- 复核日期：2026-11-05

## 结论

**通过。** 组件层的设计语言已落到生产包：20 个既有组件按设计稿重做皮肤（DOM 与 props 一律未动），
7 个设计稿新增的组件已实现并导出，浏览器端浅色与深色两轮走查观感达到设计稿水平。

## 为什么先做组件层

回迁的视觉改善主要来自「阴影 + 留白 + 降饱和 + 靛底磁贴」这套质感，
它几乎全部落在令牌与组件皮肤上，不需要动任何 DOM。
P2 做完就能评审观感是否达标，再决定是否投入 P3/P4 的结构改造。

## 换皮范围

| 组件 | 改动要点 |
|---|---|
| Button | 36px 高、圆角 `--yc-radius-sm`、品牌色 + 品牌阴影；主按钮实心、次级白底带弱阴影、危险实心红、幽灵透明 |
| TextInput / TextArea | 36px 输入高、12px 圆角、聚焦用 `--yc-brand-ring` 光环；占位符用弱化文字色 |
| Select | 只换皮：箭头与勾选标记改用内联 SVG mask，浮层圆角与阴影换成设计稿刻度，保留 searchable |
| Field | 标签 12px 半粗、提示与错误分色 |
| FilterBar | 间距改用间距刻度 |
| Badge | 由胶囊改为设计稿的小圆角标签，六个语义色改用 `--yc-*-soft / -line / -text` 三元组 |
| PriorityBadge | 新增形状通道：P0 三角、P1 三角、P2 方块、P3 圆点，形状与颜色双通道，色弱用户可辨 |
| DataTable | 行高 46、表头 40 且 sticky 底色 `--yc-surface-2`、行悬停 `--yc-surface-hover` |
| Pagination | 页码压到 28px、圆角小、去掉选中页的高亮块，改为纯文字强调 |
| ContentTabs | 由分段胶囊改为设计稿的**下划线**形态：指示条贴底 2px，激活项靛蓝 |
| Modal | 圆角 `--yc-radius-xl`、阴影 `--yc-shadow-lg`、头部正文底部按设计稿留白，底部条带浅底 |
| Skeleton / Feedback / ErrorToast | 换用设计稿刻度与语义色三元组 |
| UserAvatar | 沿用既有实现，配色改为设计稿色板 |

`ContentTabs` 的形态改动**没有动 DOM 和 JS**：指示条原本就由脚本写入
`--yc-content-tab-indicator-width` / `-x`，只改 CSS 就能把它从「分段高亮块」变成「底部横线」。
指示条的 `left: 4px` + `translateX(offsetLeft - 4)` 恰好等于激活项的左边缘，所以换成零内边距的容器后仍然对齐。

## 新增组件（设计稿有、生产没有）

`Card`、`Panel`（head / body / foot，支持 `flush` 与 `pop`）、`Metric`（磁贴指标卡，
底色统一品牌浅底、图标按语义着色）、`StatusPill`（颜色只作辅助，语义由文字承担）、
`ProgressBar`（带 `role="progressbar"` 与数值属性）、`IconTile`、`EmptyState`。
全部从 `frontend/packages/ui/src/index.js` 导出。

## 原生控件外观与图标

- 隐藏 `::-webkit-search-cancel-button` 与 `::-webkit-search-decoration`，避免与自绘控件并存。
- 下拉箭头、勾选标记、甘特冲突标记统一改为内联 SVG（CSS `mask` 或 data URI），不再用字符图标。
- 全包扫描确认 UI 包内无 emoji。

## 顺带修掉的缺陷

1. **4 处引用未定义令牌**：`--yc-table-head` 在令牌表里不存在，
   涉及 `action-panel-head` 与 app-shell 的三处规则，背景一直是失效状态。改为 `--yc-surface-2`。
2. **新增令牌解析断言**：`frontend/packages/ui/test/index.test.mjs` 新增一条用例，
   扫描 ui 包与 app-shell 样式里所有 `var(--yc-*)` 引用，逐一比对 `tokens.css` 的定义，
   缺失即失败。这条断言把「令牌只有一处来源」从约定变成了可执行的约束，
   也挡住了上面那类「引用了不存在的令牌」的静默失效。

## 验证记录

| 验证项 | 命令 | 结果 |
|---|---|---|
| 前端全量检查 | `npm --prefix frontend run check` | 通过（98 + 54 项测试 0 失败，含新增令牌解析断言） |
| Web 全量检查 | `npm --prefix web run check` | 通过（68 项测试 0 失败） |
| 生产构建 | `make web-build` | 通过 |
| 视觉护栏 | `npm --prefix web run test:visual` | 9/9 通过（建基线后换全新服务与种子数据纯对比仍全绿） |
| 浏览器端走查 | 需求列表 / 项目列表 / 系统用户 / 消息中心 / 下拉浮层，浅色与深色 | 运行时错误 0；观感达到设计稿水平 |
| 令牌引用完整性 | 脚本扫描 ui 包与 app-shell 全部 `var(--yc-*)` | 未定义引用 0 |

## 已知环境问题

1. **桌面端 renderer 无法在本机构建**：`desktop/node_modules` 为空（`vite`、`typescript` 均未安装），
   `npm --prefix desktop run build:renderer` 与 `make frontend-check` 的 desktop 段都无法执行。
   因此 T011 要求的「桌面端截图并排比对」本轮**未完成**，属于未验证项，需补齐依赖后单独复核。
   桌面端与 Web 端共用 `@yuance/frontend-ui/styles.css`，CSS 由打包器按文件相对路径解析，
   Web 端已验证通过，桌面端按同一机制处理。
2. **既有 e2e 用例与演示数据漂移**：`ensureCurrentProject()` 依赖演示种子里编号为 `YCE` 的项目，
   当前种子已不再创建该编号，导致依赖它的用例超时。与 P0/P1 无关，单独跟进。
3. **深色主题未按设计稿重做**：本阶段的暗色值来自 P1 的推导值，设计稿的暗色规格在 P5 产出。
