# UI v3 回迁 P4 消息中心 复核记录

- 规格：`specs/ui-v3-react/spec.md`
- 方案：`specs/ui-v3-react/plan.md`（阶段五 P4）
- 任务：`specs/ui-v3-react/tasks.md`（T021）
- 设计稿参照：`ui-v3/scripts/pages/messages.js`
- 复核日期：2026-11-06

## 结论

**通过。** 消息中心按设计稿改成「页头 + 四块指标磁贴 + 标签筛选 + 消息列表面板」结构。

## 结构对照

| 设计稿 | 生产实现 |
|---|---|
| `page-head` 消息中心 | `.page-head`：标题、说明、「全部标为已读」按钮 |
| `metrics` 四块指标磁贴 | `Metric`：全部消息 / 未读消息 / 待处理讨论 / 已读消息 |
| `tabs` 分类筛选 | 保留 `ContentTabs`，分类沿用生产口径（全部 / 未读 / 待处理讨论 / 已读） |
| `panel` 消息列表 | `Panel title="消息列表"`，列表与分页贴在面板内 |
| `emptyState` 空态 | 改用 `EmptyState` 组件 |

设计稿的指标是「未读 / 提及我 / 回复我 / 转交给我」，
生产接口按未读与待处理两个口径统计，没有按消息类型分组统计的字段，
因此指标沿用生产口径的四个数字，避免为了凑设计稿而新增统计维度。

## parity 合同同步

| 项 | 原值 | 新值 |
|---|---|---|
| `regionOrder` | `["compact-heading","tabs","message-list","pager"]` | `["page-head","metrics","tabs","message-list","pager"]` |
| `stableAnchors` | `.page-heading` / `.yc-content-tabs` / `.message-list` | `.page-head` / `.message-metrics` / `.yc-content-tabs` / `.message-list` |
| `geometryAnchors` | `.main` / `.yc-content-tabs` / `.message-list` | 增加 `.message-metrics` |
| `responsiveExpectations` | 消息行单列且操作不溢出 | 指标折行且消息行单列不溢出 |

## 验证记录

| 验证项 | 命令 | 结果 |
|---|---|---|
| 前端全量检查 | `npm --prefix frontend run check` | 通过 |
| Web 全量检查 | `npm --prefix web run check` | 通过 |
| 生产构建 | `npm --prefix web run build` | 通过 |
| 视觉护栏 | `npm --prefix web run test:visual` | 结构层 5/5、像素层 4/4 通过 |
| 消息相关 e2e | `npx playwright test -g message` | 5 通过 / 0 失败 |

## 遗留

- 桌面端 renderer 仍无法构建，桌面端走查未完成（沿用 P3 的未验证项）。
