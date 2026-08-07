# U6 通知目标焦点恢复复核

## 复核范围

- 计划：`docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md`
- 单元：U6 通知 comment fragment、双宿主 route model 与焦点恢复
- 路由：`frontend/packages/app-core/src/routes.js`
- 共享焦点：`frontend/packages/app-shell/src/app.jsx`、`frontend/packages/ui/src/work-item-comments.jsx`

## 结论

通过。Browser 与 Desktop 现在都将 `#comment-{id}` 解析为共享 `commentId`，详情加载完成后由同一 SharedApp 聚焦并滚动到同一评论；目标缺失或 fragment 非法时安全回退到页面主标题。

## 关键证据

- `parseAppRoute` 对工作项详情始终返回稳定的 `commentId: number | null`，只接受完整正整数 fragment。
- Browser router 的 route/currentPath 均保留 hash；Desktop router 在 `app://` 路径与 `/web/app` 共享路径之间保留同一 hash。
- 评论行使用 `tabIndex={-1}` 提供程序化 focus，不改变正常 Tab 顺序。
- SharedApp 在数据和评论 DOM 就绪后执行统一 focus/scroll；无对应评论时聚焦页面标题。
- 正式 Web 与 Desktop owner 的消息 E2E 都验证 comment target 获得焦点。

## 验证

- `npm --prefix frontend run check`：通过，包含共享路由、UI 和 app-shell 检查。
- `npm --prefix web run check`：通过，40 项测试通过。
- `npm --prefix desktop run check:renderer`：通过，Desktop router 类型检查、lint 与 production build 完成。
- `node --test web/test/browser-router.test.mjs desktop/test/renderer-composition.test.mjs`：10 项通过。
- `npm --prefix web run test:e2e -- --grep "message center"`：2 项通过，覆盖 `/web` 与 `/web/app` owner。
- `git diff --check`：通过。

## 后续范围

U6 剩余工作是正式 `/web/messages` 切换、旧消息模板/handler/selector 退役，以及最终事件、动作和权限证据收口。
