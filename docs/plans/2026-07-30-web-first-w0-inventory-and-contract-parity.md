# 2026-07-30 Web-first W0 盘点与契约基线

## 目标

本文件作为 `docs/plans/2026-07-28-feat-web-desktop-shared-frontend-plan.md` 的 W0 执行产物，完成首批浏览器切片的现状盘点、route-to-contract parity 基线和 W1/W2 的执行边界。

本轮只覆盖首批切片：`登录衔接 -> /web 应用壳 -> 顶部状态 -> 消息中心`。不提前进入 Electron renderer、device-session、SQLite 或离线同步。

## 证据来源

- `api/src/web/router.rs`
- `api/src/web/user/mod.rs`
- `api/src/web/api/mod.rs`
- `api/src/web/auth_api.rs`
- `api/templates/web/login.html`
- `api/static/app.js`
- `docs/openapi/yuance.openapi.json`
- `scripts/browser-smoke.sh`

## 首批切片迁移清单

| Feature | 当前 canonical owner | 当前入口/旧入口 | 当前数据/事件面 | 当前缺口 | 回退 owner |
|---|---|---|---|---|---|
| 登录页与未认证回跳 | SSR Askama：`api/src/web/user/mod.rs::{login, login_submit, login_redirect, redirect_with_session}` + `api/templates/web/login.html` | `GET /web/login`、`POST /web/login`；受保护 `/web/*` 当前统一跳 `/web/login` | 登录成功后直接跳 `/web`；浏览器 API 401 时 `api/static/app.js` 的 `redirectToLogin()` 也固定跳 `/web/login` | 登录模板没有 `return_to` 隐藏字段；`LoginForm`/`LoginTemplate` 不保留回跳目标；成功和失败链路都不能保留 path/query/hash；旧通知和受保护 SSR 页进入登录后会丢目标 | `GET /web/login` 与现有 SSR 登录链路继续保留，直到 W2 完成并通过 Browser E2E |
| `/web` 应用壳 | SSR Dashboard + `api/static/app.js` progressive enhancement | `GET /web`；页面内 topnav 链接仍指向 `/web/*` SSR 页面 | 当前页面载入后由 `api/static/app.js` 拉取顶部状态、通知、消息中心局部刷新和文档预览逻辑 | 还没有独立 `web/` 入口、SPA 回退或 Browser composition root；应用壳仍与 Askama DOM 结构和全局脚本耦合 | 旧 `GET /web` SSR dashboard 作为 rollback owner |
| 顶部状态与实时刷新 | `api/static/app.js` | `GET /api/v1/topbar/status`、`GET /api/v1/topbar/events` | Cookie session + `EventSource`；`topbar/status` 返回当前项目、工作项角标与未读数；`topbar/events` 发送 `release-version` 和 `topbar` 事件 | OpenAPI 未覆盖两个 endpoint；当前实时实现依赖进程内广播，只支持单 API replica；动态响应的缓存分类还未统一进契约 | 旧 topbar SSR DOM + `api/static/app.js` |
| 通知下拉与消息中心 | 混合 owner：通知下拉走 JSON，消息中心主体仍是 SSR HTML | `GET /api/v1/notifications?limit=5`、`GET /web/messages`、`POST /web/messages/read-all`、`GET /web/messages/{id}/open` | 下拉列表由 JSON feed 驱动；展开消息中心时通过 HTML fetch/replace 刷新整个 `data-message-center`；桌面通知桥仍经 `window.yuanceDesktop` 消费 `open_url` | 没有 REST 单条/批量已读接口；`Notification.open_url` 仍是 HTML 兼容跳转 `/web/messages/{id}/open`；消息中心过滤/分页仍依赖 HTML 页面和表单语义 | `/web/messages` 与 `/web/messages/{id}/open` 继续作为兼容层直到 W2/W3 完成 |

## 首批 route-to-contract parity

本轮以“真实 Router/handler/consumer 优先”建立首批基线；对应的静态契约已同步修正到 `docs/openapi/yuance.openapi.json`。

