# UI v3 回迁 P4 工作项详情改造 复核记录

- 规格：`specs/ui-v3-react/spec.md`
- 方案：`specs/ui-v3-react/plan.md`（阶段五 P4）
- 任务：`specs/ui-v3-react/tasks.md`（T019）
- 设计稿参照：`ui-v3/scripts/pages/work-item-detail.js`
- 复核日期：2026-11-06

## 结论

**通过。** 工作项详情改成设计稿的「面包屑 + 页头 + 主栏面板 + 右侧属性栏」结构。

## 结构对照

| 设计稿 | 生产实现 |
|---|---|
| `breadcrumb` 面包屑 | `.breadcrumb`：返回箭头 + 工作台 / 项目 / 类型 |
| `page-head`（标题 + 类型徽章 + 说明 + 操作） | `.page-head.work-item-head`：标题、类型胶囊、编号与更新时间、操作按钮 |
| `panel` 描述 | `Panel title="描述"`，面板内保留发布人与更新时间 |
| `panel` 讨论 / 附件 | 讨论与附件区块改成面板外观（卡片 + 面板头） |
| `panel` 属性 | `Panel title="属性"`，`.props` 两列网格：状态、优先级、负责人、报告人、所属项目、截止日期、创建时间、最近更新、所属周期 |
| `panel` 关联工作项 | `Panel title="关联工作项"`：父级需求 + 上一个 / 下一个导航 |

## 操作入口的重新分配

设计稿把主要操作放在页头、属性信息放在右栏，生产实现原先相反（右栏是操作栏、标题旁是状态标签）。
本轮按设计稿重排，功能一个不少：

| 操作 | 新位置 |
|---|---|
| 编辑内容 | 页头主操作 |
| 指派 / 流转 | 页头主操作 |
| 重新打开 | 页头次操作（可重新打开时出现） |
| 关闭工作项 | 属性面板底部（危险操作留在侧栏） |
| 链接 / 取消资料库链接 | 属性面板底部 |
| 查看操作记录 | 属性面板底部 |
| 发表新评论 | 移除按钮，讨论区自带评论框 |

## 顺带修掉的问题

1. **类型徽章换肤**：原先是实心色块，改成设计稿的浅底胶囊（需求紫、任务靛蓝、Bug 红）。
2. **失效样式清理**：`.work-item-hero`、`.work-item-title-row`、`.action-panel-*` 等 22 条规则随结构改造一起删除。
3. **组件测试同步**：`frontend/packages/ui/test/work-item-detail.test.mjs` 的属性断言改为新的 `.props` 结构。

## parity 合同同步

| 项 | 原值 | 新值 |
|---|---|---|
| `regionOrder` | `["detail-hero","author-body","description","flow-history","discussion","action-rail"]` | `["breadcrumb","page-head","description","discussion","attachments","properties"]` |
| `stableAnchors` | `.work-item-hero` / `.work-item-layout` / `.work-item-action-rail` | `.breadcrumb` / `.work-item-head` / `.work-item-layout` / `.work-item-action-rail` / `.props` |
| `responsiveExpectations` | 主栏与 280px sticky 操作栏 | 主栏与 300px sticky 属性栏 |

## 验证记录

| 验证项 | 命令 | 结果 |
|---|---|---|
| 前端全量检查 | `npm --prefix frontend run check` | 通过（`tsc --checkJs` 0 错误，单测 0 失败） |
| Web 全量检查 | `npm --prefix web run check` | 通过 |
| 生产构建 | `npm --prefix web run build` | 通过 |
| 视觉护栏（结构层） | `npm --prefix web run test:visual` | 5/5 通过；20 个页面 × 5 档宽度无横向溢出 |
| 视觉护栏（像素层） | 同上 | 4/4 通过 |
| 全量 e2e | `npx playwright test`（干净数据库） | 95 通过 / 28 失败 / 4 跳过，失败集合与改造前完全一致 |

## e2e 用例同步

| 用例 | 变更 |
|---|---|
| `work item detail preserves the main responsive geometry` | 侧栏宽度 280 → 300；窄屏下属性栏改排到正文之后，断言同步为 `railBeforeContent` 为 false |
| `work item detail can edit and handoff through app shell forms` | 状态断言从 `.work-item-title-tags` 改到 `.work-item-properties .props` |
| `business timezone ... work item displays use east eight`（3 个时区） | 属性断言从 `.action-panel-context` 改到 `.work-item-properties .props` |
| `app-owner message center opens semantic target inside app shell` | 详情页现在有四个二级标题，断言改为指定「描述」 |

## 遗留

- `formal web work item detail keeps web route ownership` 仍失败：它断言一个代码里已经不存在的三级标题「评论与流转」，
  属于回迁之前就存在的陈旧断言，本轮未改动其行为。
- 桌面端 renderer 仍无法构建，桌面端走查未完成（沿用 P3 的未验证项）。
