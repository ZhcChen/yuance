# UI v3 回迁 P4 页面改造阶段小结

- 规格：`specs/ui-v3-react/spec.md`
- 方案：`specs/ui-v3-react/plan.md`（阶段五 P4）
- 任务：`specs/ui-v3-react/tasks.md`（T016-T027）
- 复核日期：2026-11-06

## 结论

**通过。** P4 覆盖的九个页面全部按设计稿改造完成，视觉合同与体验清单同步到位。

## 本阶段改造的页面

| 任务 | 页面 | 复核记录 |
|---|---|---|
| T016 | 工作台 | `2026-11-06-ui-v3-react-p4-workbench.md` |
| T017 | 项目列表 | `2026-11-06-ui-v3-react-p4-project-list.md` |
| T018 | 需求 / 任务 / Bug 列表 | `2026-11-06-ui-v3-react-p4-work-item-list.md` |
| T019 | 工作项详情 | `2026-11-06-ui-v3-react-p4-work-item-detail.md` |
| T020 | 资料库与资料详情 | `2026-11-06-ui-v3-react-p4-resource-pages.md` |
| T021 | 消息中心 | `2026-11-06-ui-v3-react-p4-message-center.md` |
| T022 | 全局搜索 | `2026-11-06-ui-v3-react-p4-search-and-messages.md` |
| T023 | 个人中心 | `2026-11-06-ui-v3-react-p4-profile.md` |
| T024 | 系统管理各子页 | `2026-11-06-ui-v3-react-p4-system-pages.md` |

## 统一的改造手法

1. **页头**：`.page-head`（标题、说明、操作）取代 `.page-hero` / `.shell-panel-header`。
2. **指标磁贴**：统一用 `Metric` 组件，一行四个，底色统一品牌浅色、图标按语义着色。
3. **面板**：列表、筛选、详情正文统一用 `Panel`，表格与分页贴在面板内。
4. **属性信息**：用 `.props` 两列网格承载状态、优先级、负责人等字段。
5. **空态**：统一用 `EmptyState` 组件。

## 刻意保留的内容

以下设计稿要素在生产里没有对应数据或能力，本阶段没有为了对齐而新增统计维度：

- 工作项列表与消息中心的指标口径；
- 项目详情与系统总览的汇总数字；
- 资料库右栏的资料类型统计（表格里已有分类与来源两列）；
- 个人中心的偏好设置。

## T026 复核：仅皮肤调整的组件

| 组件 | 是否改动行为 | 说明 |
|---|---|---|
| 附件列表与上传 | 否 | 只在 P2 换过皮肤，P4 未动组件实现 |
| 富文本编辑器与阅读器 | 否 | 同上 |
| 评论与讨论 | 否 | 只把讨论区块改成面板外观，评论逻辑未动 |
| 时间分配甘特图 | 否 | 同上 |
| 时间管理页面 | 否 | 页面内容与交互完全沿用现有实现，侧栏入口保留并标注「沿用现有实现」 |

## 阶段验证

| 验证项 | 命令 | 结果 |
|---|---|---|
| 前端全量检查 | `npm --prefix frontend run check` | 通过 |
| Web 全量检查 | `npm --prefix web run check` | 通过 |
| 生产构建 | `npm --prefix web run build` | 通过 |
| API 测试 | `cargo test -p yuance-api` | 通过 |
| 视觉护栏 | `npm --prefix web run test:visual` | 结构层 5/5、像素层 4/4 通过 |
| 全量 e2e | `npx playwright test`（干净数据库） | 96 通过 / 27 失败 / 4 跳过 |
| 构建 | `make web-build` | 通过 |
| 全量检查 | `make frontend-check` | web 与 frontend 各包全部通过；desktop 段因 `desktop/node_modules` 为空缺少 `tsc` 无法执行（既有环境问题） |

### e2e 失败集合说明

阶段结束时仍然失败的 27 条全部属于回迁前就存在的问题（回迁前基线为 28 条失败），
失败集合是基线的子集，没有引入新回归，逐条归因见各页复核记录：

1. 工作项详情弹窗里的原生 `select` 被判定为不可见（回迁前基线同样失败）。
2. 断言引用了代码里已经不存在的旧结构（陈旧用例）。
3. 用例依赖执行顺序或运行之间共享的数据库状态。
4. 预览 iframe 未渲染 Markdown 正文（回迁前同样失败）。

## 遗留

- 桌面端 renderer 仍无法构建（`desktop/node_modules` 为空），桌面端走查与两端截图对照未完成。
- 暗色主题走查（P5）尚未开始。
