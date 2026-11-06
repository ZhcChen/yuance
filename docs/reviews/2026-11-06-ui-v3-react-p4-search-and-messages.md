# UI v3 回迁 P4 全局搜索 复核记录

- 规格：`specs/ui-v3-react/spec.md`
- 任务：`specs/ui-v3-react/tasks.md`（T022）
- 设计稿参照：`ui-v3/scripts/pages/search.js`
- 复核日期：2026-11-06

## 结论

**通过。** 全局搜索按设计稿改成「页头 + 搜索条件面板 + 按类型分组的结果面板」。

## 结构对照

| 设计稿 | 生产实现 |
|---|---|
| `page-head` 全局搜索 | `.page-head`：标题、关键词说明、返回工作台 |
| `filter-bar` 关键词与范围 | `Panel title="搜索条件"`，保留关键词输入与搜索按钮 |
| `panel` 按类型分组的结果 | 每个类型一个面板（项目 / 需求 / 任务 / Bug / 资料），组内是结果列表 |

## 实现要点

1. **结果分组**：新增 `searchResultGroups`，按接口返回的 `kind` 分组，组标题与条数用面板承载。
2. **类型中文标签**：新增 `searchResultKindLabel()`，把接口的原始类型码转成中文。
3. **未新增类型筛选**：设计稿有「范围」下拉，但搜索接口没有按类型过滤的字段，
   本轮不新增后端统计维度，避免出现「前端筛选、后端计数」的错位。

## parity 合同同步

| 项 | 原值 | 新值 |
|---|---|---|
| `regionOrder` | `["page-hero","search-panel","result-groups","pager"]` | `["page-head","search-panel","result-groups","pager"]` |
| `stableAnchors` | `.page-hero` / `.search-panel` / `.search-result-list` | `.page-head` / `.search-form` / `.search-result-list` |
| `geometryAnchors` | `.main` / `.page-hero` / `.search-panel` | `.main` / `.page-head` / `.search-form` |

## 验证记录

| 验证项 | 命令 | 结果 |
|---|---|---|
| 前端全量检查 | `npm --prefix frontend run check` | 通过 |
| Web 全量检查 | `npm --prefix web run check` | 通过 |
| 生产构建 | `npm --prefix web run build` | 通过 |
| 视觉护栏 | `npm --prefix web run test:visual` | 结构层 5/5、像素层 4/4 通过 |
| 搜索相关 e2e | `npx playwright test -g search` | 4 通过 / 0 失败 |

## e2e 用例同步

| 用例 | 变更 |
|---|---|
| `app-owner global search loads shared results and resolves result targets` | 标题改为「全局搜索」；结果选择器从单个列表改为按分组后的结果项 |
| `message and search pages preserve the main responsive geometry` | 标题断言同步 |

## 遗留

- 桌面端 renderer 仍无法构建，桌面端走查未完成（沿用 P3 的未验证项）。
