# 元策 UI v3 设计原型模块 实施方案

- 规格：`spec.md`
- 状态：草稿

## 技术上下文

现有实现（只读核对，不改动）：

| 位置 | 现状 |
|---|---|
| `frontend/packages/ui` | 共享 React 组件库，`styles.css` 3640 行、`rich-text.jsx` 2005 行、`time-allocation-gantt.jsx` 1426 行、`attachment-preview.jsx` 877 行 |
| `frontend/packages/app-shell` | `app.jsx` 6930 行，`application.css` 1679 行；被 `web/` 与 `desktop/` 共用 |
| `web/` | Vite + React 19 浏览器端，入口 `web/src/main.jsx` |
| `desktop/` | Electron 端，渲染进程复用同一套 `frontend/packages` |
| `api/` | Rust 后端，提供 `/api/*` 接口 |
| `docs/prototypes/time-management/index.html` | 仓库既有的单文件纯 HTML+CSS+JS 原型先例 |

本次产出落在全新目录 `ui-v3/`，与上述任何现有目录无引用关系：

- 语言/版本：HTML5 + CSS3 + 原生 ES Module JavaScript（浏览器原生支持，无需编译）
- 依赖：无。零第三方库、零构建工具、零 npm 依赖
- 存储：静态 mock 数据，写死在 `ui-v3/scripts/mock/*.js` 的 ES Module 常量中
- 测试：静态资源引用完整性脚本 + Playwright/浏览器渲染走查（人工 + 脚本）
- 目标平台：现代桌面浏览器（Chrome / Edge / Safari 最新版），最小可用宽度 375px
- 性能目标：单页首屏渲染 < 200ms（本地静态服务），无网络请求
- 约束：零构建、零依赖、单次 `python3 -m http.server` 即可运行
- 规模：约 14 类页面、1 套设计令牌、1 套组件层、1 套壳层

## 规范与约束核对

- `AGENTS.md`：中文文档与注释；仓库相对路径；不擅自新建分支/部署；重要改动需独立复核。
- `AGENTS.md` 产物约定：`specs/<feature>/` 存放活动规格、方案与任务，本目录已建立。
- `AGENTS.md` 执行规则：必须包含匹配风险的验证任务，并真实执行记录结果。
- `AGENTS.md` 工具使用：涉及第三方库当前官方用法优先用 Context7。本模块不使用第三方库，无需查询。
- `.specify/memory/constitution.md`：
  - I 规格描述业务结果，不提前决定代码结构 → `spec.md` 只写 WHAT/WHY。
  - II 设计尊重现有系统边界 → 不臆造目录；`ui-v3/` 不侵入既有包结构。
  - III 验证匹配风险 → 原型阶段以静态检查 + 真实浏览器渲染走查作为验收。
  - IV 权限边界 → 不切分支、不建 PR、不部署。
- Git 提交约束：默认在当前分支开发，提交前 `git diff --check`，提交后同步远端。
- 安全边界：原型不含鉴权、真实数据与文件操作，不处理任何凭据。

## 实现方案与文件范围

### 目录结构

```text
ui-v3/
├── README.md                     # 模块定位、启动方式、页面清单、设计约定、回迁路径
├── index.html                    # 原型唯一入口，承载壳层与内容容器
├── assets/
│   └── icons.svg                 # 内联 SVG 图标符号表（不用 emoji）
├── styles/
│   ├── tokens.css                # 设计令牌唯一来源：颜色/间距/字号/圆角/阴影/动效/z-index
│   ├── base.css                  # reset、排版、焦点态、可访问性、reduced-motion
│   ├── layout.css                # 应用壳层：侧边栏、顶栏、内容区、断点
│   └── components.css            # 按钮/表单/表格/卡片/徽标/标签页/弹层/空态等
└── scripts/
    ├── app.js                    # 启动：注入壳层、挂载路由
    ├── router.js                 # hash 路由（路径 → 页面模块）
    ├── shell.js                  # 壳层渲染：侧边栏、顶栏、项目切换、账户
    ├── ui.js                     # 无框架 DOM 构建原语（h/el/cls）
    └── pages/
        ├── workbench.js          # 工作台
        ├── projects.js           # 项目列表 + 项目详情
        ├── work-items.js         # 需求/任务/Bug 列表
        ├── work-item-detail.js   # 工作项详情
        ├── resources.js          # 资料库 + 资料详情
        ├── messages.js           # 消息中心
        ├── search.js             # 全局搜索
        ├── profile.js            # 个人中心
        └── system.js             # 系统管理各子页
```

### 关键技术决策

