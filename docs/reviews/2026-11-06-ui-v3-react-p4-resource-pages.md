# UI v3 回迁 P4 资料库与资料详情 复核记录

- 规格：`specs/ui-v3-react/spec.md`
- 方案：`specs/ui-v3-react/plan.md`（阶段五 P4）
- 任务：`specs/ui-v3-react/tasks.md`（T020）
- 设计稿参照：`ui-v3/scripts/pages/resources.js`
- 复核日期：2026-11-06

## 结论

**通过。** 资料库与资料详情按设计稿改成「页头 + 面板 + 右侧属性栏」结构。

## 结构对照

| 设计稿 | 生产实现 |
|---|---|
| `page-head` 资料库 | `.page-head`：标题、当前项目说明、「新建资料」按钮 |
| `panel` 筛选条件 | `Panel title="筛选条件"`，说明由当前生效条件生成可读摘要 |
| `panel` 资料目录 | `Panel title="资料目录"`，表格与分页贴在面板内 |
| 设计稿右栏（资料类型 / 最近关联） | **未采纳**：资料库表格已有「分类」与「来源」两列，重复的信息不再单列一栏 |
| `breadcrumb` 资料库 / 标题 | 详情页面包屑：返回箭头 + 资料库 + 标题 |
| `page-head` 资料详情 | 标题 + 分类胶囊、说明、编辑 / 归档 / 重置密码 |
| `panel` 正文 | 正文面板，内部保留富文本与目录 |
| `panel` 目录 / 关联工作项 | 右栏：关联工作项、资料信息 |

## 关键实现

1. **筛选条件摘要**：新增 `projectResourceFilterSummary()`，把关键词、分类、状态、标签拼成一句可读说明。
2. **正文高度链**：资料详情是「整页不滚动、正文内部滚动」的结构，
   `.resource-detail-page`（flex 列）→ `.resource-detail-layout`（grid）→ `.resource-detail-main`（grid）
   → 面板主体（grid）→ 富文本容器，每一层都补上 `min-height: 0`，
   否则目录点击无法把正文滚到对应章节。
3. **标题不重复**：正文本身带一级标题时，页头改用普通段落展示标题，保证页面只有一个 `h1`。
4. **窄屏折叠**：≤1024px 时右栏排到正文之后，与工作项详情一致。

## parity 合同同步

| 项 | 原值 | 新值 |
|---|---|---|
| `regionOrder` | `["resource-hero","summary","body"]` | `["breadcrumb","page-head","body","properties"]` |
| `stableAnchors` | `.resource-reader-header` | 增加 `.breadcrumb`、`.resource-content-card`、`.resource-detail-aside` |
| `geometryAnchors` | `.resource-content-card` | 增加 `.main`、`.resource-detail-layout` |
| `responsiveExpectations` | 资料正文与附件单列 | 资料正文单列且属性栏排在正文之后 / 正文与 300px 属性栏并排 |

资料库页没有登记进视觉合同：合同与体验清单要求每个页面都有正式 Web 路由，
而资料库目前只存在于共享应用（`/web/app/projects/{project_key}/resources`），
强行登记会破坏「每个 route method 只有一个 contract owner」的约束。
该页改由结构护栏单独收录，做横向溢出与标题层级断言。

## 验证记录

| 验证项 | 命令 | 结果 |
|---|---|---|
| 前端全量检查 | `npm --prefix frontend run check` | 通过（`tsc --checkJs` 0 错误，单测 0 失败） |
| Web 全量检查 | `npm --prefix web run check` | 通过 |
| 生产构建 | `npm --prefix web run build` | 通过 |
| 视觉护栏（结构层） | `npm --prefix web run test:visual` | 5/5 通过；结构护栏新增资料库页面 |
| 视觉护栏（像素层） | 同上 | 4/4 通过 |
| 资料相关 e2e | `npx playwright test -g resource` | 10 通过 / 1 失败（回迁前同样失败） |

## e2e 用例同步

| 用例 | 变更 |
|---|---|
| `shared project resources filter read and unlock protected details` | 元信息断言改到页头说明；返回链接改到面包屑；几何断言改测新布局与 300px 属性栏 |
| `project resource library presents linked posts ...` | 筛选卡片选择器保留 `project-resource-library-filter-card` 类名 |
| `shared project resources hide mutations from viewers` 等 | 资料库标题从三级标题改为一级标题「资料库」 |

## 遗留

- `shared project resource attachments render inline and are managed from the editor` 仍失败：
  预览 iframe 没有渲染出 Markdown 正文，回迁前同样失败，属于既有问题。
- 桌面端 renderer 仍无法构建，桌面端走查未完成（沿用 P3 的未验证项）。