| method + path | 当前 handler / consumer | 认证 | CSRF | 成功响应 | 当前契约状态 | 结论 |
|---|---|---|---|---|---|---|
| `GET /api/v1/auth/me` | `api/src/web/api/mod.rs::me`；后续新应用壳会直接消费 | Cookie session 或 Bearer PAT | 否 | `200 application/json`，`AuthUserEnvelope` | 已覆盖 | 作为 W1 应用壳会话探针，保持兼容追加字段策略 |
| `GET /api/v1/auth/csrf` | `api/src/web/auth_api.rs::csrf_token`；`api/static/app.js::refreshCsrfToken()` 已消费 | 已认证 Cookie session | 否 | `200 application/json`，并返回 `Set-Cookie: yuance_csrf=...` 与 `x-yuance-csrf-token` | 运行存在，OpenAPI 之前缺失；本轮已补 | 作为 Browser 内存 CSRF transport 的唯一刷新入口 |
| `POST /api/v1/auth/logout` | `api/src/web/api/mod.rs::logout` | Cookie session | 是，`x-yuance-csrf-token` | `200 application/json`，`LogoutEnvelope`，并清理 session/refresh Cookie | 运行返回 JSON `200`，OpenAPI 之前误写为 `204`；本轮已纠正 | 保持 Cookie-only 退出，不给新前端引入 HTML 依赖 |
| `GET /api/v1/topbar/status` | `api/src/web/api/mod.rs::get_topbar_status`；`api/static/app.js::refreshTopbarStatus()` 已消费 | Cookie session 或 Bearer PAT（仍受权限和 scope 限制） | 否 | `200 application/json`，`TopbarStatusEnvelope` | 运行存在，OpenAPI 之前缺失；本轮已补 | 作为 W1/W2 顶部状态统一 REST 基线 |
| `GET /api/v1/topbar/events` | `api/src/web/api/mod.rs::topbar_events`；`api/static/app.js::startTopbarRealtime()` 已消费 | Browser 当前只走 Cookie session；服务端仍兼容已认证 principal | 否 | `200 text/event-stream`，事件：`release-version`、`topbar` | 运行存在，OpenAPI 之前缺失；本轮已补 | 作为 Browser 侧 SSE 基线；Desktop 后续独立到受控 Bearer fetch-stream |
| `GET /api/v1/notifications` | `api/src/web/api/mod.rs::list_notifications`；`api/static/app.js::fetchNotificationFeed()` 已消费 | Cookie session 或 Bearer PAT（需要 `notification:read`） | 否 | `200 application/json`，`NotificationFeedEnvelope` | 已覆盖；本轮补齐 `401/403` 错误语义说明 | 保持列表读取契约稳定，但单条/批量已读仍需 W1/W2 新增 REST 契约 |
| `GET /web/messages/{id}/open` | `api/src/web/user/mod.rs` HTML handler | Cookie session | 隐式由服务端流程处理 | `303/302` 到语义目标，并在服务端标记已读 | 不属于 OpenAPI | 保留为兼容层；W2 新路由与幂等已读 REST 完成后再下线 |
| `POST /web/messages/read-all` | `api/src/web/user/mod.rs` HTML form handler；`api/static/app.js::submitMessageReadAllRequest()` 通过 HTML fetch 驱动 | Cookie session | 是，表单 `_csrf` 或 header | `200 text/html` 或重定向 | 不属于 OpenAPI | 继续兼容旧消息中心，W2/W3 再换成 JSON/REST 语义 |

## 当前缓存、CSRF 与回跳基线

