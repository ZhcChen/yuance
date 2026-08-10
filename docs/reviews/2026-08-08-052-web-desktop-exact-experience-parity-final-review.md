---
title: Web 与 Desktop 完全体验一致最终复核
type: review
status: completed
date: 2026-08-08
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop 完全体验一致最终复核

## 结论

通过。U0-U8 已按纵向切片完成共享实现、正式 Web 切换、旧业务 UI 退役和最终 Gate。Browser 与 Desktop 只装配同一个 `SharedApp`，业务状态、组件和样式位于共享 frontend packages；宿主仅保留认证、路由、文件、通知和窗口生命周期 adapter。

体验清单现有 30 个页面、81 个动作和 7 个受控宿主差异：24 个业务页面及 60 个旧业务动作已 `retired`，6 个 SSR/shared boundary 页面及 21 个边界或宿主文件动作保持 `shared`，不存在 `baseline`、`in_progress` 或 `cutover`。`api/static/app.js`、`api/static/app.css`、旧业务模板和迁移开关均已删除。

## 最终 Gate

| Gate | 结果与证据 |
|---|---|
| Source parity | `npm --prefix frontend run check` 通过；schema、正式路由、模板、interaction marker、manifest owner 和版本化 inventory 双向闭合，根级 42 项测试通过。 |
| Shared contract | frontend workspace 全部 check 通过；route、DTO、mutation、notification reducer、form 与 package boundary 测试通过。 |
| Browser | `npm --prefix web run check` 通过，41 项测试通过；`npm --prefix web run build` 通过；`npm --prefix web run test:e2e` 为 72/72。 |
| Desktop | `npm --prefix desktop run check` 通过；`npm --prefix desktop test` 为 456 项、453 通过、3 项 Windows-only 跳过、0 失败。 |
| Differential | Web 72 项 E2E 与 Desktop packaged parity smoke 使用共享页面和对应业务矩阵；`Verified packaged desktop feature parity`，证据 verifier 通过。 |
| Visual | Web E2E 覆盖 390、768、1280、1440；边界页截图证据见 `docs/reviews/2026-08-08-048-web-desktop-u8-boundary-pages-review.md`；共享 token 与布局状态测试通过。 |
| Security | `cargo test -p yuance-api` 全量通过；Desktop registry、IPC、CSP、文件 capability、权限矩阵和凭证扫描通过。生产源码无 Keychain 或 `safeStorage` 调用。 |
| Migration | 正式业务 route 只返回共享 app entry；退役契约测试通过；旧 CSS/JS、业务模板、handler、selector 和 `YUANCE_WEB_APP_SHELL_V1` 已清零。 |
| Packaged | `pack:dir`、bundle verifier、`app://` smoke、真实 API parity smoke 和 118 个产物文件凭证扫描全部通过。 |
| Cross-platform | GitHub Actions `Desktop Security` run `31235000022` 在提交 `cdca54d` 手动触发并成功；macOS、Ubuntu、Windows x64、Windows ARM64 四个 job 全部通过。 |

本轮 Rust 全量测试首次运行发现 SSE 心跳测试把并发业务帧误当成固定下一帧；提交 `cdca54d` 改为在有界期限内等待心跳。聚焦测试连续 5 次、SSE 文件 11 项和随后 Rust 全量测试均通过。

## Requirements

| Requirement | 最终证据 |
|---|---|
| R1 | `web/src/app.jsx` 与 `desktop/src/renderer/app.jsx` 均装配 `frontend/packages/app-shell` 的唯一 `SharedApp`；共享 UI 与样式由 `frontend/packages/ui`、`app-shell` 持有。 |
| R2 | 共享 route/DTO/form/mutation 状态模型与两宿主业务矩阵统一默认值、筛选、分页、权限入口和反馈；Web E2E 与 Desktop parity smoke 通过。 |
| R3 | package boundary 测试拒绝共享包访问 `window`、`fetch`、Electron、文件系统和宿主存储；宿主能力只通过注入 services。 |
| R4 | 已确认的旧入口缺失、富文本和并发刷新问题均在共享 contract 中统一修正，并由各 U3-U7 review 记录理由。 |
| R5 | `web/src/app.css` 仅 2 行 import，`desktop/src/renderer/app.css` 仅 7 行 reset；token 和业务样式只位于共享 UI/app-shell。 |
| R6 | 全局壳、项目、列表、详情、讨论、附件、弹窗、空态与错误态全部由共享组件树渲染。 |
| R7 | 两宿主使用同一 CSS 和响应式规则；390、768、1280、1440 Gate 通过。 |
| R8 | 共享 UI 测试覆盖 light/dark、focus、loading、disabled、validation、feedback 和 modal 状态；原生文件框与通知仅保留登记差异。 |
| R9 | 共享 route model 覆盖首页、项目、需求/任务/Bug、详情、消息、搜索、个人、周期、资源、分析和系统管理。 |
| R10 | 当前项目、topbar、搜索、通知和失效顺序由共享状态机处理；快速项目切换 E2E 通过。 |
| R11 | Browser History 与 Desktop internal route 只在 router adapter 分离，页面使用同一 owner-aware route model。 |
| R12 | 未认证、无项目、403、404、删除态和 session 失效由共享语义状态处理，认证恢复留在宿主。 |
| R13 | 三类工作项共享指标、组合筛选、保存/默认视图、分页、选择和批量部分失败模型。 |
| R14 | 创建、编辑、移交、状态、周期、父子、截止日期和关闭/重开共享 schema、提交锁及错误映射。 |
| R15 | 详情元数据、导航、流转、富文本、提及、回复/编辑、附件上传下载预览和实时讨论已完成共享。 |
| R16 | mutation generation、提交锁、定向刷新、SSE 去重/重连和失败恢复测试覆盖重复、慢请求和过期响应。 |
| R17 | 项目创建/编辑、成员、周期、文件、资源及个人分析均通过 Browser E2E 与 Desktop 业务矩阵。 |
| R18 | 系统 dashboard、用户、角色、权限、存储、发布、OpenAPI、数据库统计、审计和 API docs 已共享；普通成员服务端拒绝测试通过。 |
| R19 | 高风险操作使用共享确认和服务端最终鉴权；Cookie/CSRF 与 device principal 权限矩阵均通过，Desktop 未扩大权限。 |
| R20 | U3-U7 各页面族先完成共享实现和回滚测试再切正式入口；U8 稳定后删除统一迁移开关，不保留平行入口。 |
| R21 | U8 retirement reviews 和退役契约测试证明旧业务 template、handler、selector 删除后路由、权限与 E2E 仍通过。 |
| R22 | 仅保留 6 个 Askama 边界模板，统一消费 `auth.css` token，并登记 `boundary.server-rendered` 及双端证据。 |
| R23 | bundle、CSP、preload、IPC 和 package boundary tests 拒绝 iframe、远程 BrowserWindow、Cookie 注入、共享 storage 与通用 fetch。 |

