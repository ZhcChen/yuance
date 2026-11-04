# 元策 UI v3 · 设计决策记录

记录 v3 原型的设计依据、被否决的方向与理由。供设计评审与后续 React 回迁时查阅。

## 一、检索来源

使用本机 `ui-ux-pro-max` 技能检索，命令与结果如下。

### 1.1 设计系统（`--design-system`）

```bash
python3 "$HOME/.skills-manager/skills/ui-ux-pro-max/scripts/search.py" \
  "project management collaboration workspace dashboard data dense enterprise" \
  --design-system --variance 4 --motion 4 --density 8 -p "YuanCe V3"
```

命中与采纳情况：

| 检索输出 | 采纳 | 理由 |
|---|---|---|
| Style: `Data-Dense Dashboard`（多图表/数据表/KPI 卡/紧凑网格，支持浅色与深色） | 采纳 | 与「内部协作工作台 + 高密度列表」的产品形态吻合，直接对应 v3 的密度目标 |
| Density 8/10（8–32px 间距刻度） | 采纳 | 与现网相比收紧一档；v3 间距刻度取 2/4/6/8/12/16/20/24/32/40/48 |
| Colors: Primary `#1E40AF`、Accent `#D97706`、Background `#F8FAFC`、Border `#DBEAFE`、Destructive `#DC2626` | 部分采纳 | 保留「蓝为主色 + 琥珀强调 + 红色危险」的结构，但色值沿用现网品牌蓝 `#376b9b` 家族，避免设计稿与现有品牌脱节；边框与底色改为更中性的灰蓝 |
| Typography: `Fira Code / Fira Sans` | 否决 | 见 2.2 |
| Motion: GSAP `Stagger List` | 否决 | 见 2.3 |
| Pattern: `Enterprise Gateway`（Hero 视频、mega menu、Contact Sales CTA） | 否决 | 见 2.1 |

### 1.2 UX 规则（`--domain ux`）

查询 `dense data table filtering bulk selection scanning` 与 `sidebar navigation hierarchy workspace app switching`，采纳：

- **批量操作**：列表需支持多选 + 批量操作，采用「勾选列 + 操作条」形态（v3 工作项列表已实现）。
- **表格溢出**：宽表必须包在横向滚动容器内，不得撑破布局。
- **字号刻度**：使用模块化刻度，禁止随手取值。
- **面包屑**：3 层以上深度需显示位置。
- **粘性导航**：固定顶栏必须留出等高内边距，不遮挡首屏内容。
- **键盘导航**：可操作控件全部键盘可达，焦点可见，tab 顺序与视觉顺序一致。
- **标题层级**：h1 → h2 → h3 连续，不跳级。

### 1.3 预交付检查清单

已全部落地：SVG 图标（无 emoji）、可点击元素有 hover 态（150–300ms）、正文对比度 ≥ 4.5:1、焦点态可见、`prefers-reduced-motion` 生效、375/768/1024/1440 四档响应式。

## 二、被否决的方向

### 2.1 营销站式布局（`Enterprise Gateway`）

检索给出的 pattern 是面向外部获客的营销站：Hero 视频、mega menu、Logo 轮播、Contact Sales 作为主 CTA。

否决理由：元策是内部协作工作台，核心用户是研发与产品团队，首要目标是「快速定位并处理工作项」，不是获客转化。Hero 视频与 mega menu 会挤占首屏空间并降低信息密度。

实际采纳：mega menu 的**导航分组思路**被保留，但落地为左侧固定侧栏的分组（概览 / 项目 / 交付 / 协作 / 系统），而不是悬停展开。

### 2.2 等宽字体作为正文（`Fira Code` / `Fira Sans`）

检索建议把 Fira Code 作为主要字体族。

否决理由两点：
1. 等宽字体的首要用途是代码与编号，本产品正文是中文长句与表格文本，等宽会显著降低中文可读性。
2. 该字族不含中文字形，回退到系统中文字体后，`Fira Sans` 的西文与中文混排基线与字重都会失衡。

实际采纳：字体栈改为 `-apple-system / PingFang SC / Microsoft YaHei / Source Han Sans SC` 系统栈，
等宽字体只用于工作项编号、存储前缀这类确实需要等宽对齐的场景（`--font-mono`）。

### 2.3 GSAP 编排动画（`Stagger List`）

检索给出的动效方案是加载时的错峰入场动画，并附了 GSAP 代码片段。

否决理由：
1. 本模块的技术前提是零依赖纯 HTML + CSS + JS，引入 GSAP 与该前提直接冲突。
2. 内部工作台的首屏是数据表与列表，几十行错峰入场会拖慢「看到数据」的时间，且对每日高频使用是反复的视觉噪音。

实际采纳：动效只保留功能性微交互（hover、focus、抽屉滑入），时长控制在 120–260ms；
`@media (prefers-reduced-motion: reduce)` 下全部降为 0.01ms。

### 2.4 检索配色输出中的字段异常

`--design-system` 的配色段落中，`Foreground` 与 `Card Foreground` 均输出为 `#1E3A8A`（品牌深蓝），
而正文前景色应接近中性深色。这是检索输出的字段异常，**未照抄**。

实际采纳：文字前景色自定义为 `#1a2430`（15.7:1）、`#5b6875`（5.7:1）、`#68747f`（4.8:1）三级，
全部经逐对核验达到 4.5:1。

## 三、v3 相对现网的设计取舍

| 取舍点 | 选择 | 理由 |
|---|---|---|
| 导航形态 | 顶部横排 → 左侧固定侧栏 | 现网一级导航已达 9 项（含「系统管理」下拉与桌面端下载），横向排列已接近上限，后续再加模块无处安放 |
| 品牌色 | 改用 `#376b9b` 系 | 沿用现网品牌色，避免原型与现有产品在品牌层面割裂；v3 改的是信息结构，不是品牌 |
| 深色主题 | 暂不产出 | 现网 `frontend/packages/ui/src/styles.css` 已有 `html[data-theme="dark"]` 令牌；v3 先把浅色基调定稿，深色作为后续派生，避免两套主题同时未定稿 |
| KPI 形态 | 4 张大卡 → 单行指标条 | 现网 4 张卡占据整行首屏高度，信息量仅 4 个数字；指标条把首屏让给真正需要扫读的数据 |
| 批量操作 | 新增 | 检索 UX 规则明确要求；现网列表无多选入口 |
| 状态色 | 圆点 + 文字 / 形状 + 文字 | 现网部分状态仅靠颜色表达，灰度或色觉障碍下不可辨 |

## 四、待决事项

1. **视觉基调最终方向**：现按「延续现网浅蓝灰企业风 + 提高密度」推进。
   若改走「现代紧凑开发者工具风」，需要重做的是排布密度与圆角/阴影强度，令牌层可保留。
2. **深色主题**：待浅色定稿后派生，颜色令牌需要补一组暗色值。
3. **回迁路径**：设计定稿后，`frontend/packages/ui` 需要按本模块的令牌表与组件规格重写，
   并同步更新 `frontend/parity/main-web-visual-contract.json` 与体验清单。
