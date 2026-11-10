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
| 前端全量检查 | `make frontend-check` | 通过（补齐桌面端依赖后，desktop 段也能执行） |
| 桌面端 renderer | `npm --prefix desktop run build:renderer` / `check:renderer` | 通过（98 个模块，产物 812 kB） |
| 桌面端 renderer 用例 | `node --test desktop/test/renderer-*.test.mjs` | 40 通过 / 0 失败 |
| 桌面端全量用例 | `npm --prefix desktop test` | 499 项中 493 通过 / 3 失败（见下） |
| 视觉护栏 | `npm --prefix web run test:visual` | 结构层 5/5、像素层 4/4 通过 |
| 原型主题开关 | 浏览器实测 | 切换后 `data-theme="dark"` 生效，控制台无报错 |

## 桌面端补齐依赖后的验证

桌面端此前因为 `desktop/node_modules` 为空（缺 `vite` 与 `typescript`）完全无法验证，
本轮补装依赖后重新跑通：

| 项目 | 结果 |
|---|---|
| `npm --prefix desktop install` | 561 个包安装完成（`node_modules` 已被 gitignore） |
| `npm --prefix desktop run build:renderer` | 通过 |
| `npm --prefix desktop run check:renderer` | 通过（`tsc` 与 `eslint` 均无问题） |
| `node --test desktop/test/renderer-*.test.mjs` | 40 通过 |
| `npm --prefix desktop test` | 499 项中 493 通过 / 3 失败 |

三条失败逐条归因：

1. `branding.test.mjs`「bundles release and development Dock PNGs」：
   断言 `desktop/build/yuance-dock.png` 等资源存在，
   而这些文件是工作区里**用户未提交的删除**，本轮没有恢复，也未纳入任何提交。
2. `desktop-business-api-integration.test.mjs` 的两条 Electron 用例：
   在回迁前的基线提交 `69dc1a2` 上用同一环境复跑，**同样失败**，属既有问题。

同时修掉了桌面端路由断言：项目列表新增关键词筛选后项目路由多出 `q` 字段，
桌面端渲染进程用例没同步（本轮之前桌面端用例跑不起来，所以没暴露）。

## 遗留

- 桌面端**逐视口截图对照**仍未产出：桌面端没有截图能力，smoke 脚本只产出 JSON 报告；
  要拿到真实窗口截图需要先 electron-builder 打包再驱动窗口，超出本轮范围。
- 暗色像素基线尚未纳入视觉护栏：护栏目前只跑浅色，暗色以人工走查加截图记录。
- 桌面端与 Web 端共用同一个 `SharedApp` 与同一份令牌，
  渲染进程入口同样写 `document.documentElement.dataset.theme`，
  暗色取值天然一致，但「两端逐视口截图」这条验收仍缺证据。