- Browser 写请求当前由 `api/static/app.js::fetchJson()` 负责，在非 `GET/HEAD` 自动附带内存中的 `x-yuance-csrf-token`；收到 CSRF 错误时通过 `GET /api/v1/auth/csrf` 刷新一次后重试。
- `api/src/web/router.rs::session_refresh_middleware()` 在 Cookie session 有效时会续写 `yuance_csrf` Cookie，并把 token 通过 `x-yuance-csrf-token` 响应头回传；这意味着 Browser transport 的 CSRF 来源必须是“响应头/JSON -> 内存”，而不是直接读取 Cookie。
- 当前 `api/static/app.js::redirectToLogin()` 固定跳转 `/web/login`；`api/src/web/user/mod.rs::redirect_with_session()` 登录成功固定跳 `/web`；`api/templates/web/login.html` 没有 `return_to` 隐藏字段。这三处共同证明：回跳链路尚未落地，W2 必须补齐。
- 当前 `api/src/web/router.rs` 只为 `/static/app.js`、`/static/app.css`、`/static/document-preview*.mjs` 与 `/version.json` 显式设置 `no-store, max-age=0, must-revalidate`，并为 vendored hashed 资源设置 `public, max-age=31536000, immutable`。认证 HTML、认证 JSON 与 SSE 还没有统一 `private, no-store` 分类，W1 必须把它们纳入同一响应策略。
- 片段（hash）当前完全停留在浏览器 URL；无论登录重定向还是旧通知跳转，都没有一次性 state 保存/恢复能力。W2 必须把片段恢复限制在 Browser 内部 state，不把 hash 直接写入表单或查询参数。

## W0 决策输出

### 1. 首批 canonical owner 与回退矩阵

- `GET /web/login` 在 W2 前持续由 SSR Askama 持有；新 Web 只接管登录后的 `/web/app/*` 与 `/web` 应用壳，不接管密码表单本身。
- `/web` 的首批新 owner 是“登录后应用壳 + 顶部状态 + 通知下拉 + 消息中心入口”；旧 dashboard 继续保留为 server rollout 的 fallback owner。
- `/web/messages` 在 W2 结束前保持“SSR 页面 owner + 新壳入口外层协同”的混合模式；只有当 REST 已读语义、消息中心分页/过滤和旧通知回跳都通过 Browser E2E 后，才把 canonical owner 切到新前端。
- `/web/messages/{id}/open` 明确是兼容层，不作为新客户端契约；W2/W3 只消费通知语义目标和新的幂等已读 REST，不解析这个 HTML 路由。

### 2. 实时拓扑与发布窗口

W1-W4 采用单 API replica 拓扑，直到服务端引入共享事件总线和持久 rollout store 为止。原因是当前 `api/src/platform/realtime.rs` 为进程内广播，`topbar/events` 与工作项 SSE 不具备多副本一致性。

- `api` 在 W1-W4 明确禁止 horizontal scale。
- 发布拓扑参数固定为：
  - `sse_drain_timeout = 30s`
  - `stop_grace_period = 45s`
  - `max_release_window = 10m`
- 发布行为固定为：旧实例先切 `not-ready` 且不接新连接，向 SSE 客户端发出受控重连窗口；若在 `sse_drain_timeout` 内未自然结束，则在 `stop_grace_period` 末尾强制关闭；若新实例未在 `max_release_window` 内 ready，则发布失败并回滚到旧 owner。

### 3. rollout、粘滞与 kill switch

- 首批 rollout key 固定为 `web_app_shell_v1`。
- assignment 粒度固定为 `user_id`，由服务端持久化；不允许客户端以 `localStorage`、UA 或 query 参数自定 owner。
- sticky assignment TTL 固定为 `30d`；只有 rule version 变更、人工重置或 kill switch 才允许重分配。
- kill switch 固定为“立即恢复 `/web` 和 `/web/messages` 的旧 SSR owner，不改变 URL，不清理现有 Cookie/CSRF/session”。
- 回退后 Browser 仍使用相同路由，禁止通过“跳回其他 URL”掩盖 owner 切换。

### 4. Browser E2E 与 CI 决策

- PR 级 Browser E2E runner 固定为 Playwright；它负责新 `web/` 工程的 headless 浏览器、trace、HAR、截图和 bundle 报告。
- 现有 `scripts/browser-smoke.sh` 保留为部署前/发布后的真实浏览器 smoke，不承担 PR 阻断职责。
- 以下路径变更必须触发 W1 以后的前端门禁：`web/**`、`api/src/web/**`、`api/templates/**`、`api/static/**`、`docs/openapi/yuance.openapi.json`、`api/Dockerfile`、`scripts/deploy-production.sh`、`deploy/easy-deploy/production/backend/compose.yaml.example`。
- 失败制品固定为：Playwright trace、HAR、截图、服务日志、构建后的 `manifest.json` 与 bundle size 摘要。

