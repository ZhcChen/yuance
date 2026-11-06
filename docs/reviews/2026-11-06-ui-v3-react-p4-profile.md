# UI v3 回迁 P4 个人中心 复核记录

- 规格：`specs/ui-v3-react/spec.md`
- 任务：`specs/ui-v3-react/tasks.md`（T023）
- 设计稿参照：`ui-v3/scripts/pages/profile.js`
- 复核日期：2026-11-06

## 结论

**通过。** 个人中心按设计稿改成「页头 + 指标磁贴 + 账号信息 + 我的项目」结构。

## 结构对照

| 设计稿 | 生产实现 |
|---|---|
| `page-head` 头像与身份 | `.page-head.profile-head`：头像、显示名、用户名 · 角色 · 邮箱 |
| `metrics` 指标磁贴 | `Metric`：参与项目 / 指派给我 / 高优先级 |
| `panel` 账号信息 | 新增 `Panel title="账号信息"`，用 `.props` 两列网格列出账号资料 |
| `panel` 我的项目 | 保留右侧「我的项目」面板 |
| `panel` 偏好设置 | **未采纳**：生产没有偏好设置能力，保留 Token 与账户安全面板 |

设计稿的指标是「我的需求 / 我的任务 / 我的 Bug / 当前迭代」，
生产接口只提供指派总数与高优先级数量，没有按类型拆分的个人统计，
因此指标沿用生产口径，没有为了凑设计稿而新增统计维度。

## parity 合同同步

| 项 | 原值 | 新值 |
|---|---|---|
| `regionOrder` | `["profile-hero","metrics","tokens","projects","security"]` | `["page-head","metrics","account","tokens","projects","security"]` |
| `stableAnchors` | `.profile-hero` / `.profile-metrics` / `.api-token-panel` | `.profile-head` / `.profile-metrics` / `.api-token-panel` |
| `geometryAnchors` | `.main` / `.profile-hero` / `.profile-metrics` | `.main` / `.profile-head` / `.profile-metrics` |
| `dynamicMasks` | `.profile-hero-details` | 清空（该区域已并入账号信息面板） |

## 验证记录

| 验证项 | 命令 | 结果 |
|---|---|---|
| 前端全量检查 | `npm --prefix frontend run check` | 通过 |
| Web 全量检查 | `npm --prefix web run check` | 通过 |
| 生产构建 | `npm --prefix web run build` | 通过 |
| 视觉护栏 | `npm --prefix web run test:visual` | 结构层 5/5、像素层 4/4 通过 |
| 个人中心 e2e | `npx playwright test -g profile` | 2 通过 / 0 失败 |

## e2e 用例同步

| 用例 | 变更 |
|---|---|
| `profile page preserves the main responsive geometry` | 标题选择器从 `.profile-hero` 改到 `.profile-head` |

## 遗留

- 桌面端 renderer 仍无法构建，桌面端走查未完成（沿用 P3 的未验证项）。
