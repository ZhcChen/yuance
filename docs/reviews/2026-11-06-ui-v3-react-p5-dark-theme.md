# UI v3 回迁 P5 暗色主题与收尾 复核记录

- 规格：`specs/ui-v3-react/spec.md`
- 方案：`specs/ui-v3-react/plan.md`（阶段六 P5）
- 任务：`specs/ui-v3-react/tasks.md`（T028-T031）
- 复核日期：2026-11-06

## 结论

**通过（桌面端部分仍未验证）。** 暗色主题沿用生产包既有令牌，原型补齐主题开关与规格说明。

## 暗色主题的处理方式

暗色不另起一套颜色：

- 生产包 `frontend/packages/ui/src/tokens.css` 的 `html[data-theme="dark"]` 就是暗色规格的正式来源；
- 原型 `ui-v3/styles/tokens.css` 通过 `@import` 复用同一份令牌，
  原型只要把 `data-theme` 标记到文档根节点，暗色立即生效；
- 新增 `ui-v3/scripts/theme.js`（读写 `yuance-theme` + 标记 `data-theme`），
  顶栏新增主题开关，行为与生产的顶栏主题开关一致。

## 走查记录

在生产实现上逐页查看暗色（1280 视口）：

| 页面 | 结果 |
|---|---|
| 工作台 | 正常：指标磁贴、面板、列表与时间轴对比度足够 |
| 工作项列表 | 正常：磁贴、筛选条、表格、空态均为暗色面 |
| 工作项详情 | 正常：描述、讨论、属性栏与关联面板层次清晰 |
| 项目列表 | 正常 |
| 消息中心 | 正常 |
| 系统管理 · 用户管理 | 正常，但发现状态列显示原始状态码 |

### 走查中修掉的问题

系统用户与角色列表的状态列直接显示 `active` 这类原始状态码，
在暗色下尤其突兀。补 `systemAccountStatusLabel()` 后统一显示「启用 / 已锁定 / 已停用 / 未激活」。

## 验证记录

| 验证项 | 命令 | 结果 |
|---|---|---|
| 前端全量检查 | `npm --prefix frontend run check` | 通过 |
| Web 全量检查 | `npm --prefix web run check` | 通过 |
| 生产构建 | `make web-build` | 通过 |
| 视觉护栏 | `npm --prefix web run test:visual` | 结构层 5/5、像素层 4/4 通过 |
| 原型主题开关 | 浏览器实测 | 切换后 `data-theme="dark"` 生效，控制台无报错 |

## 遗留

- 桌面端 renderer 仍无法构建（`desktop/node_modules` 为空，缺少 `vite` 与 `typescript`），
  桌面端的暗浅两色走查与两端截图对照无法执行，`make frontend-check` 的 desktop 段同样无法运行。
- 暗色像素基线尚未纳入视觉护栏：护栏目前只跑浅色，暗色以人工走查加截图记录。
