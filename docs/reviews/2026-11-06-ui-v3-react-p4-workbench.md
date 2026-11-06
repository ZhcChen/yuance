# UI v3 回迁 P4 工作台改造 复核记录

- 规格：`specs/ui-v3-react/spec.md`
- 方案：`specs/ui-v3-react/plan.md`（阶段五 P4）
- 任务：`specs/ui-v3-react/tasks.md`（T016 / T025 的工作台条目）
- 设计稿参照：`ui-v3/scripts/pages/workbench.js`
- 复核日期：2026-11-06

## 结论

**通过。** 工作台按设计稿重排为「页头 + 指标磁贴 + 项目推进 / 我的待处理 + 待我处理讨论 / 最近动态」，
指标、面板、列表行与时间线全部换成设计稿的组件形态，parity 合同与体验清单同步到新结构。

## 结构对照

| 设计稿 | 生产实现 |
|---|---|
| `page-head`（h1 + 说明 + 刷新 / 新建项目） | `.page-head`，h1 为「工作台」，`Panel` 之外的页面级动作区 |
| `metrics` 四块指标磁贴 | `Metric` 组件（`yc-metric`），四块：进行中项目 / 我的待处理 / 已完成项目 / 高优先级 |
| `panel` 项目推进 + 紧凑表格 | `Panel` + `compact-table`，列与设计稿一致 |
| `panel` 我的待处理 + 列表行 | 新增面板，数据来自工作台聚合接口的 `assigned_items` |
| `panel` 待我处理讨论 + 列表行 | `Panel` + `.list-rows`，行内含头像、标题、来源与未读类型角标 |
| `panel` 最近动态 + 时间线 | `Panel` + `.timeline`，行内含头像、摘要与时间 |

指标口径按生产可取到的数据落地，没有引入设计稿里的演示口径：

| 指标 | 取值 | 说明 |
|---|---|---|
| 进行中项目 | `metrics.active_projects` | 副文案为可见项目总数 |
| 我的待处理 | 需求 + 任务 + Bug 的未完成指派数 | 与面板列表同口径 |
| 已完成项目 | 状态为 `completed` / `archived` 的项目数 | 设计稿的「本周完成」无对应接口字段，改为可取到的完成口径 |
| 高优先级 | `metrics.high_priority` | P0 / P1 且未完成 |

## 后端改动

工作台聚合接口 `/api/v1/dashboard` 的载荷新增 `assigned_items`：

- 服务端本来就为了统计 `assigned_total` 与 `high_priority` 拉取了指派工作项摘要，
  这里直接把同一批摘要按「未完成状态」过滤、按最近更新排序、取前 6 条放进载荷，
  **没有新增数据库查询**。
- 前端因此不需要再发一次工作项列表请求；原先按类型过滤的列表接口本身不支持跨类型查询，
  多发三次请求才能拼出同样的列表。

## 共享图标

新增 `frontend/packages/ui/src/icons.jsx`：

- 20 个内联 SVG 描边路径，统一 24×24 视框、`currentColor` 描边；
- 侧栏原先自带的图标表并入该模块，侧栏改为引用共享图标，避免两套图标各走各的；
- 不用 emoji，也不用外链图标字体或雪碧图，深浅色与离线部署都不会缺图。

## 顺手修掉的三处

1. **面板标题不是标题**：`Panel` 的标题渲染成 `div`，页面上读不到大纲。
   改为 `h2`（与设计稿一致），样式同步去掉浏览器默认外边距。
2. **指标磁贴列数断言**：设计稿用 `repeat(auto-fit, minmax(210px, 1fr))`，
   空轨道会被折叠成 `0px`，e2e 里按 `gridTemplateColumns` 计数需要排除折叠轨道。
3. **标签角标探出标签条**：P2 把标签改成下划线形态后，角标仍挂在标签右上角外侧 6px，
   最后一个标签带角标时角标会探出标签条边界，触发「消息筛选不裁剪角标」这条既有 e2e 约束。
   现在标签条在存在角标时预留等宽的右侧余量，角标回到边界内（实测 `right` 为 0）。

## parity 合同同步

| 项 | 原值 | 新值 |
|---|---|---|
| `regionOrder` | `["metrics","project-table","discussion-activity-grid"]` | `["page-head","metrics","project-table","my-queue","discussion-activity-grid"]` |
| `stableAnchors` | `.metric-grid` / `.compact-table` / `.workspace-side` | 增加 `.dashboard-page` / `.list-rows` / `.timeline` |
| `geometryAnchors` | `.main` / `.metric-grid` / `.workspace-grid` | 增加 `.dashboard-page` |
| `responsiveExpectations` | 指标在窄屏转单列 | 指标磁贴按可用宽度自适应折行 |
| `dynamicMasks` | `.activity-list span` | `.timeline__meta span` |

体验清单同步 `controls`（新增 `my-queue`）与 `states`（新增 `empty-queue`）。

## 验证记录

| 验证项 | 命令 | 结果 |
|---|---|---|
| 前端全量检查 | `npm --prefix frontend run check` | 通过（60 + 76 + 8 + 99 项测试 0 失败） |
| Web 全量检查 | `npm --prefix web run check` | 通过（68 项测试 0 失败） |
| 生产构建 | `npm --prefix web run build` | 通过 |
| API 测试 | `cargo test -p yuance-api` | 全部通过，0 失败（19 个测试二进制） |
| 视觉护栏（结构层） | `npm --prefix web run test:visual` | 5/5 通过；20 个页面 × 5 档宽度无横向溢出 |
| 视觉护栏（像素层） | 同上 | 4/4 通过；工作台 4 张基线按新结构重新生成 |
| 全量 e2e | `npm --prefix web run test:e2e`（干净数据库） | 94 通过 / 28 失败 / 4 跳过；P3 为 92 / 30 / 4，无新增失败 |
| 浏览器走查 | 工作台 1440 / 768 / 390 | 运行时错误 0；浅色与深色两套主题均正常 |

## 遗留

- 桌面端 renderer 因 `desktop/node_modules` 为空仍无法构建，桌面端走查未完成（沿用 P3 的未验证项）。
- 剩余 e2e 失败仍是既有集合：工作项详情弹窗里的隐藏原生 select 在弹窗刚打开时被判为不可见，
  以及若干依赖用例执行顺序的用例；本轮没有新增失败，也没有改动这些用例的行为。
