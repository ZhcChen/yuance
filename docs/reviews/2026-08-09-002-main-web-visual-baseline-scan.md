---
title: main Web 视觉基线完整扫描
type: review
status: completed
date: 2026-08-09
plan: docs/plans/2026-08-09-002-refactor-main-web-visual-parity-plan.md
baseline: main@6c0e56daa5460a9725ee00b8937124d390e9bd0b
---

# main Web 视觉基线完整扫描

## 结论

扫描完成。当前 `dev` 与 `main` 的差异是页面结构、信息层级和响应式行为的系统性重设计，不是局部颜色或间距偏差。不能在现有 `.shell-*` 卡片布局上继续做零散 CSS 修补；应以 `main` 的页面 DOM 和 computed style 为合同，按页面族重构共享 React 呈现层，同时保留现有 route、DTO、mutation、SPA 稳定壳和 Desktop 安全 adapter。

本次覆盖 `frontend/parity/experience-manifest.json` 登记的全部 `30` 个页面、`81` 个动作和 `7` 个宿主差异。运行态采集覆盖其中 `21` 个有稳定 fixture 的业务/系统页面，每页采集 `390x844`、`768x1024`、`1280x800`、`1440x900` 四个视口，共 `84` 张 `main` 截图、`84` 张当前 `dev` 对照截图和两组结构/几何指标。其余 `9` 个入口由动态详情、SSR 边界或共享入口组成，已通过模板、route 和 manifest 静态合同补齐。

运行证据位于 `.artifacts/main-visual-baseline/` 与 `.artifacts/dev-visual-current/`，不纳入版本控制。

## 扫描方法

1. 固定 `main@6c0e56d`，读取 router、35 个 Web 模板、`api/static/app.css` 和 `api/static/app.js`。
2. 建立独立 `main` worktree、target 和临时 SQLite，执行匹配版本 migration、`local-admin` 与 demo seed。
3. 在隔离 `agent-browser` session 中使用相同管理员、数据和 route 采集 `main` 与 `dev`。
4. 每页记录标题层级、panel/metric/table/form/modal 数量、主滚动区几何、页面尺寸与横向溢出。
5. 用 manifest 的 30 页台账反查运行页面、动态页面和边界页面，禁止以截图目录替代完整路由覆盖。

## 全局差异

| 合同 | `main` | 当前共享实现 | 结论 |
|---|---|---|---|
| CSS 规模 | `10,995` 行，`718` 个顶级 class selector | 两个共享样式文件共约 `1,882` 行，约 `209` 个顶级 class selector | 大量页面级结构未迁移 |
| token | `86` 个变量，覆盖 light/dark、tab、table、kind、metric、discussion、attachment、auth | 约 `24` 个共享变量 | 状态色、卡片、表格、tab、讨论和边界 token 不完整 |
| selector 直接重合 | `8/718` | 约 `1%` | 当前不是旧视觉的组件化表达 |
| breakpoint | `1280/1100/980/920/900/860/760/620` 及 reduced-motion | `1080/960/760/720/640` | 折叠时机和栅格行为不同 |
| 页面滚动 | 固定 `58px` 顶栏，`.main` 独立滚动 | `main.app-shell` 整体滚动 | 顶栏、sticky rail 和内容高度语义不同 |
| 页面头部 | 页面自有 `page-hero`、详情 hero 或无 hero | 所有 route 强制统一 `shell-header` | 每页首屏层级普遍错误 |
| 全局摘要 | 只在 Dashboard 使用业务指标 | 所有 route 强制显示当前用户/项目/待处理三卡 | 所有非首页页面多出一整层内容 |
| Dashboard | 4 指标 + 项目表格 + 讨论/动态侧栏 | 用户/项目/待处理 + 项目角标 + 最近消息 | DOM、密度和信息顺序完全不同 |
| 列表 | metric + filter/saved view + compact table + pager | 通用 header + 摘要卡 + list/card | 表格列、筛选层级和批量栏位置不同 |
| 详情 | 专用 hero、内容主栏和 sticky action rail | 通用 header、摘要卡和普通 panel grid | 栏宽、操作位置和讨论顺序不同 |
| 移动端 | 顶栏工具、搜索、nav、品牌按基线顺序重排 | 品牌优先且工具组合不同 | 首屏顺序、横向导航和内容起点不同 |