## Key Flows

| Flow | 最终证据 |
|---|---|
| F1 | 登录 return-to、device authorization、身份/topbar/current-project 恢复和默认首页由 Browser E2E、auth API 与 Desktop packaged smoke 覆盖。 |
| F2 | 快速重复切换项目会串行提交、失效旧 generation、重建数据与事件上下文；Web E2E 和共享状态测试通过。 |
| F3 | 保存视图、默认视图、组合筛选、route query、分页和空态由工作项 E2E 与 route/DTO tests 覆盖。 |
| F4 | 创建、编辑、移交、状态、关闭/重开及批量部分失败均走共享校验、提交锁、定向刷新和统一反馈。 |
| F5 | 富文本评论/回复/提及和项目、资源、工作项、评论附件使用共享 composer 与宿主文件 adapter；双端真实 API 流程通过。 |
| F6 | 事件 reducer 更新 badge，消息 target 重新解析并在需要时切项目、跳转和聚焦；重复/失效目标测试通过。 |
| F7 | 系统管理共享 permission gate、确认、脱敏、一次性 token 和审计；普通用户直接请求仍由 Rust 权限测试拒绝。 |

## Acceptance Examples

| Example | 最终证据 |
|---|---|
| AE1 | 唯一组件树加同一 atomic view API 保证导航、标题、列、筛选、分页和操作集合一致；双宿主 Gate 通过。 |
| AE2 | saved view 生命周期由服务端用户范围事实持久化，Web 完整 E2E 和共享 API/state tests 覆盖创建、恢复、改名、删除。 |
| AE3 | SSE reducer、评论/流转/附件真实 API、重复事件和重连全量恢复测试通过；两宿主不保留过期 mutation。 |
| AE4 | 项目角色和超级管理员权限矩阵同时覆盖可见菜单、操作集合及服务端直接请求拒绝。 |
| AE5 | 共享 CSS 在 390、768、1280、1440 的正式 Web Gate 通过；Desktop renderer 直接消费同一 CSS，打包态 smoke 通过。 |
| AE6 | 401、403、404、409、422、500、网络中断、SSE 重连和上传失败由 API、共享状态、Web E2E 与 Desktop smoke 共同覆盖。 |
| AE7 | 正式入口已完成逐切片回滚演练；稳定后删除回滚分支和旧实现，退役测试证明全仓不存在平行业务 handler。 |

## Definition Of Done

- [x] 正式 Web 页面、交互、权限和异常状态全部进入 parity manifest。
- [x] Browser 与 Desktop 的共享页面只有一个组件树、状态模型和样式源。
- [x] 全局壳、项目、工作项、消息、搜索和系统管理在两宿主功能与交互一致。
- [x] 7 个允许宿主差异均有受控 contract 和双端测试，不存在页面级业务分叉。
- [x] 正式 `/web/*` 已切换到共享实现，并在旧实现删除前完成逐切片回滚演练。
- [x] 已替代 Askama 业务模板、重复 JS handler 和 CSS selector 已删除。
- [x] 双宿主权限、异常、实时、文件、视觉和跨平台 Desktop Gate 全部通过。
- [x] 本 review 已逐项证明 R1-R23、F1-F7、AE1-AE7。

## 保留边界

- `.artifacts/` 与 `test-results/` 是本地运行产物，不纳入版本控制。
- macOS 凭证只使用 owner-only 文件，不使用 Keychain 或 Electron `safeStorage`。
- 现存 6 个 Askama 模板只承载登录、初始化、设备授权、下载和文档预览边界，不承载共享业务页面状态。
- Web 与 Desktop bundle 仍有超过 500 KB 的构建警告；这是后续性能优化项，不影响本计划的一致性与退役结论。