### 5. JavaScript / JSDoc 与同源交付基线

- `web/`、后续 `frontend/packages/*` 与 `desktop/src/renderer` 统一使用 JavaScript ESM/JSX；JSDoc 是唯一类型契约来源，`tsc` 只作为 `allowJs + checkJs + noEmit + jsx: react-jsx` 的无产物检查器。
- W1 起脚本命名固定为：
  - `web`: `check:js`、`check:source`、`check`
  - `frontend`: `check:js`、`check:source`、`check`
  - `desktop`: `check:main`、`check:renderer`、`check`
  - 根目录：阶段化聚合 `check:frontend`
- `check:source` 统一负责阻止新增业务 `.ts` / `.tsx` 源文件；JSDoc 漏标、跨包 deep import、React 多实例和宿主特有依赖在各阶段 CI 中阻断。
- 首期生产交付链路固定为：前端构建阶段产出 `web/dist` -> `api/Dockerfile` 多阶段复制到最终 `yuance-api` 镜像 -> API 同源暴露 `/web/app/*`。W1-W2 不引入独立前端容器、Caddy 前置静态站点或跨源 Cookie/SSE。
- SPA 资源交付边界固定为：只有 `/web/app/*` 导航请求回退到入口 HTML；入口 HTML 与 manifest 短缓存/`no-store`，内容哈希资源 `immutable`；缺失资源或 manifest 视为构建失败而不是运行时降级。

### 6. 观测、隐私与性能/无障碍 Gate

- 允许进入遥测的字段固定为：`release_version`、`route_id`、`rollout_key`、`rule_version`、`assignment_source`、`response_status`、`error_code`、`latency_bucket`、`browser_family`、`reconnect_count`、`correlation_id`。
- 明确禁止进入遥测、日志和支持包的字段：Cookie、CSRF token、Authorization、预签名 URL、用户名单原文、项目正文、消息正文、文件名、本地路径、`return_to` 原始值。
- 首批 rollout 的自动暂停阈值固定为：
  - `/web` 壳加载失败率 15 分钟窗口 `> 1%`
  - `/api/v1/topbar/status` 失败率 15 分钟窗口 `> 2%`
  - 通知下拉/消息中心读取失败率 15 分钟窗口 `> 2%`
  - 任意开放重定向、CSRF 旁路或跨源跳转回归 = 立即全量回退
- 首批性能预算固定为：
  - 新应用壳首屏 entry JS gzip `<= 220 KB`
  - 首屏 CSS gzip `<= 80 KB`
  - 首批消息中心/顶部状态额外 chunk gzip `<= 60 KB`
- 首批无障碍 Gate 固定为：`/web/login`、`/web`、`/web/messages` 的 axe `critical/serious = 0`，并完成键盘登录、顶部导航、通知下拉、消息中心筛选/分页和路由后焦点恢复的人测路径。

## W1/W2 的直接执行输入

1. 先在 `docs/openapi/yuance.openapi.json` 维持本文件定义的 parity 基线，不允许再以 HTML 行为倒推 REST/SSE 契约。
2. W1 先创建 `web/`，把 `/web` 应用壳、`auth/me`、`auth/csrf`、`topbar/status`、`topbar/events`、`notifications` 接成独立 Browser transport；此时 `/web/login` 与消息中心正文仍可维持 SSR owner。
3. W2 第一批代码切片必须优先补齐安全 `return_to`：受保护 SSR/SPA/旧通知入口 -> `/web/login` -> 登录失败重渲染 -> 登录成功跳回，并以 Browser 内部一次性 state 恢复 hash。
4. W2/W3 再补通知语义 REST：单条已读、批量已读、语义目标 DTO；只有这组契约通过后，`Notification.open_url` 才能从 HTML 兼容路由迁到新语义路由。
5. 在 `private, no-store` 分类落地前，不允许把认证 HTML、认证 JSON 或 SSE 交给 CDN/代理做长期缓存。
