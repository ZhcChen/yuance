---
title: Web 与 Desktop U3 项目域阶段收口复核
type: review
status: completed
date: 2026-08-07
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U3 项目域阶段收口复核

## 结论

U3 登记的项目列表与创建、详情与成员、周期、项目文件、资料与附件、个人分析均已迁移到唯一共享 React 组件树和状态模型。全部 U3 page/action 条目达到 `shared`，正式 Browser 路由已通过可回滚 feature flag 切换；Desktop 继续只使用逐动作白名单和 opaque 文件 capability。

U3 的 `shared` 表示共享实现、双宿主证据与正式入口切换均已完成，不表示旧 Askama 代码已删除。模板、旧 handler 分支和 selector 的物理退役仍由 U8 在稳定窗口后执行，并在完成时提升为 `retired`。

## 能力覆盖

- 项目列表、创建、编辑、成员增删与角色调整共用表单、权限派生和提交锁。
- 周期创建、编辑、关闭、状态看板、成员压力和工作项入口共用页面与 route model。
- 项目文件覆盖登记、上传、失败恢复、下载、预览、归档及 Desktop 原生文件边界。
- 项目资料覆盖筛选、读锁、密码重置、富文本、正文附件引用、创建阶段附件事务、附件生命周期和预览。
- 个人分析覆盖处理量、自然周期效率、待处理入口、协作指标、最近完成记录及当前项目切换顺序。
- 正式 `/web/projects*` GET 路由在 `YUANCE_WEB_APP_SHELL_V1` 开启时统一返回共享壳，关闭时可回滚旧 SSR。

## 安全与宿主边界

- Desktop renderer 不持有通用 `fetch`、签名 URL、上传 header、本地路径或可注入 API path。
- operation registry 仅登记 U3 需要的固定 operation，并对输入和响应执行闭合解析。
- Browser 使用 Cookie/CSRF，Desktop 使用 device principal；权限最终由同一服务端 API 裁决。
- macOS 未使用 Keychain，项目域迁移未引入 Electron `safeStorage`。

## 验证证据

- Browser 完整 E2E：`41/41`。
- Desktop 完整测试：`416 passed`，`3 Windows-only skipped`。
- Frontend manifest、package boundary、route 与 use case 测试通过。
- Device API、项目管理、HTML 消毒、SSR 回退、正式路由 cutover 和未登录回跳测试通过。
- 详细行为与命令记录见 `docs/reviews/2026-08-07-004-web-desktop-u3-project-detail-members-review.md` 至 `docs/reviews/2026-08-07-018-web-desktop-u3-formal-web-cutover-review.md`。

## 后续边界

- U4 从需求、任务、Bug 列表、保存视图和批量操作开始，不在 U3 收口提交中混入实现。
- U8 负责稳定窗口、回滚演练、旧项目模板/handler/selector 删除和最终 `retired` 状态。
