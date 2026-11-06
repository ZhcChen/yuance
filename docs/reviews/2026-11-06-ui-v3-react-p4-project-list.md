# UI v3 回迁 P4 项目列表改造 复核记录

- 规格：`specs/ui-v3-react/spec.md`
- 方案：`specs/ui-v3-react/plan.md`（阶段五 P4）
- 任务：`specs/ui-v3-react/tasks.md`（T017 / T025 的项目列表条目）
- 设计稿参照：`ui-v3/scripts/pages/projects.js`
- 复核日期：2026-11-06

## 结论

**通过。** 项目列表按设计稿重排为「页头 + 四块指标磁贴 + 分段筛选与关键词 + 项目卡片栅格」，
卡片换成设计稿的三段式结构，筛选从标签页改成设计稿的分段控件，并补上了设计稿有的关键词检索。

## 结构对照

| 设计稿 | 生产实现 |
|---|---|
| `page-head`（h1 + 说明 + 新建项目） | `.page-head`，说明里带上项目总数与当前关键词 |
| `metrics` 四块指标磁贴 | `Metric` 组件：进行中项目 / 我负责的 / 待处理工作项 / 全部项目 |
| `btn-group` 范围分段 + 关键词输入 | `.scope-group` 分段控件 + `.projects-search` 搜索表单 |
| `card-grid` 项目卡片 | `.project-card-grid`，卡片按设计稿分「标识与标题 / 待处理拆分 / 负责人与操作」三段 |
| — | 分页与「设为当前项目」等生产能力保留 |

设计稿的范围分段是「全部 / 我负责的 / 我参与的 / 已归档」，
生产侧既有的是按项目状态的八项筛选（可分享、可回放），
因此保留状态筛选但改成设计稿的分段控件形态；「我负责的 / 我参与的」两个口径落在指标磁贴上，
因为按负责人和按成员过滤需要新的接口维度，收益不足以支撑这次改造的范围。

## 后端改动

1. **项目列表支持关键词**：查询参数新增 `q`，在 `ProjectListFilter` 里落到
   `项目名 OR 项目编号` 的模糊匹配，三条列表查询（超级管理员全量、按成员可见、计数）同步生效。
2. **项目载荷补齐卡片需要的字段**：
   - `owner_username`：用于统计「我负责的」，不再靠展示名比对；
   - `pending_requirements` / `pending_tasks` / `pending_bugs`：
     复用工作台已经在算的待处理计数函数，按项目回填到列表项，卡片上的需求 / 任务 / Bug 角标才有数据来源。

## 顺手修掉的两处

1. **页面栅格列不可收缩**：`.page-stack` 的隐式列按内容最大宽度撑开，
   窄屏下一个不换行的分段控件就能把整页撑出横向滚动条。
   改成 `grid-template-columns: minmax(0, 1fr)`，同类问题在其它页面一并消失。
2. **页头说明没有样式类**：说明段落漏写 `page-head__desc`，字号与颜色没有生效。

## parity 合同同步

| 项 | 原值 | 新值 |
|---|---|---|
| `regionOrder` | `["page-hero","metrics","status-tabs","project-grid","pager"]` | `["page-head","metrics","scope-row","project-grid","pager"]` |
| `stableAnchors` | `.page-hero` / `.project-list-metrics` / `.project-card-grid` | 增加 `.projects-page` / `.scope-group` / `.projects-search` |
| `responsiveExpectations` | 指标固定三列 | 指标磁贴按宽度自适应折行 |

体验清单同步 `controls`（新增 `project-search`）。

## 验证记录

| 验证项 | 命令 | 结果 |
|---|---|---|
| 前端全量检查 | `npm --prefix frontend run check` | 通过（60 + 76 + 8 + 99 项测试 0 失败） |
| Web 全量检查 | `npm --prefix web run check` | 通过（68 项测试 0 失败） |
| 生产构建 | `npm --prefix web run build` | 通过 |
| API 测试 | `cargo test -p yuance-api` | 全部通过，0 失败；新增关键词过滤接口用例 |
| 视觉护栏（结构层） | `npm --prefix web run test:visual` | 5/5 通过；20 个页面 × 5 档宽度无横向溢出 |
| 视觉护栏（像素层） | 同上 | 4/4 通过；工作台与项目列表 8 张基线按新结构重新生成 |
| 项目列表专项 e2e | `npx playwright test -g "project list"` | 通过（含新增的关键词筛选用例） |
| 全量 e2e | `npm --prefix web run test:e2e`（干净数据库） | 95 通过 / 28 失败 / 4 跳过；失败集合与上一轮完全一致 |

## 遗留

- 设计稿底部的「最近更新的工作项」面板需要跨项目的最近工作项查询，当前列表接口按项目过滤，
  本轮没有新增这类跨项目查询，暂不实现。
- 桌面端 renderer 仍无法构建，桌面端走查未完成（沿用 P3 的未验证项）。