## 页面覆盖矩阵

严重度定义：`S1` 为页面结构与信息顺序整体不同；`S2` 为主要区域相同但组件、排版或状态不一致；`S3` 为边界页局部 token/尺寸差异；`N/A` 为 `main` 没有对应视觉基线或本身就是入口容器。

| 页面 | 基线路由 | 基线结构 | 当前主要差异 | 严重度 | 运行证据 |
|---|---|---|---|---|---|
| 工作台 | `/web` | 4 指标、项目表格、讨论与动态双栏 | 页面标题、摘要卡、项目角标和消息卡均为新结构 | S1 | 四视口 |
| 个人中心 | `/web/me` | profile hero、3 指标、Token、项目与安全 modal | 通用 header/摘要卡，hero、指标和安全区层级不同 | S1 | 四视口 |
| 消息中心 | `/web/messages` | compact heading、tabs、消息行、pager | 通用 header/摘要卡和消息 card，首屏密度不同 | S1 | 四视口 |
| 全局搜索 | `/web/search` | page hero、搜索 panel、分组结果、pager | 通用 header/摘要卡，结果区域和筛选结构不同 | S1 | 四视口 |
| 项目列表 | `/web/projects` | page hero、3 指标、状态 tabs、项目 card grid | 通用 header/摘要卡，缺失基线 hero 与项目卡结构 | S1 | 四视口 |
| 项目详情 | `/web/projects/{key}` | detail hero、4 指标、整卡 tabs、概览双栏 | 通用 header/摘要卡，tab、hero、指标和概览均不同 | S1 | 四视口 |
| 周期详情 | `/web/projects/{key}/cycles/{id}` | detail hero、指标、详情双栏、状态/成员分析 | 当前为通用详情 panel/grid | S1 | 模板 + route；需专用 fixture |
| 资料详情 | `/web/projects/{key}/resources/{id}` | resource hero、摘要卡、锁定态和正文附件 | 当前为通用详情 panel，锁定与摘要层级不同 | S1 | 模板 + route；需专用 fixture |
| 个人分析 | `/web/projects/{key}/my-analysis` | 分析 header、8 指标、双栏负载与完成记录 | 通用 header/摘要卡，指标和分析区结构不同 | S1 | 四视口 |
| 需求列表 | `/web/requirements` | 3 指标、保存视图、筛选、compact table、批量栏 | 通用 header/摘要卡和非基线列表；多出 H1 | S1 | 四视口 |
| 任务列表 | `/web/tasks` | 同一列表合同、任务状态语义 | 同上 | S1 | 四视口 |
| Bug 列表 | `/web/bugs` | 同一列表合同、Bug 状态语义 | 同上 | S1 | 四视口 |
| 工作项详情 | `/web/work-items/{key}` | 专用 hero、作者正文、讨论、`280px` sticky rail | 通用 header/摘要卡，元数据 grid 和操作位置完全不同 | S1 | 四视口 |
| 系统总览 | `/web/system` | 无通用 hero 的 system card grid | 通用 header/摘要卡后再渲染入口卡 | S1 | 四视口 |
| 用户管理 | `/web/system/users` | page hero、用户 compact table、项目关系 modal | 通用 header/摘要卡，表格和 modal 布局不同 | S1 | 四视口 |
| 角色权限 | `/web/system/roles` | hero、角色 list、权限树双 panel | 通用 header/摘要卡和 DataTable | S1 | 四视口 |
| 角色权限详情 | `/web/system/roles/{code}/permissions` | 角色上下文和权限树 | 当前并入共享角色页交互 | S1 | 模板 + route/action |
| 权限目录 | `/web/system/permissions` | hero、层级权限树 | 通用 header/摘要卡和扁平表格 | S1 | 四视口 |
| 对象存储 | `/web/system/storage` | 主配置、桶状态、版本和说明侧栏 | 通用 header/摘要卡和表格化区域 | S1 | 四视口 |
| 系统 OpenAPI | `/web/system/openapi` | hero、接入说明双栏、Token table | 通用 header/摘要卡，说明与 Token 层级不同 | S1 | 四视口 |
| 版本管理 | `/web/system/releases` | hero、保留策略/约束双栏、版本列表与资产 modal | 通用 header/摘要卡和表格，策略区不同 | S1 | 四视口 |
| 数据库统计 | `/web/system/database-stats` | 单 panel、手动刷新、compact table | 通用 header/摘要卡，核心内容较接近 | S2 | 四视口 |
| 审计日志 | `/web/system/audit` | 单 panel、内联筛选、compact table | 通用 header/摘要卡，筛选和表格密度不同 | S2 | 四视口 |
| System API docs | `/web/system/api-docs` | Scalar 文档应用，独立 3,112px 文档页 | 当前自制 operation card 页面并套业务壳 | S1 | 四视口 |
| 登录 | `/web/login` | auth split panel + workspace visual | 当前模板主体沿用基线，改用独立 `auth.css` | S3 | 源码 + 既有四视口证据 |
| 初始化 | `/web/bootstrap` | auth split panel + setup visual | 当前模板主体沿用基线 | S3 | 源码 + 既有四视口证据 |
| 设备授权 | `/web/device-authorization` | `main` 固定 SHA 无对应页面 | Desktop 新增宿主边界，不做伪 1:1 | N/A | manifest + 当前边界证据 |
| Desktop 下载 | `/web/downloads` | 独立下载产品页 | 当前已重构，需单独按基线复核而非套业务壳 | S2 | 模板 diff + 既有四视口证据 |
| Shared App 入口 | `/web/app` | `main` 无独立长期视觉页面 | 仅 route owner/资源入口，不作为设计基线 | N/A | route + manifest |
| Public API docs | `/web/api-docs` | 独立 Scalar 文档应用 | 保持独立文档边界 | S3 | route + runtime |

