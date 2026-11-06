# UI v3 回迁 P4 工作项列表改造 复核记录

- 规格：`specs/ui-v3-react/spec.md`
- 方案：`specs/ui-v3-react/plan.md`（阶段五 P4）
- 任务：`specs/ui-v3-react/tasks.md`（T018 / T025 的工作项列表条目）
- 设计稿参照：`ui-v3/scripts/pages/work-items.js`
- 复核日期：2026-11-06

## 结论

**通过。** 需求 / 任务 / Bug 共用一套模板，三张页面同时改成设计稿的
「页头 + 四块指标磁贴 + 筛选条件面板 + 列表面板 + 批量操作条」结构。

## 结构对照

| 设计稿 | 生产实现 |
|---|---|
| `page-head`（h1 + 说明 + 新建） | `.page-head`，说明里带上当前项目与筛选提示 |
| `metrics` 四块指标磁贴 | `Metric` 组件：全部 / 待处理·进行中·待确认 / 高优先级 / 已完成 |
| `panel` 筛选条件 | `Panel` 标题「筛选条件」，说明是当前生效条件的可读摘要 |
| `panel` 列表 + `foot` 分页 | `Panel` 标题「需求列表 / 任务列表 / Bug 列表」，分页贴在面板底部 |
| `bulk-bar` 批量操作条 | 保留既有批量更新能力，视觉改为设计稿的品牌浅底条 |
| 状态 / 优先级 | `StatusPill` 状态胶囊 + `PriorityBadge` 形状优先级 |

表格列按设计稿重排为「选择 / 编号 / 标题 / 状态 / 优先级 / 处理人 / 截止 / 更新 / 操作」：
列表本身按当前项目过滤，原有的「项目」列是冗余信息，因此去掉；
「截止」与「更新」两列由接口补齐后新增。

## 后端改动

1. **工作项摘要带出截止日期**：`WorkItemSummary` 与 `WorkItemPayload` 增加 `due_date`，
   列表 SQL 直接取 `work_items.due_date`，没有额外查询。
2. **列表汇总增加已完成数**：`WorkItemListStats` 与 `WorkItemListSummaryPayload` 增加
   `completed_items`，统计口径为状态命中 `done` / `verified`。
3. **结构修复**：改壳层时把原来的「面板 section」换成了 `Panel` 组件，
   多出来的一个 `</section>` 让整页 JSX 失衡；顺带把这类问题纳入构建期检查
   （`npm --prefix web run build` 会直接报 JSX 解析错误，前端检查不会）。

## 顺手修掉的两处

1. **指标磁贴列数断言**：设计稿用 `repeat(auto-fit, minmax(210px, 1fr))`，
   空轨道折叠成 `0px`，e2e 计数需要排除折叠轨道。
2. **批量操作条样式**：原先是普通灰条，现在按设计稿改成品牌浅底 + 品牌描边。

## 顺带修掉的前端类型检查失败

改造过程中暴露出上一阶段遗留的类型问题：`npm --prefix frontend run check`
与 `npm --prefix web run check` 的 `tsc --checkJs` 阶段其实一直是红的，
本轮一并修好：

| 位置 | 问题 | 处理 |
|---|---|---|
| `ui/src/primitives.jsx` | `Badge` 的 `tone` 类型没有 `brand`，但工作台与项目卡片已经在用 | 补 `brand` 并新增 `.yc-badge-brand` 样式 |
| `ui/src/primitives.jsx` | `ContentTabs` 判断角标时把断言打在 `child` 上，`child.props` 取不到 | 断言改到 `child.props` |
| `app-core/src/routes.js` | `normalizeOwner` 的返回值被推断成 `string`，导致路由 `owner` 传不进 `'app' \| 'web'` 参数 | 补 `@returns {'app' \| 'web'}` |
| `app-shell/src/app.jsx` | `submitProjectSearch` 的 JSDoc 写了三个不存在的参数，表单元素还被断言成可空 | 按实际签名改成 React 表单事件 |
| `app-shell/src/app.jsx` | `AppProject` / `AppWorkItem` / `AppWorkItemPage.summary` 三个 typedef 缺新增字段 | 补 `owner_username`、`pending_*`、`due_date`、`completed_items` |
| `api-client/src/work-items.js` | 列表汇总缺 `completed_items` | 补齐 |
| `web/src/lib/api.js` | `WorkItemSummary` 缺 `due_date`，`getProjects` 缺关键词与待处理数字段 | 补齐 |
| `web/test/routes.test.mjs` | 项目路由新增 `q` 字段后断言未同步 | 断言补 `q: ''` |

## parity 合同同步

| 项 | 原值 | 新值 |
|---|---|---|
| `regionOrder` | `["metrics","filters","batch-bar","table","pager"]` | `["page-head","metrics","filters","batch-bar","table","pager"]` |
| `stableAnchors` | `.work-item-list-metrics` / `.work-item-filter-bar` / `.work-item-table` | 增加 `.work-item-list-page` |
| `geometryAnchors` | `.main` / `.work-item-list-metrics` / `.work-item-table` | 增加 `.work-item-list-page` |
| `responsiveExpectations` | 指标固定三列 | 指标磁贴按宽度自适应折行 |

## 验证记录

| 验证项 | 命令 | 结果 |
|---|---|---|
| 前端全量检查 | `npm --prefix frontend run check` | 通过（`tsc --checkJs` 0 错误，单测 0 失败） |
| Web 全量检查 | `npm --prefix web run check` | 通过（`tsc --checkJs` 0 错误，单测 0 失败） |
| 生产构建 | `npm --prefix web run build` | 通过 |
| API 测试 | `cargo test -p yuance-api` | 24 个测试目标全部通过，0 失败 |
| 视觉护栏（结构层） | `npm --prefix web run test:visual` | 5/5 通过；20 个页面 × 5 档宽度无横向溢出 |
| 视觉护栏（像素层） | 同上 | 4/4 通过；工作项列表 4 张基线按新结构重新生成 |
| 全量 e2e | `npx playwright test`（干净数据库） | 95 通过 / 28 失败 / 4 跳过 |

### e2e 失败集合

本轮失败集合与上一轮（T017 项目列表后）完全一致，28 条全部是既有失败：

1. 工作项详情弹窗里的原生 `select` 被 Playwright 判定为不可见（回迁前基线同样失败）。
2. 若干用例依赖执行顺序（当前项目切换、项目数增长导致分页变化）。
3. e2e 运行之间共享数据库造成的状态残留。

本轮新增的 4 条失败是断言没跟上结构改造，已同步：

| 用例 | 旧断言 | 新断言 |
|---|---|---|
| `formal web task list keeps web route ownership while filtering` | 一级标题「任务列表」 | 一级标题「任务」 |
| `global project switch navigates the current work item list to the selected project` | 一级标题「任务列表」 | 一级标题「任务」 |
| `shared work item lists hide creation when the atomic contract is read only` | 一级标题「任务列表」 | 一级标题「任务」 |
| `shared work item lists render a stable empty state for filtered results` | `.work-item-list-empty` | `.yc-empty`（改用 `EmptyState` 组件） |

## 遗留

- 「工作项列表几何」用例依赖前序用例把当前项目切到 `YCE`，单独跑会因为当前项目没有数据而失败。
  这是既有的用例耦合，本轮没有改动其行为。
- 桌面端 renderer 仍无法构建，桌面端走查未完成（沿用 P3 的未验证项）。