1. **零构建 + 原生 ESM**：用 `python3 -m http.server` 托管即可运行。代价是 `file://` 协议下 ESM 会被 CORS 拦截，因此 README 与 `index.html` 必须给出明确的服务启动指引。
2. **单入口 + hash 路由**：只维护一份壳层代码，避免多份 HTML 重复导航与样式；页面切换不刷新，便于评审时前后对比。
3. **DOM 构建原语 `ui.js`**：不引入框架，用 `document.createElement` + 轻量 `h()` 帮助函数拼装节点。原型阶段的交互复杂度不需要框架，框架化会掩盖真实设计问题。
4. **令牌集中**：所有颜色、间距、字号、圆角、阴影、动效只允许在 `styles/tokens.css` 定义，页面样式一律引用变量。这直接满足 FR-005 / FR-006 与 SC-003，也为后续 React 回迁提供可一一对应的令牌表。
5. **SVG 图标表**：图标以 `<symbol>` 集中放在 `assets/icons.svg`，通过 `<use>` 引用，避免 emoji（FR-011）并保证风格统一。

### 设计方向（当前稿，可按评审反馈调整）

| 维度 | 现网 | v3 初稿 |
|---|---|---|
| 一级导航 | 顶部横向 9 项 + 下拉 | 左侧固定侧栏分组（概览 / 项目 / 交付 / 协作 / 系统），顶栏仅留搜索、项目切换、通知、账户 |
| 信息密度 | 卡片大、行高松 | 表格行高压紧、控制高度 32→30、间距刻度收敛 |
| 工作台 | 4 大统计卡 + 宽表 + 右栏 | KPI 压成单行指标条，主区左右分栏（推进表格 / 我的待处理），活动流收进右侧 |
| 状态表达 | 彩色圆点为主 | 圆点 + 文字标签双通道，颜色不单独承载语义 |
| 色彩 | 蓝灰主色 + 8 组语义色 | 保留品牌蓝灰家族，重排为 surface / border / text 三层语义令牌 |

### 与现网的关系

- v3 **不替换** `frontend/packages/ui`。设计定稿后需另立规格做 React 回迁，否则会出现两套实现长期漂移。
- v3 **不进入生产构建**：`web/` 与 `desktop/` 的 Vite 配置不引用 `ui-v3/`，需在验证阶段确认产物中不含该目录。
- 时间管理页面内容不在 v3 范围内，壳层中该入口以「外链/沿用现有实现」的显式标记呈现，避免评审者误以为已重设计。

## 阶段与依赖

| 阶段 | 内容 | 依赖 | 交付物 |
|---|---|---|---|
| S1 基础设施 | `styles/tokens.css`、`base.css`、`layout.css`、`components.css`、`ui.js`、`icons.svg` | 无 | 可用壳层 + 组件样式 |
| S2 壳层与路由 | `index.html`、`shell.js`、`router.js`、`app.js`、mock 数据骨架 | S1 | 可点击导航的空壳 |
| S3 工作台 | `pages/workbench.js` + 对应 mock | S2 | 第一个完整页面 |
| S4 项目域 | `pages/projects.js` | S2 | 项目列表与详情 |
| S5 交付域 | `pages/work-items.js`、`pages/work-item-detail.js` | S2 | 需求/任务/Bug 与详情 |
| S6 协作域 | `pages/resources.js`、`pages/messages.js`、`pages/search.js`、`pages/profile.js` | S2 | 资料库、消息、搜索、个人中心 |
| S7 系统域 | `pages/system.js` | S2 | 系统管理各子页 |
| S8 验证与文档 | 截图走查、响应式、键盘可达性、README、设计决策记录 | S1-S7 | 验收证据 |

S3-S7 之间无文件交集，可并行推进。

## 验证与验收

1. **静态服务启动**：`python3 -m http.server 4173 --directory ui-v3`，浏览器打开 `http://127.0.0.1:4173/`，控制台无报错。
2. **页面渲染**：逐个路由截图，确认无空白页、无未捕获异常（浏览器 console + pageerror 均为空）。
3. **响应式**：在 375 / 768 / 1024 / 1440 四档宽度截图，确认无横向撑破，宽表由横向滚动容器承载。
4. **键盘可达**：Tab 遍历主导航与主要操作，焦点环始终可见，顺序与视觉顺序一致。
5. **对比度**：正文与背景抽样验证 ≥ 4.5:1；状态标签同时具备文字。
6. **不污染生产构建**：运行 `make frontend-check` 与 `make web-build`，确认通过且产物不含 `ui-v3`。
7. **既有原型未受影响**：`docs/prototypes/time-management/index.html` 文件与内容未被改动（`git diff` 确认）。
8. **证据落盘**：截图存 `test-results/ui-v3/`，结论写入 `docs/reviews/`。

失败场景需明确记录：若某页面在无控制台错误下仍渲染异常，需在 review 文档中记为未通过项，不得以「基本可用」代替。

## 运行与恢复

- 无运行态变化，无数据库迁移，无部署。原型为纯静态文件。
- 回滚方式：删除 `ui-v3/` 目录即可，不影响任何现有构建与部署链路。
- 启动方式仅本地静态服务，不需要 `make dev-*`、不需要启动 `api/`、不需要 Docker。