## 运行态关键证据

- `main` 的 `.main` 在 `1440x900` 下统一为 `x=0, y=58, width=1440, height=842`，证明固定顶栏与独立内容滚动是全局合同。
- 21 个基线页面在四个视口均未产生 document 级横向溢出；移动端横向导航由顶栏内部滚动承载。
- Dashboard 基线为 `4 metric + 1 table + 3 panel`；当前为通用三摘要卡加业务卡，无项目表格。
- 项目详情基线为 `detail hero + 4 metric + tabs + overview 双栏`；当前先显示通用 header 和三摘要卡。
- 工作项详情基线首屏直接进入标题、正文、讨论和 sticky 操作栏；当前首屏被通用 header 与三摘要卡占用。
- System API docs 基线是独立 Scalar 页面；当前页面被共享业务壳包裹并改成自制卡片，不能通过 CSS 修复。

## 扫描完整性复核

| 核对项 | 结果 |
|---|---|
| manifest 页面 | `30/30` 已分类 |
| manifest 动作 | `81/81` 保留为后续状态截图清单来源 |
| Web 模板 | `35/35` 已纳入页面、partial 或边界分类 |
| 运行页面 | `21/21` 四视口采集完成 |
| 运行截图 | `main 84 + dev 84` |
| 结构指标 | `main 21 + dev 21` |
| 动态详情缺口 | 周期、资料、角色权限详情，已明确要求新增稳定 fixture |
| document 横向溢出 | 两组 21 页均为 `0`；不能据此推断视觉一致 |
| 工作区污染 | 仅 `.artifacts/`、`test-results/`，均不提交 |

## 对计划的约束

1. 第一阶段必须先删除“所有 route 共用 header + 三摘要卡”的强制结构，再恢复页面自有 hero；否则后续逐页 CSS 都会建立在错误 DOM 上。
2. `GlobalNavigation` 首轮改动只是局部接近，仍缺真实 logo、下载入口、系统下拉、项目搜索菜单、通知 icon/panel 和准确移动端顺序，必须在 V1 继续完成。
3. 不直接复制全部旧 CSS；按 token、primitive、页面族迁移，且每个页面必须有 main/current 的结构、computed style、几何和截图证据。
4. 周期、资料和角色权限详情在视觉实现前必须先建立稳定运行 fixture，不能只凭空态或源码宣称完成。
5. 旧页面进入 React 后仍保持现有共享业务逻辑和 Desktop adapter；视觉还原不能恢复 SSR handler、整页跳转或页面级宿主分叉。
