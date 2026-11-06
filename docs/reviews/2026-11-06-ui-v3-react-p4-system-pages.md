# UI v3 回迁 P4 系统管理各子页 复核记录

- 规格：`specs/ui-v3-react/spec.md`
- 任务：`specs/ui-v3-react/tasks.md`（T024）
- 设计稿参照：`ui-v3/scripts/pages/system.js`
- 复核日期：2026-11-06

## 结论

**通过。** 系统管理的各子页统一改成「页头 + 面板」结构。

## 结构对照

| 页面 | 改造前 | 改造后 |
|---|---|---|
| 用户管理 | `page-hero` + `shell-card` | `page-head`（新建用户按钮移到页头）+ `Panel 用户列表` |
| 角色权限 | `page-hero` | `page-head`（全部权限点入口移到页头），角色工作台结构保留 |
| 权限点 | `page-hero` + `shell-card` | `page-head` + `Panel 权限树` |
| 审计日志 | `shell-card` + `shell-panel-header` | `page-head` + 筛选条与记录表 |
| 数据库统计 | `shell-card` + `shell-panel-header` | `page-head`（刷新按钮移到页头）+ 统计表 |
| 系统 OpenAPI | `page-hero` | `page-head`（创建系统 Token 移到页头） |
| 版本管理 | `page-hero` | `page-head`（新建版本移到页头） |

## 与设计稿的差异

- 设计稿的系统管理总览是「指标磁贴 + 最近审计 + 发布状态」两块面板，
  生产接口只返回当前角色可见的入口列表，没有用户、角色与权限点的汇总数字，
  因此总览保留入口卡栅格，没有为了凑设计稿而新增统计维度。
- 设计稿的对象存储是一张分片表，生产是配置工作台（配置、桶状态、版本快照、回滚），
  功能更完整，保留生产结构，只把页头改成统一形态。

## parity 合同同步

系统各页的页头锚点从 `.page-hero` 统一改为 `.page-head`；
审计与数据库统计的面板锚点从 `.audit-panel` / `.database-stats-panel`
改为 `.audit-page` / `.database-stats-page`。

## 验证记录

| 验证项 | 命令 | 结果 |
|---|---|---|
| 前端全量检查 | `npm --prefix frontend run check` | 通过 |
| Web 全量检查 | `npm --prefix web run check` | 通过 |
| 生产构建 | `npm --prefix web run build` | 通过 |
| 视觉护栏 | `npm --prefix web run test:visual` | 结构层 5/5、像素层 4/4 通过（系统用户页基线重新生成） |
| 系统相关 e2e | `npx playwright test -g system` | 17 通过 / 5 失败（失败项回迁前同样失败或依赖执行顺序） |

## e2e 用例同步

| 用例 | 变更 |
|---|---|
| `system users preserves the main responsive geometry` | 页头选择器从 `.page-hero` 改到 `.page-head` |
| `shared system permissions preserve formal owner search and fixed catalog` | 权限树面板不再重复声明「系统权限目录」可访问名称，避免与权限树本身重名 |

## 遗留

- `shared system dashboard renders the permission-filtered management entry set` 仍失败：
  用例断言一个代码里不存在的「管理入口」区域名，回迁前同样失败。
- `shared system storage reports committed probe separately when final refresh fails` 仍失败：
  失败元素有两个 `role="alert"`，回迁前同样失败。
- 桌面端 renderer 仍无法构建，桌面端走查未完成（沿用 P3 的未验证项）。
