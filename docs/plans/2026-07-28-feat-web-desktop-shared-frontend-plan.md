---
title: feat: Web 与 Electron 桌面端共享前端及离线演进
status: active
date: 2026-07-28
updated: 2026-07-31
origin: docs/brainstorms/2026-07-28-web-desktop-shared-frontend-architecture.md
---

# feat: Web 与 Electron 桌面端共享前端及离线演进

## 概述

将当前由 `api/` 同时提供 Rust 领域逻辑、Askama 页面、静态脚本和 REST API 的形态，按 **Web-first** 顺序渐进演进：先把浏览器前端做成独立 `web/` 模块，并逐 feature 迁移浏览器工作流；在至少一个完整业务 feature 经浏览器验证后，再提炼稳定的共享前端层；最后由 Electron 使用这套共享 UI 与 feature 逻辑构建内置 renderer，并把文件、通知、外链、窗口和托盘等系统能力放在 Desktop 宿主层。

Desktop 的核心不是重新实现一套业务页面。它以已经通过浏览器验收的 Web feature 为功能基线：同一业务状态、REST/SSE 契约、操作结果、错误状态和路由语义应尽量复用；只有文件系统、原生系统通知、外链、窗口、托盘、凭证库和离线缓存等确有宿主差异的能力才由 Desktop adapter 处理。

“前后端分离”在首期指代码、构建和接口契约分离，不等于立即把浏览器前端部署到不同 origin。首批 `web/` 构建产物继续与 `api/` 同源交付，以保留 Cookie、CSRF 和 SSE 行为。跨源 Web 部署、`app://` 桌面认证和离线同步都是后续独立门槛，不阻塞浏览器迁移。

本计划不把“内置前端资源”误称为“离线业务数据”。Desktop 的本地 Shell、在线功能对齐、已同步数据只读缓存和离线写入/双向同步是四个独立阶段，分别验收。

## 当前基线

- `api/` 同时承担 Rust 领域规则、REST API、Askama 页面、`api/static/app.js`、`api/static/app.css` 和 `/web/*` 路由。
- `desktop/src/main.mjs` 通过 `BrowserWindow.loadURL(webConfig.url)` 加载远端 Web 页面；`preload.cjs` 当前只暴露受限的原生通知桥。
- `api/static/app.js` 仍含 `window.yuanceDesktop` 探测、同源相对请求、SSE 和 Electron 通知逻辑，不能直接复制为独立 renderer。
- `api/src/domains/**` 是服务端权限、审计、业务规则和通知事实的唯一来源；前端不得复制这些规则。
- `/api/v1` 已覆盖部分业务能力，但 `docs/openapi/yuance.openapi.json` 尚未覆盖全部 `/web/*` 交互、附件、SSE、通知语义和系统管理能力。
- 当前浏览器会话使用 `HttpOnly; SameSite=Lax` session、refresh 和 CSRF Cookie；非 Bearer 写请求依赖 CSRF 校验，API 没有通用跨源 CORS 层。

2026-07-30 执行校准后，仓库已经具备第一批 Web-first 实现基础：

- `web/` 已落地 JavaScript ESM/JSX + Vite + React + JSDoc/checkJs 工程，根 `package.json` 已提供 W1 范围的 `check:frontend`。
- `api/Dockerfile`、`scripts/build-api-image-amd64.sh`、`scripts/smoke-web-app-image.sh` 与 `.github/workflows/web-frontend.yml` 已覆盖前端构建、同源 `/web/app/*` 交付、Playwright E2E 和生产同款镜像 smoke。
- `api/src/web/router.rs` 已提供 `/web/app/*` 入口、SPA fallback、manifest/哈希资源缓存头和缺失资源 404 行为。
- `api/src/web/user/mod.rs` 已通过 `YUANCE_WEB_APP_SHELL_V1` 控制 `/web`、`/web/messages` 等入口的 Web app owner；这是当前实现中的简化 rollout 形态，不等同于完整持久 assignment / audit / kill switch 控制面。
- `web/src/app.jsx` 已覆盖浏览器应用壳、顶部状态、消息中心、项目列表、工作项列表和工作项协作首个读写闭环：详情编辑、推进并指派、普通评论新增/编辑、工作项附件与评论附件列表/下载/上传。富文本评论高级体验、资料库和文档预览仍属于 W3 后续切片。

## 计划索引与当前切片

本计划作为 Web-first 与 Desktop 演进主线保留 `active`。具体功能切片和阶段执行产物继续独立成文，避免把长期架构计划变成执行日志。

2026-07-30 整理结论：

- 不把子计划或 W0 执行产物的正文合并进本主线计划。
- 本节是主线的唯一索引入口；子文档只在状态、归属边界或收口结果变化时同步更新到这里。
- 主线继续管理 W0-W4、D1-D4、G-DIST 的阶段门槛；legacy `doc/ppt` 预览只作为“文档预览 / 附件体验”切片，不提前触发共享前端或 Desktop renderer 工作。

| 文档 | 类型 | 状态 | 归属边界 | 下一步 / 收口方式 |
|---|---|---|---|---|
| `docs/plans/2026-07-25-002-feat-legacy-doc-ppt-experimental-preview-plan.md` | 功能切片计划 | `completed` | 文档预览 / 附件体验切片；不提前进入 `web/` 模块、Desktop renderer、device-session 或离线同步。 | 已收口：legacy `doc/ppt` 默认关闭，开启时统一实验性入口、降级页和 rollout 文档。 |
| `docs/plans/2026-07-30-web-first-w0-inventory-and-contract-parity.md` | W0 执行产物 | `completed` | 首批 Web-first 盘点、route-to-contract parity、回跳/缓存/rollout/CI 基线；服务于 W1/W2 输入。 | 不合并正文；后续 W1/W2 直接引用该基线，若 W0 决策变化再同步修订。 |
| `docs/plans/2026-07-30-002-feat-web-work-item-collaboration-migration-plan.md` | W3 功能切片计划 | `completed` | 工作项详情写入、handoff、评论与附件迁移；已形成首个 Web 读写业务闭环。 | 已收口：Browser E2E 覆盖编辑、handoff、评论和附件四段式上传/下载；可作为 W4 共享层提炼评估输入。 |
| `docs/plans/2026-07-31-001-refactor-w4-shared-javascript-layer-plan.md` | W4 重构子计划/RFC | `active` | 共享 JavaScript 层提炼；先冻结抽取边界、包依赖图、Browser transport 留存和 Web 回接验证。 | 按该子计划分单元执行；未完成前不启动 Desktop renderer、`app://`、device-session 或离线能力。 |

### 阶段状态快照

| 阶段 | 当前状态 | 已落地证据 | 下一步 |
|---|---|---|---|
| W0：Web-first 边界与契约基线 | `completed` | `docs/plans/2026-07-30-web-first-w0-inventory-and-contract-parity.md` 已收口；首批 route-to-contract parity 与交付基线已形成。 | 只在 W0 决策变化时同步修订。 |
| W1：独立 Web 构建与首批 REST/SSE 契约 | `completed`（基础闭环） | `web/package.json`、`web/jsconfig.json`、`web/vite.config.js`、根 `check:frontend`、`.github/workflows/web-frontend.yml`、`api/Dockerfile`、`scripts/smoke-web-app-image.sh`、`api/tests/routing_smoke.rs`。 | 后续只做硬化：完整 rollout 控制面、bundle budget、自动 axe gate、契约 breaking-change diff。 |
| W2：浏览器应用壳、认证衔接与消息中心 | `completed`（首批壳与消息） | `web/src/app.jsx`、`web/src/lib/api.js`、`web/src/lib/routes.js`、`web/e2e/app-shell.spec.mjs`；登录 `return_to`、通知语义目标与幂等已读已有测试覆盖。 | 继续通过 W3 feature 切片扩展应用壳能力，不再重复建设壳。 |
| W3：浏览器端高频 Feature 迁移 | `active`（首个读写闭环已完成） | 项目列表、工作项列表、工作项详情协作闭环已接入；`docs/plans/2026-07-30-002-feat-web-work-item-collaboration-migration-plan.md` 已收口。 | 继续按独立切片迁移资料库、项目详情、文档预览等高频 feature；不阻塞 W4 评估。 |
| W4：共享 JavaScript 层提炼 | `active`（子计划/RFC 已创建，尚未实施） | `docs/plans/2026-07-31-001-refactor-w4-shared-javascript-layer-plan.md` 已定义抽取边界、包依赖图、Browser transport 留存和迁移顺序；尚未创建 `frontend/packages/*`。 | 按 W4 子计划先冻结执行边界，再创建共享 workspace 并完成 Web 回接验证。 |
| D1 / D2：Electron 安全宿主与功能对齐 | `pending` | 当前 Desktop 仍以远端 Web 页面为主。 | D1 前必须先完成 device-session / `app://` / credential / file-transfer RFC。 |
| G-DIST / D3 / D4：更新与离线能力 | `pending` | 未启动。 | 作为 D2 后独立 Gate 或离线专项，不阻塞 W3。 |

### W3 Feature 迁移矩阵

| Feature | 当前状态 | 新 Web 覆盖 | 仍依赖旧 Askama / 静态脚本 | 下一步 |
|---|---|---|---|---|
| 浏览器应用壳 / 顶部状态 | 已接入 | 会话检查、顶部状态、SSE 刷新、登出和基础导航。 | 旧 Askama 页面仍由 `api/static/app.js` 支撑。 | 作为后续 feature 的宿主基线维护。 |
| 消息中心 | 已接入 | JSON 列表、过滤、语义目标、单条/批量已读、通知打开后跳转工作项。 | `/web/messages/{id}/open` 仍作为旧兼容层。 | 等更多工作项详情能力迁入后再评估旧 HTML 跳转下线。 |
| 项目列表 / 当前项目 | 已接入 | 项目列表分页、状态筛选、切换当前项目。 | 项目详情、成员、周期、资料等仍在旧页面。 | 若需要继续迁移项目域，优先切项目详情只读页。 |
| 工作项列表 | 部分接入 | 需求/任务/Bug 列表、筛选、分页、打开只读详情。 | 保存筛选、批量操作、创建/编辑 modal 等仍在旧页面。 | 下一切片前先盘点写操作 API 契约缺口。 |
| 工作项详情 | 首个读写闭环已完成 | 基础字段、父子项链接、编辑核心字段、推进并指派、普通评论新增/编辑、工作项附件与评论附件列表/下载/上传、旧版详情回退入口。 | 富文本回复、正文内附件节点、图片/文档预览、拖拽粘贴上传、实时讨论深度交互仍在旧页面或专项计划。 | 作为 W4 共享层提炼的首个候选 feature；旧版详情下线需另行制定回退窗口和高级体验补齐计划。 |
| 资料库 | 未迁移 | 暂无。 | 资料列表、资料详情、受保护资料、正文附件和文件管理器仍在旧页面。 | 工作项闭环完成后再作为独立 W3 子计划。 |
| 文档预览 | 未迁移到新 Web | 暂无新 `web/` 预览宿主。 | 仍由 `/web/*/preview`、`api/static/document-preview*.mjs` 和旧页面文件卡入口承载。 | 资料库迁移时同步设计 API client、资源路径与降级策略。 |

## 需求追踪

- R1：新增独立 `web/` 前端模块，先在浏览器中逐 feature 取代 Askama 页面实现。
- R2：`api/` 收敛为 Rust 业务后端、REST/SSE、认证、文件和过渡期 Web 资源宿主，不再长期承担唯一 HTML 页面实现。
- R3：浏览器迁移期保持同源资源交付和旧页面兼容，不因前端分离提前改变 Cookie、CSRF 或 SSE 信任模型。
- R4：每个已迁移 Web feature 只能通过稳定 REST/SSE 契约工作，不解析 HTML、读取模板注入数据或拼接 `/web/*` 业务 URL。
- R5：新前端默认采用 JavaScript ESM/JSX；使用 JSDoc 和 `checkJs` 建立可检查的共享契约，不新增业务 `.ts` 或 `.tsx` 源文件。
- R6：在经浏览器验证的 feature 基础上提炼 `api-client`、`app-core`、`ui` 和 `platform-contract`；不以未验证的 Electron 需求预设共享抽象。
- R7：浏览器与 Electron 最终复用共享 feature/UI/API 源码，但保留各自独立的 composition root、路由历史、认证 transport 和平台适配器。
- R8：桌面正式安装包加载受限 `app://` 内置 renderer，不依赖生产远端 `/web` URL。
- R9：共享前端不直接依赖 Electron、Node.js、`ipcRenderer` 或 `window.yuanceDesktop`；桌面能力只经受限 adapter 暴露。
- R10：通知目标、已读状态和访问校验以 REST/事件契约表达，不以 `/web/*` 展示 URL 作为跨宿主业务契约。
- R11：Desktop 文件选择、上传、下载、保存和定位使用主进程签发的 capability；renderer 不取得原始本地路径，也不能请求任意 URL、读文件或写文件。
- R12：Desktop 原生系统通知仅由受限 Desktop adapter 请求、主进程投递；浏览器 UI 只负责站内通知状态，不能承担 Electron 系统能力。
- R13：离线能力分为在线功能对齐、已同步数据只读缓存和可选离线写入同步三个阶段。
- R14：REST、SSE 和 device-session 契约有明确的兼容、废弃、缓存、版本协商和服务端回滚规则，已发布 Desktop 不因服务端小版本变更失效。
- R15：每个 Web feature 切换具有服务端控制的目标、粘滞、审计、指标、告警和紧急回退机制。
- R16：Desktop 生产发行具有签名、平台信任链、制品完整性、安装/卸载数据语义和客户端版本兼容 Gate；自动更新保持独立阶段，不作为 D1 的隐含范围。
- R17：D1 的设备授权、refresh 生命周期、Desktop SSE transport、代理/TLS、单实例和进程生命周期必须形成可测试的 RFC，不由 renderer 自行猜测或降级。
- R18：共享 workspace 有单向依赖图、公开 export surface、唯一依赖解析和边界检查，避免跨宿主代码与 React runtime 漂移。
- R19：W1-W3 和 D1-D2 具有隐私审查后的可观测性、性能预算与适用的无障碍验收；构建/E2E 通过不是唯一上线信号。
- R20：D3/D4 的本地 schema 迁移、同步 checkpoint、离线授权新鲜度、附件内容版本和离线 operation 审计具有原子性与崩溃恢复语义。
- R21：W0/W1 先收口登录回跳、运行路由与 REST/SSE 契约的基线一致性、动态响应缓存、实时拓扑和 PR 级验证，避免把既有运行偏差带入共享层。
- R22：D1 的 device-session 明确凭证类别、端点授权、服务端 refresh 恢复、活跃 SSE 撤销、受信服务端登记和安全文件传输边界。
- R23：D1 的人工生产分发到 G-DIST 自动更新之间共享可验证的制品完整性、撤回、N-1 保留、发布控制面和 release-health 规则。
- R24：D3/D4 先定义一致快照/变更序列、授权 epoch、受保护资料范围、本地数据保护、冲突/附件 operation 状态和用户可见同步状态，再实现离线数据能力。

## 交付原则

- **先逻辑分离，后部署分离。** `web/` 可以独立开发、构建和测试，但首期生产资源保持 API 同源交付；只有明确重做 CORS、Cookie、CSRF 和 SSE 后才允许独立 origin 部署。
- **JavaScript 优先，JSDoc 约束。** 新前端源码使用 `.js` 或 `.jsx`，以 `// @ts-check` / `checkJs`、JSDoc `@typedef`、`@param`、`@returns` 和 `import()` 类型表达公开契约；`tsc` 只作为无产物检查器，不能引入 `.ts` / `.tsx` 业务源文件。
- **先浏览器验证，再共享提炼。** 在一个完整业务 feature 通过浏览器回归前，不创建完整的 `frontend/packages/**` 空壳，也不要求 Electron 同步实现。
- **UI、feature 与平台能力分层。** `ui` 只渲染状态并发出用户意图；`app-core` 处理 feature use case、状态和 API 调用编排；Browser/Desktop adapter 才接触历史、文件、通知和系统能力。共享目录不得通过条件判断直接调用 Electron 或浏览器全局桥。
- **按 feature 切换和回退。** 新旧入口并存；每个 feature 都要有旧路由、切换条件、回退路径和旧实现下线条件，禁止一次性重写所有 Askama 页面。
- **业务规则只在服务端。** `api/src/domains/**` 保持权限、审计、状态约束和通知事实的唯一来源；客户端仅负责展示、输入校验、缓存和同步编排。
- **Desktop 与离线单独设门。** 浏览器迁移不等待 `app://`、设备凭证、SQLite、附件缓存或冲突策略；Desktop 开始前必须完成安全设计和打包验证，离线能力则需额外批准。
- **可演进契约。** `/api/v1`、SSE 事件和 device-session 先定义兼容窗口、未知字段/枚举行为、弃用和回滚，再由 Web 或 Desktop 消费；客户端不能把服务端小版本更新当作破坏性重装。
- **可控切换与可诊断运行。** feature 切换必须由服务端统一决策并可审计、粘滞和紧急回退；发布前定义脱敏指标、告警、性能预算和无障碍验收，不能仅凭构建成功放量。
- **发行信任先于长期凭证。** D1 若面向生产分发，必须完成平台签名、制品完整性和支持边界；自动更新、外部深链接和离线数据分别作为显式后续能力，不以现有安装包或 `app://` 自动获得。

## 目标职责、JavaScript 基线与构建方向

```text
api/
  src/domains/                 # 业务规则、权限、审计、通知事实
  src/web/api/                 # REST、认证、SSE、后续同步接口
  src/web/                     # 过渡期 Askama 路由与 Web 资源交付

web/
  src/main.jsx                 # Browser composition root
  src/platform/browser/**      # 浏览器历史、文件选择和站内呈现 adapter
  src/features/**              # 首批未提取的浏览器 feature
  jsconfig.json                # allowJs + checkJs + noEmit
  vite.config.js               # 独立构建和同源开发代理

frontend/
  packages/
    api-client/src/**/*.js     # 从稳定 Web 请求层提取的 REST/SSE client
    app-core/src/**/*.js       # use case、状态、路由语义、通知编排
    ui/src/**/*.jsx            # 无宿主业务副作用的页面与组件
    platform-contract/src/**   # JSDoc 定义的平台能力、事件与 capability 模型

desktop/
  src/main.mjs                 # Electron 主进程、窗口、协议、受控系统操作
  src/preload.cjs              # schema 校验后的最小 IPC surface
  src/renderer/main.jsx        # Desktop composition root，仅在 D1 创建
  src/renderer/platform/**     # Desktop adapter，仅在 D1/D2 创建
  src/agent/                   # 仅在离线阶段批准后创建
```

`web/` 是首个实现宿主，不是 Electron renderer 的副本。W1-W3 中的代码可以先留在 `web/src/**`；W4 只提取已经在浏览器生产路径中被证明可复用的部分。Desktop renderer 和 Browser 分别构建，但它们的 feature/UI/API 源码来自同一共享包。

```js
// frontend/packages/app-core/src/mount-app.js
// @ts-check

/**
 * @typedef {import('../../api-client/src/api-client.js').ApiClient} ApiClient
 * @typedef {import('../../platform-contract/src/platform.js').PlatformCapabilities} PlatformCapabilities
 * @typedef {import('./router.js').AppRouter} AppRouter
 */

/**
 * @param {{ api: ApiClient, platform: PlatformCapabilities, router: AppRouter }} dependencies
 */
export function mountApp(dependencies) {
  // 宿主只在此处组合 API、平台能力和路由。
}
```

- `web/src/main.jsx` 注入 Browser API transport、Browser platform adapter 和浏览器路由。
- `desktop/src/renderer/main.jsx` 在 D1 创建，注入 Desktop API transport、Desktop platform adapter 和桌面路由。
- 所有跨包导出、REST/SSE DTO、React props、adapter 方法、IPC payload 和 capability 均要有 JSDoc；局部实现不要求为每个临时变量添加冗余注释。
- `web/jsconfig.json`、共享包检查配置和 Desktop renderer 检查配置启用 `allowJs: true`、`checkJs: true`、`noEmit: true` 与 `jsx: react-jsx`；JSX runtime 与选定的 Vite + React 配置一致。CI 必须运行该检查、lint 和测试。
- 静态检查脚本固定为可执行契约：W1 的 `web/package.json` 提供 `check:js`（`tsc -p jsconfig.json`）、`check:source`（断言 `web/src/**` 没有 `.ts` / `.tsx`）和串联二者与 lint 的 `check`。W4 的 `frontend/package.json` 声明 `packages/*` workspace，四个共享包各自提供相同的 `check:js`、`check:source`、`check` 和 `jsconfig.json`，由 `npm run --workspaces --if-present check` 聚合。D1 将现有 `desktop` 主进程语法检查拆为 `check:main`，新增 `check:renderer`（`tsc -p src/renderer/jsconfig.json` 加 renderer 源码后缀检查），再由 `check` 串联。根 `package.json` 的 `check:frontend` 随阶段扩展：W1 调用 `npm --prefix web run check`，W4 加入 `npm --prefix frontend run check`，D1 再加入 `npm --prefix desktop run check`；每个阶段的 CI 和打包前置步骤必须调用当阶段完整的聚合命令。
- `tsc` 仅作为无产物 JavaScript/JSDoc 检查器，由相应 package 的开发依赖提供；它不编译或生成应用 TypeScript。禁止使用 `// @ts-nocheck`、无说明的 `@ts-ignore` 或本地 `.d.ts` 逃避共享契约检查；第三方依赖自身携带的声明可正常消费。
- Electron Builder 必须显式复制 Desktop renderer 输出和其哈希 manifest，不能依赖开发机存在的 `web/dist`。

## 浏览器交付与兼容策略

- 当前正式环境只部署 `yuance-api` 容器。W0 的默认交付方式是：前端构建阶段生成 `web/dist`，在 `api/Dockerfile` 的多阶段构建中复制到最终 `yuance-api` 镜像的版本化静态目录，由 API 在同源 `/web/app/*` 提供；首期不新增 Caddy 静态站点、独立前端容器或跨源生产拓扑。
- API 静态服务只为新 Web SPA 路径提供 `index.html` 回退；缺失的哈希资源必须返回 `404`，不得回退成 HTML。入口 HTML 和 manifest 使用短缓存或 `no-store`，内容哈希资产使用长缓存和 `immutable`；同一个镜像必须包含匹配的入口、manifest 和全部资产，构建缺失任一产物即失败。
- 开发环境可使用受控 dev server/proxy，前提是 Cookie、CSRF、SSE、重定向和错误响应有集成测试；正式发布必须在与生产相同的 API 镜像中验证 SPA 入口、MIME、深链接、版本和缓存策略。
- 新 Web 应用先使用隔离的迁移入口，例如 `/web/app/*`；旧 `/web/*` Askama 页面继续可用。迁移清单必须为每个 feature 声明 canonical URL 的当前所有者、切换条件、紧急回退行为和最终接管方式，不能只写“后续决定”。
- 已迁移 feature 接管 canonical URL 时，直接打开旧书签或新 URL 都必须保留路径参数、查询参数和锚点。未认证回跳、浏览器刷新、前进/后退、旧通知和页面内链接必须按同一转换表工作；片段在服务端不可见时，由客户端在跳转前保留并恢复，`return_to` 仍只允许同源白名单路径。
- 首批可保留现有 SSR 登录页：登录成功后进入新 Web 应用壳；新应用通过明确 REST 会话检查和 CSRF 获取契约恢复会话。登录 UI 的完全迁移属于 W2 的后续切片，而不是 W1 的阻塞条件。
- `api/static/app.js`、模板和 `/web/*` 只在对应 feature 切换、浏览器回归和回退窗口结束后删除或收缩；不得因新 Web 构建成功就全量删除。
- 文档预览、PDF.js、OOXML vendor 和附件下载必须先脱离模板内联路径与 HTML partial 假设，再作为 Web feature 迁移；不能直接复制 `api/static/` 作为新应用产物。

## UI、业务逻辑与平台能力边界

| 层 | 职责 | 可以依赖 | 禁止依赖 |
|---|---|---|---|
| `ui` | 页面、组件、样式、无障碍状态、受控输入、纯展示回调 | React/选定 UI 基础库、JSDoc props | `fetch`、`EventSource`、Electron、Node.js、preload、文件路径、业务权限判断 |
| `app-core` | feature use case、状态、路由语义、加载/错误、通知编排、附件操作意图 | `api-client`、`platform-contract`、JSDoc DTO | Askama HTML、`window.yuanceDesktop`、`ipcRenderer`、原始 DOM/路径 |
| `api-client` | REST/SSE、错误模型、认证 transport 接口、分页、重连 | `fetch` 抽象、契约 DTO | JSX、页面状态、Electron、业务页面 URL |
| `platform-contract` | 文件、通知、外链、生命周期、路由历史等 JSDoc 接口 | 无宿主实现的值对象和类型 | Browser/Electron 具体 API、业务 feature |
| Browser adapter | 浏览器历史、`File`、受控下载、站内消息呈现 | 浏览器 API、`platform-contract` | Electron bridge、Node.js |
| Desktop adapter | 受限 preload 调用、窗口状态、系统通知、文件 capability、托盘/外链 | `platform-contract`、已声明的 bridge | 任意 IPC、任意 URL、原始本地路径 |
| Electron main/preload | OS 文件对话框、受控传输、原生通知、窗口、凭证库与严格安全校验 | Electron 主进程 API、固定 endpoint/config | 业务页面逻辑、通用文件/HTTP 代理 |

共享 feature 只发出平台意图，例如“选择一个待上传文件”“展示一条未读通知”“打开内部语义路由”。它不能依赖宿主检测分支来决定业务行为。Desktop 专属 UI 仅限窗口/系统能力所需的轻量状态；业务页面不能复制一套 Electron 版本。

### REST、事件与通知契约

- 每个进入新 Web 的用户操作必须有 JSON REST、错误模型、分页和需要时的 SSE 契约，并纳入 OpenAPI 或配套事件契约。
- 通知 DTO 不再以 `/web/messages/{id}/open` 等 HTML URL 表示业务跳转，而应包含通知 ID 与语义目标，例如工作项键和可选评论 ID。
- 新增经权限校验的通知目标读取与幂等已读 REST 操作；旧 HTML 跳转可在迁移期保留为兼容层。
- Web 与 Desktop 共享内部路由映射和服务端通知 ID 去重键。显示通知不自动标已读，用户点击后才调用幂等已读操作。
- SSE 当前只能表达“刷新”信号，不能被当作离线同步协议；断线、`Lagged` 和重连的行为必须由 `api-client` / `app-core` 明确处理。
- W0 为首批切片建立 route-to-contract parity 表：每个 `method + path` 都可追溯至 OpenAPI operation 或版本化事件 schema，并列出成功/错误状态、认证、CSRF、`Set-Cookie`、缓存头、JSON/SSE wire payload 和旧路由所有者。既有运行路由先校准到该表，再以 breaking-change diff 防止后续漂移。
- Browser transport 只能通过明确的会话检查/CSRF 契约在内存中取得和轮换 CSRF token；不得假设可读取 CSRF Cookie。401/403、会话刷新和并发写入的恢复语义必须由 API client 统一处理。

### 契约兼容、缓存与 SSE transport

- `/api/v1` 的默认演进规则是只追加兼容字段；客户端必须忽略未知字段，并把未知枚举映射为安全的“未知/需刷新”状态，不能据此发起写操作。任何 Browser 可调用的 REST/SSE 路径不得以 device-session capability 隐式改变破坏性语义，必须使用新 major 路径或保持向后兼容的服务端响应；device-session capability 仅适用于 Desktop 专属 endpoint。
- REST 与事件契约分别维护 OpenAPI 和版本化事件 schema。Desktop 在认证握手中上报 `desktopVersion`、`rendererRevision`、协议版本、平台和架构；服务端只为 Desktop 专属 endpoint 返回支持范围、最低版本和 feature capability。服务端发布、回滚和废弃必须同时验证当前与上一稳定 Browser 契约及当前与上一稳定 Desktop 契约；首个稳定 Desktop 发布时固化可回归的兼容基线与弃用日期。
- Browser SSE 继续使用同源 Cookie；Desktop 使用可携带短期 `Authorization` header 的受控 fetch-stream client，不使用浏览器 `EventSource` 假设，也不得把 Bearer 或 refresh 凭证放进 URL、查询参数、日志或错误上报。Desktop network service 仅从受信配置构造 canonical `https` origin 与固定 API/SSE path，renderer 不能传递任意 URL；REST/SSE 均显式拒绝重定向、不得手工跟随 `Location`、不携带 Cookie，并在每次重连重验 endpoint、TLS 与 device session。RFC 必须定义事件名/schema 版本、keep-alive、token 到期关闭语义、刷新后的重连顺序、指数退避上限、401/403 终态和代理禁缓冲。
- 会话检查、CSRF、认证 JSON、用户数据错误、SSE、签名附件授权、动态 SSR HTML、认证/owner 重定向和动态错误页统一使用 `Cache-Control: private, no-store`；SSE 禁止中间代理缓冲。只有明确公开且不可变的内容哈希资源才能使用长缓存；入口 HTML/manifest 不得被长期持久化，任何后续用户态 GET 缓存都必须定义用户隔离键、`ETag`/版本和 `Vary`。
- 契约 CI 对 OpenAPI 和事件 schema 执行 breaking-change diff；集成测试断言认证、SSE 和签名附件响应的缓存头、认证边界和 N/N-1 兼容行为。

### 通知的宿主分工

1. 服务端 domain 创建通知事实和语义目标，SSE 只发出刷新信号。
2. `app-core` 刷新通知列表、按服务端通知 ID 去重，并发出“需要呈现”的平台意图；它不调用浏览器或 Electron API。
3. Browser adapter 只更新消息中心与站内提示，不调用 `window.Notification` 作为 Desktop 系统通知的替代品。未来若单独批准浏览器通知，也必须以独立 Browser adapter 和权限产品设计实现。
4. Desktop adapter 根据窗口是否前台、最小化、用户偏好和操作系统允许状态，调用受限 preload 的 `notifications.present()`。
5. 主进程验证 sender、通知 ID、标题/正文长度和内部路由 schema 后调用 Electron `Notification`。点击时仅恢复/聚焦窗口并向 renderer 发送受限语义路由或通知 ID；renderer 在用户实际打开后调用幂等已读 REST。
6. 应用退出后不承诺 SSE 通知；当前不把它伪装成 APNs、FCM 或操作系统后台推送。

### 文件 capability 与受控传输

Desktop 不复用浏览器 `<input type="file">`、`File` 或远端 Web bridge 来访问本机文件。共享层使用 JSDoc 定义的 `DesktopFileCapability` 代表系统已批准的一次文件操作，避免与 Web `FileSystemFileHandle` 混淆。

- capability 仅由主进程签发，renderer 只能持有不可猜测的 opaque ID 和展示用元数据，如文件名、大小、声明 MIME、用途和过期时间；不得返回真实路径、目录、文件系统错误细节或可用于枚举本机文件的信息。
- capability 绑定当前用户、设备会话、顶层 `app://` sender、用途（上传/保存/定位）、目标资源、允许操作和短 TTL。登出、用户切换、权限撤销、窗口销毁、过期或一次性消费后必须失效，renderer 不能构造、续期或扩大它。
- Desktop 上传流程为：共享 feature 请求选择文件 -> Desktop adapter 调用受限 preload -> 主进程显示系统文件对话框并签发 capability -> 服务端按用户、目标、文件元数据和大小限制签发上传授权 -> 主进程/受控传输服务从 capability 对应文件流式上传，并把受限进度事件回传 renderer。主进程不接受任意上传 URL、任意请求头或任意本地路径。
- 浏览器上传仍由 Browser adapter 处理 `File` 与已定义的上传 REST/签名流程；它与 Desktop capability 是同一 feature 意图的两种宿主实现，不是两套业务规则。
- 下载/保存必须先经系统保存对话框或应用受控缓存根；定位只允许针对主进程已经确认归属的文件。主进程不得提供泛化 `fetch(url)`、读文件或写文件 IPC。
- 所有 capability、上传授权、重定向目标、MIME、文件大小和哈希校验都在主进程和服务端重复验证；日志、遥测和错误响应不得包含原始本地路径或短时签名 URL。

### 灰度、可观测性、性能与可访问性

- 每个迁移 feature 都由服务端的单一、持久化 rollout 决策点确定当前 canonical owner；决策至少包含目标粒度（全站/组织/角色/用户）、优先级、规则版本、assignment TTL、会话粘滞、审计、旧页返回策略和紧急 kill switch。客户端不能仅靠本地 feature flag、UA 或缓存决定新旧实现；重启后必须可复现同一 assignment 或按明确失效策略重新计算。
- W0 为首批切片定义放量与回退信号：认证失败、路由回退、前端错误、API/SSE 错误率、SSE 重连/`Lagged`、上传失败、关键任务完成率和支持工单。服务端与客户端事件只使用允许字段，并携带脱敏 correlation ID、release/客户端版本和 rollout 版本；不得包含 token、授权头、签名 URL、路径、文件内容或未经批准的业务文本。
- W0 固定实时与 rollout 的部署前提：W1-W4 要么只支持单 API replica，并定义 SSE drain、健康检查和禁止 scale 的发布约束；要么在允许多副本/滚动重叠前引入共享事件总线与持久 rollout store，并以双实例测试验证跨实例刷新、粘滞和回退。不能把当前单进程状态当作未记录的长期假设。
- W0 选定锁定版本的 headless Browser E2E runner、PR/push 触发条件、失败制品和阻断关系；W1 起，`check:frontend`、契约测试、前端构建、生产同款镜像 smoke、认证/回跳/缓存/owner 测试均为合并与部署前置条件。
- D1 诊断设计必须明确默认收集范围、用户同意/企业禁用、崩溃报告 endpoint、source map 访问、日志轮转/容量/保留期和支持包预览/脱敏。注入 token、路径、签名 URL、文件名和项目名的负向测试必须证明日志与 crash report 不泄漏敏感值。
- W1/W3/D2 在代表性设备与网络下定义并持续检查 JS/CSS 体积、首屏/导航、长任务、预览资源、列表/附件操作、SSE 重连和 Desktop renderer 内存/CPU 预算；预览和低频 feature 使用 route-level lazy loading，长列表明确分页或虚拟化策略。
- 共享 UI 以适用的 WCAG 2.2 AA 为基线；迁移验收覆盖键盘路径、路由标题与焦点恢复、表单错误关联、对话框焦点陷阱、加载/通知 live region 和系统通知不可用时的站内等价状态。

## 决策门槛

决策按阶段拆分。未收口的决定只阻塞其对应阶段，不应阻塞浏览器端 `web/` 的基础迁移。

### W0 前必须确认的浏览器门槛

| 决策 | 要求 | 对计划的影响 |
|---|---|---|
| 前端技术栈 | 固定 JavaScript ESM/JSX + JSDoc + `checkJs` + Vite + React 作为首期基线；不得把 TypeScript 再列为待选方案。 | 决定 `web/`、共享包、检查脚本和依赖管理。 |
| JSDoc 规则 | 定义公开模块、REST/SSE DTO、组件 props、adapter、IPC payload 和 capability 的 JSDoc 覆盖规则；配置 `checkJs`、lint 与 `noEmit`。 | 防止 JavaScript 共享边界失去可检查契约。 |
| 浏览器资源交付 | 首期明确采用同源交付；若未来选择跨源，必须先完成 CORS/Cookie/CSRF/SSE 集成验证。 | 决定开发代理、生产静态资源、SPA 回退和会话行为。 |
| 首批迁移范围 | 确认新 Web 应用壳、消息中心和首个完整业务 feature；定义旧入口、回退和下线条件。 | 防止大爆炸式重写。 |
| REST 契约基线 | 确认 OpenAPI/事件契约的维护方式、错误模型、CSRF 获取和未认证跳转行为。 | 决定 W1-W3 的 API 改动与测试。 |
| 登录与回跳 | 固定同源 allowlist 的 `return_to` path + query、错误登录保留、SSR/SPA/旧通知转换和一次性片段 state 恢复；禁止把表单或查询中的任意 URL 直接重定向。 | 使未认证书签、刷新和旧链接在 canonical owner 切换后仍可恢复目标，且不引入开放重定向。 |
| 运行契约 parity | 为首批切片建立 `method + path -> OpenAPI/事件 schema -> 状态/认证/CSRF/Set-Cookie/缓存/payload` 映射，并用真实 Router 校准既有运行行为。 | 防止不完整 OpenAPI 成为错误基线并扩散到 `api-client`。 |
| Browser CSRF 与动态缓存 | 固定内存 CSRF token 获取/轮换、401/403/并发写入恢复，以及动态 HTML、错误页和认证/owner 重定向的 `private, no-store` 分类。 | 防止前端读取 HttpOnly Cookie、用户态缓存混用或 rollout owner 陈旧。 |
| 契约生命周期与缓存 | 固定 Browser/ Desktop 各自的 `/api/v1`/SSE 兼容边界、未知字段/枚举行为、Desktop 专属 capability、最低客户端版本、弃用期、Browser 与 Desktop 的 N/N-1 测试、用户态响应缓存头和代理缓冲规则。 | 防止服务端发布/回滚破坏已安装 Desktop、已发布 Browser 或跨用户缓存命中。 |
| 灰度与回退治理 | 固定服务端 rollout 的目标粒度、粘滞、审计、canonical owner、旧页返回、量化放量/回退阈值和支持处置流程。 | 防止同一任务在新旧实现间跳转或无依据扩大覆盖。 |
| 运行质量基线 | 设定隐私字段 allowlist、指标/告警、性能预算和 WCAG 2.2 AA 适用验收。 | 使 W1-W3 的上线、回退和问题定位可操作。 |
| 实时拓扑与 CI 门禁 | 固定单 API replica + SSE drain 的首期约束，或先设计共享事件/rollout 后端；选定锁定版本的 Browser E2E runner、PR/push workflow、失败制品、镜像 smoke 与阻断部署规则。W0 决策必须在部署配置和 runbook 中填入可断言的 `sse_drain_timeout`、`stop_grace_period`、`max_release_window` 及超时强制关闭/失败语义。 | 避免多实例丢失实时/粘滞状态，并让 W1-W3 验收不依赖开发机手工执行或无限 drain。 |

### D1 前必须确认的 Desktop 门槛

| 决策 | 要求 | 对计划的影响 |
|---|---|---|
| 桌面认证与凭证矩阵 | 形成独立 device-session 协议和 OpenAPI/RFC：定义 browser-session、PAT、device-access、device-refresh 的 issuer/audience、允许 endpoint/scope、CSRF/Cookie 规则、Cookie+Bearer 优先级和审计字段；设备注册/批准、用户/设备绑定、短期 access、refresh rotation、撤销/登出、丢失处置、服务端时间和失败状态均可追溯。PAT 不得作为桌面登录凭证，Desktop 专属 endpoint 不得隐式接受 PAT/Cookie。 | 防止现有 Bearer/PAT 路径误取得 device 权限或 CSRF 豁免，并决定 API transport、凭证存储、刷新、登出、SSE 和负向测试。 |
| Electron 安全不变量 | 正式包固定 `contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`、`webSecurity: true`、`webviewTag: false`；默认拒绝权限，禁止未许可 `window.open`、导航和重定向。开发态不得放宽正式包的 IPC、导航和权限边界。 | 决定主进程、preload、CSP、构建和安装包测试。 |
| 本地 renderer 安全 | 固定 `app://` origin、资源 manifest、深链接、CSP、`connect-src` endpoint allowlist、导航/重定向、顶层 frame、权限和 IPC sender 规则。 | 防止远端页面或非受信 frame 调用原生能力。 |
| 文件 capability 与 Storage transfer | 确认 `DesktopFileCapability` schema、发行者、绑定信息、TTL、失效条件、上传授权、保存/定位范围和隐私日志规则；主进程必须持有不可替换文件 identity，拒绝 symlink/reparse point、目录和非常规文件。另定义仅由认证 API 响应签发的 `StorageTransferGrant`，固定 storage origin/path/method/允许 headers/字节数/digest/TTL/一次性消费，禁止传递 device Authorization/Cookie 或跟随重定向。 | 决定 D2 文件选择、上传、下载和定位实现，避免 TOCTOU 与泛化 HTTP 代理。 |
| 通知产品语义 | 明确投递类别、前台/最小化判定、设备偏好、显示与已读时机、目标缺失回退和退出后是否承诺通知。 | 决定 D2 Desktop adapter 和服务端通知契约。 |
| 服务端登记与网络 | 确认第一期仅支持官方服务端，或设计私有化/多服务器登记、TLS/私有 CA 和 endpoint allowlist。官方模式使用打包签名覆盖的 profile；私有化模式使用管理员签名 enrollment bundle，至少绑定 canonical origin、server instance、允许 API/SSE/storage origin、信任锚、有效期和轮换。私有化根密钥必须经 MDM/企业配置、预置可信根或带外人工指纹确认获得，bundle 不得以自身携带的根密钥自证。生产包不得由环境变量、renderer、网页或 CLI 静默改写 endpoint。 | 禁止由任意远端页面或本地配置决定 IPC/凭证信任；切换 server 必须先清理旧凭证、流和缓存，再重新设备授权。 |
| 设备授权与凭证生命周期 | 固定系统浏览器设备授权流、批准/取消/超时、账户切换、renderer 不接触密码、refresh 单飞、凭证库原子写入、崩溃恢复和本地优先清理状态机；RFC 必须选择 sender-constrained proof-of-possession，或明确接受 bearer refresh 的泄漏威胁模型、最大暴露窗口和风险责任人。服务端定义 family/generation/CAS、`(device_session, transaction_id)` 唯一性、恢复终态的机密保存/查询认证与到期擦除。 | 防止重复批准、refresh 重放、凭证库失败与不可恢复登录循环，也不把可复制 bearer secret 误称为不可复制的设备绑定。 |
| Desktop SSE 与网络 | 固定 fetch-stream Bearer transport、重连/轮换/代理行为、系统代理/PAC、TLS/私有 CA、禁止证书错误绕过和 endpoint 切换后的重新认证；连接绑定 device/user/authorization version，且设备撤销、用户禁用、权限变更和 token 到期会在配置化且可断言的 `revocation_close_deadline` 内主动关闭既有流，超时强制关闭，只有完成重新授权后可重连。 | 防止 `app://` 误用浏览器 Cookie/EventSource 假设、以降级方式绕过 TLS，或让已撤销设备继续接收实时元数据。 |
| 生命周期与外部激活 | 固定单实例、窗口关闭/退出、休眠/唤醒、主进程/renderer 崩溃和凭证库不可用状态。D1 不注册自定义协议或通用外部深链接；将来若引入必须另行定义 OS 激活、认证前暂存和路由 schema。 | 防止多实例竞争、登录回传注入和平台行为漂移。 |
| 发行与平台支持 | 固定平台 × 架构 × 能力矩阵、安装/升级/卸载的数据语义、生产签名/公证/制品哈希、构建 provenance/SBOM、依赖补丁 SLA 和支持边界；同时确认证书/签名服务所有者、受保护 CI environment、密钥注入、轮换/撤销演练和任一平台签名失败时阻止 `publish` 的 preflight。人工分发也必须具备签名 release manifest、GitHub/OSS/公网下载三处 digest 核验、HTTPS 且拒绝重定向的发布控制面、`withdrawn/revoked`、审计和不可被普通 retention 清理的已验签 N-1。D1 发行 RFC 必须在发布配置和 runbook 中给出 `max_presigned_url_ttl`、`withdrawal_exposure_slo` 的数值、起算点、时钟来源和按下载路径的适用范围；发布服务拒绝未配置或超出上限的 URL。新请求撤回后立即拒绝；若业务要求即时使既有 URL 失效，必须经对象/边缘 deny 或受控下载网关实现，不能把控制面撤回误称为 bearer URL 即时失效。现有 ad-hoc 配置仅限预览。自动更新明确不在 D1，留给 D2 后独立 Gate。 | 在存储长期设备凭证前建立可验证的客户端信任链、事故撤回和恢复路径。 |

推荐：Desktop 使用按设备可撤销的短生命周期凭证，refresh 凭证只存操作系统凭证库；renderer 不持有长期凭证或通用授权头。应用存活且窗口非前台时才展示原生通知，用户点击后才标已读。

### D3/D4 前必须确认的离线门槛

| 决策 | 选项 | 对计划的影响 |
|---|---|---|
| 离线范围 | 内置 Shell / 已同步数据只读 / 完整离线写入 | 决定是否进入 D3、D4，以及是否需要 outbox 与冲突 UI。 |
| 缓存同步 | 授权范围全量刷新 / 快照 + 稳定游标增量；两种路线的跨分页/跨投影都必须由服务端签发一致 `snapshot_id`、`snapshot_sequence`、scope manifest 和 continuation fence，且实体具备稳定 revision/tombstone。全量路线仅写入 staging generation，完整验证 scope manifest/continuation/epoch 后才原子切换唯一 active completed generation；`snapshot_expired`、continuation 失效、epoch 变化或批次/附件失败时丢弃 staging，读取端绝不混合新旧 generation。仅在选择增量时再要求全局 `change_sequence`、delta 和 cursor 过期重建。 | 决定初始同步、删除墓碑、权限撤销、重连和恢复语义，禁止用普通列表分页拼装快照，也不把全量路线误改成隐式增量协议。 |
| 缓存数据与附件 | 数据集、附件下载策略、配额、加密、用户切换和登出清理 | 决定本地数据库、文件缓存和测试范围。 |
| 冲突与附件同步 | 操作幂等、基线版本、实体冲突规则、内容哈希与续传 | D4 的前置条件，未确认时不得开始离线写入。 |
| 授权 epoch 与变更序列 | 定义 user-global、project-scope、device-session revoke 等 authorization epoch；成员、角色、权限、用户状态和设备撤销与受影响 epoch、tombstone、审计和变更记录在同一服务端事务推进。 | 使租约、snapshot、delta 和 outbox 能拒绝过期授权并在竞态中锁定受影响 scope。 |
| 本地 schema、数据保护与受保护资料 | 固定 SQLite schema version、事务迁移、迁移失败/降级/重建、批次 generation、原子 checkpoint、staging 文件和强杀恢复；选择数据库层或字段层加密，并覆盖主库、WAL/SHM、临时目录、索引、staging、诊断包和备份的密钥生成、包装、轮换与销毁。明确首期排除受保护资料，或另定义 unlock epoch、短租约、独立密钥和密码变更/归档失效语义。 | 防止升级或同步中断后读取半迁移、半应用或损坏附件，也防止本地介质、密码重置或撤权泄漏正文。 |
| 离线授权新鲜度 | 使用服务端签发、可验证且短期的离线访问租约，绑定 endpoint/server/user/device/授权版本，定义最大离线时长、过期、单调时间/墙钟回拨、撤销未送达和附件解密行为。 | 将未送达撤权的最大暴露窗口限制在租约上限内，而不是无限信任最后一次同步。 |
| 附件、冲突与 operation 完整性 | 定义版本化 `sha-256:<base64url>` 明文 `content_digest`、字节数、缓存键和 `pending -> verified -> available` 原子发布；同步写入定义 `(actor, device_session, operation_id)` 唯一性，以及仅含协议版本、操作类型、目标、基线版本、规范化 payload 和依赖的版本化 fingerprint，明确排除认证头、actor、device session、当前权限/角色和其他可变服务端状态；同 key 不同 fingerprint 返回 `409` 并审计。相同 fingerprint 只保证业务副作用不重复：每次重试先重新校验当前 resource authorization/authorization epoch，仍有读取权限时才返回重新投影的终态；无权限时返回不泄露资源存在性或历史 payload 的受控拒绝。D4 前还必须形成 operation matrix：每类写入的 `base_revision`、自动合并条件、三方 `409 conflict` payload、用户动作和新的 operation ID；附件另有 `reserved -> uploading -> server_verified -> attached|cancelled|rejected|expired` 状态、依赖关系、确认丢失/撤权/超时 GC 规则。 | 防止缓存错误命中、重复业务变更、同 key payload 混淆、静默覆盖、撤权后历史数据泄漏、未验证附件被引用和重复/缺失审计。 |
| 用户可见离线状态 | 定义版本化 `OfflineStatus` 与 `SyncOperationStatus`，至少包含 scope/generation/最后成功服务端时间、网络/租约/密钥/缓存可读范围、队列/依赖、下一重试、永久错误和安全详情，以及重试、取消、丢弃、查看冲突、重新登录、清除重同步等可用动作。 | 防止用户把陈旧缓存、被锁定内容、未确认附件或待发操作误认为已同步。 |

推荐将“已同步数据只读缓存”作为 D3 的单独产品 Gate；离线写入仅在同步协议、冲突策略和附件策略确定后进入 D4。

## 实施单元

### W0：Web-first 边界、JavaScript 基线与回退设计

**目标：** 在不改动 Desktop 行为的前提下，确定独立 `web/` 模块的 JavaScript/JSDoc 基线、首批范围、同源交付方式、兼容策略和可验证退出条件。

**涉及文件：**

- 修改：`docs/plans/2026-07-28-feat-web-desktop-shared-frontend-plan.md`
- 后续检查/修改：`api/src/web/router.rs`、`api/templates/**`、`api/static/**`、`docs/openapi/yuance.openapi.json`

**实施方式：**

- 建立 `/web/*` 页面、HTML partial、静态资源、表单写操作、REST、SSE、附件预览与旧路由的迁移清单。
- 为每个首批 feature 记录：新入口、旧入口、canonical URL 当前所有者、路径参数、查询参数、锚点、未认证 `return_to`、页面内链接、旧通知、刷新/前进/后退行为、所需 REST/SSE、鉴权/CSRF 行为、Browser/ Desktop 验收、回退开关和旧实现下线条件。`return_to` 仅保存经服务端解析的同源 allowlist path + query；片段由 Browser 以一次性 state 保存和恢复，禁止把表单或查询中的任意 URL 直接重定向。
- 为首批迁移 endpoint 建立 route-to-contract parity 表：实际 `method + path`、OpenAPI operation/事件 schema、成功/错误状态、认证凭证、CSRF、`Set-Cookie`、`Content-Type`、缓存头和 JSON/SSE wire payload 必须一一对应；先修正既有规格/运行差异，再把该表作为 breaking-change diff 的基线。
- 将动态 SSR HTML、认证/owner 重定向、错误页、会话/CSRF、SSE 和签名授权统一纳入 `private, no-store` 分类；只有内容哈希资产可 `immutable`，入口/manifest 不长期缓存。
- 记录 `/api/v1` 与事件 schema 的兼容/弃用矩阵、当前与上一稳定客户端的支持窗口、按响应类别的缓存头、Browser Cookie SSE 与 Desktop Bearer fetch-stream 的宿主差异；Browser 可调用路径的任何破坏性变更必须使用独立 major 或保持向后兼容，device-session capability 只用于 Desktop 专属 endpoint。
- 设计服务端 rollout 决策、目标粒度、粘滞、审计和紧急回退，并为每个切片绑定放量/回退指标、支持处置和旧页返回策略；固定持久 rule/assignment/audit、规则版本、assignment TTL、kill switch、告警表达式、责任人和重启后的恢复规则。
- 固定 W1-W4 的实时部署约束：要么只有单 API replica，并定义 SSE drain、健康检查和禁止 scale；要么先引入共享事件总线/rollout store 并用双实例验证。选定 headless Browser E2E runner、PR/push workflow、失败制品和阻断部署规则；在部署配置/runbook 中固定 `sse_drain_timeout`、`stop_grace_period`、`max_release_window` 和超时强制关闭/发布失败语义。
- 定义隐私字段 allowlist、Web/Desktop 诊断与告警、性能预算及无障碍基线；把测量设备、网络和阈值写入后续验收，而不是事后解释指标。
- 固定首期唯一生产链路：前端构建阶段 -> `web/dist` -> `api/Dockerfile` 多阶段构建 -> 最终 `yuance-api` 镜像静态目录 -> API 同源 `/web/app/*` 服务；明确入口/manifest/哈希资源缓存头、SPA 回退边界、构建失败语义和镜像回滚行为。
- 固定 JavaScript ESM/JSX、JSDoc 约定、`jsconfig.json` 的 `allowJs` / `checkJs` / `noEmit` / `jsx: react-jsx` 配置，以及 `web`、`frontend`、`desktop` 的 `check:js` / `check:source` / `check` 脚本和根 `check:frontend` 聚合命令；不得创建应用 `.ts` / `.tsx` 源文件。
- 明确 W0 不创建 Desktop renderer、不修改 Electron 认证、不引入 SQLite、缓存或同步。

**验收：**

- 迁移清单覆盖首批浏览器路径，并能追溯到具体 API 契约、canonical URL、参数/锚点转换、Browser/ Desktop 差异和旧页面回退路径。
- JSDoc 覆盖范围、`web`/共享包/Desktop renderer 的 `check:js`、`check:source`、`check` 与根 `check:frontend` 命令、异常豁免规则和 CI 失败条件已确定；`tsc` 的角色仅为无产物 JavaScript 检查器。
- W0 决策记录说明同源 Cookie、CSRF、SSE、未认证跳转、静态资源交付、缓存头、镜像构建和回滚的验证方式。
- route-to-contract parity 表覆盖首批 REST/SSE、现有规格差异、Browser 内存 CSRF token 生命周期、`return_to`/片段恢复和动态响应缓存分类；不允许以 HTML 行为或不完整 OpenAPI 推断新客户端契约。
- rollout 控制面、单/多副本实时拓扑选择、SSE drain、指标/告警、headless E2E/镜像 smoke 的 CI 触发、制品和阻断规则均已确定；后续 W1-W3 不依赖开发机手工验收。
- 契约兼容、缓存、rollout、指标/隐私、性能和无障碍 Gate 已明确到可实现的 schema、配置、测试和量化阈值；D1/D3 的未决决策不被错误提前当作浏览器默认行为。
- 后续 W1-W3 可以在不变更 `desktop/` 的情况下实施。

### W1：独立 Web 构建与首批 REST/SSE 契约

**当前状态：** `completed`（基础闭环已落地，硬化项继续随 W3 推进）

**已落地：**

- 独立 `web/` 工程、JSDoc/checkJs、lint、单元测试、Playwright E2E 与根 `check:frontend`。
- `/web/app/*` 同源交付、SPA fallback、manifest、哈希资源缓存、缺失资源 404 和生产同款镜像 smoke。
- 首批 REST/SSE 契约：会话检查、CSRF 获取、登出、顶部状态、顶部 SSE、通知列表、通知语义目标、单条/批量已读。
- W1 范围 CI：`.github/workflows/web-frontend.yml` 已在相关路径变更时执行前端检查、Rust 契约测试、Web build、Playwright 和镜像 smoke。

**后续硬化项：**

- 当前 `YUANCE_WEB_APP_SHELL_V1` 是环境级 owner 开关，不是完整持久 rollout assignment / audit / kill switch 控制面；后续放量前需补服务端持久规则、粘滞 assignment、审计和指标。
- 当前有 E2E 与 smoke，但未强制 bundle size budget、自动 axe gate 和契约 breaking-change diff；这些作为 W3 放量前的硬化项处理。
- 部署脚本和 compose 已显式记录 `sse_drain_timeout`、`stop_grace_period`、`max_release_window`，但当前发布仍以单副本强制替换为主；完整受控 SSE drain 或多副本共享事件/rollout 后端仍是后续运维硬化项。

**目标：** 建立独立 JavaScript Web 前端的构建和同源交付通路，并只为首批 Web 切片补齐可消费的 API 契约。

**涉及文件：**

- 新增：`web/package.json`、`web/jsconfig.json`、`web/vite.config.js`、`web/scripts/assert-js-only.mjs`、`web/src/main.jsx`、`web/src/**`
- 修改：根 `package.json` / workspace 配置（新增 W1 范围的 `check:frontend` 聚合命令；W4/D1 按新模块扩展该命令）
- 修改：`api/Dockerfile`、`scripts/build-api-image-amd64.sh`、`Makefile`、`scripts/deploy-production.sh`、`deploy/easy-deploy/production/backend/compose.yaml.example`、部署/CI 配置
- 修改：`api/src/web/router.rs`、`api/src/platform/config.rs`、`api/Cargo.toml`（提供受控 SPA 资源服务、深链接回退和配置；以实际实现为准）
- 修改：`api/src/web/api/mod.rs`、`api/src/domains/notifications.rs`
- 修改：`docs/openapi/yuance.openapi.json`、`docs/runbooks/production-deployment.md`
- 测试：`api/tests/*_flow.rs`、JavaScript/JSDoc 检查、Web 构建/契约测试、生产同款镜像 smoke test

**实施方式：**

- 让 `web/` 独立开发、构建、JSDoc 静态检查、lint 和测试；通过 `api/Dockerfile` 的前端构建阶段将 `web/dist` 复制进最终 API 镜像，再由 API 同源提供，不新增独立生产服务。
- 为 `/web/app/*` 定义受控静态资源服务：仅导航请求回退到 SPA 入口，哈希资源、manifest 与资源 MIME 必须精确返回；入口 HTML/manifest 短缓存，哈希资源长期 `immutable` 缓存。
- 建立隔离的 SPA 迁移入口和资源路径；旧 Askama `/web/*` 继续工作，不改变其默认行为。
- 将首批新 Web 所需的会话检查、CSRF 获取、读写、登出、错误模型和 SSE 重连明确为 REST/事件契约；Browser transport 只从该契约取得内存 CSRF token，并定义刷新、401/403、并发写入和登录后恢复行为，不能读取 Cookie。
- 用实际 Router 的集成测试校准 route-to-contract parity：补全/修正首批 OpenAPI operation、事件 schema、状态码、`Content-Type`、`Set-Cookie`、缓存头和 SSE wire payload；既有差异修正后才启用 breaking-change diff。
- 对每个 REST/SSE endpoint 标注兼容语义、认证方式、缓存类别和代理行为；认证/用户态/签名授权响应默认 `private, no-store`，事件 schema 独立版本化且受 breaking-change diff 保护。
- 引入服务端 rollout 决策与脱敏运行事件；新旧入口均读取同一决策，指标按 rollout、release 和 correlation ID 关联，不将业务正文或凭证写入遥测。动态 SSR HTML、认证/owner 重定向和错误页也遵守 `private, no-store`；rollout 规则、assignment、审计和 kill switch 在进程重启后保持可解释。
- 将 W0 选定的实时拓扑落实到 Compose、`scripts/deploy-production.sh` 和生产手册：单副本模式显式禁止 scale，发布先将旧实例置为不接新连接/不可 ready，向 SSE 客户端给出受控重连，按配置化的 `sse_drain_timeout` 与 `stop_grace_period` drain，超时强制关闭且发布在 `max_release_window` 内失败或完成新实例 ready；多副本模式则先接入共享事件/rollout 后端并通过双实例测试。不得继续使用未定义 drain 语义的直接强制重建作为线上发布闭环。
- 为通知新增语义目标读取与幂等单条/批量已读操作；保留旧 `/web/messages/{id}/open` 仅供旧页面兼容。
- 新 Web 不读取 HTML meta、HTML partial 或 `/web/*` 展示 URL 作为业务契约。

**验收：**

- 新 Web 入口仅通过已定义 REST/SSE 完成会话检查、读取、写入、登出和实时刷新。
- API 测试覆盖成功、未认证、无权限、CSRF 拒绝、分页和统一错误响应。
- JSDoc/checkJs 检查、lint 和构建均通过：`npm --prefix web run check` 与 W1 范围的根 `npm run check:frontend` 必须以非零状态阻止构建；新增前端源文件不包含 `.ts` / `.tsx`。
- PR/push CI 在锁定的 headless Browser 环境中执行 `check:frontend`、route-to-contract parity、认证/CSRF/SSE/缓存测试、前端构建和生产同款镜像 smoke；失败时保留截图、HAR、bundle 报告和相关日志，部署仅接受通过该门禁的 commit。
- 生产同款 smoke/integration 还验证选定拓扑的 ready -> drain -> replace 行为、SSE 受控重连、`sse_drain_timeout`/`stop_grace_period`/`max_release_window` 的超时处置和单副本禁止 scale；多副本模式改为验证跨实例事件、rollout assignment 和回退。
- 在正式同款 API 镜像中验证 `/web/app/*` 入口、带路径参数的深链接、资源 MIME、入口/哈希资源缓存头、构建版本和 manifest；缺失前端构建物或 manifest 时镜像构建必须失败，不能发布半套产物。
- OpenAPI/事件契约覆盖已迁移交互；浏览器不会因 HTML 模板细节变化而失效。
- 契约 breaking-change diff、当前/上一稳定 client 的契约套件、认证/SSE/签名授权的 `private, no-store` 与代理禁缓冲测试通过；rollout 评估、脱敏遥测和告警可定位每次切换的影响。

### W2：仅浏览器的应用壳、认证衔接与消息中心

**当前状态：** `completed`（首批应用壳与消息中心已落地）

**已落地：**

- SSR 登录页继续保留，新 Web 通过 REST 会话检查和 CSRF 契约恢复登录态。
- 安全 `return_to` 已覆盖 `/web/app/*`、旧消息入口和登录失败/成功链路；hash 片段由浏览器 session state 恢复。
- 浏览器应用壳已覆盖登出、导航、顶部状态、消息中心、通知语义目标跳转和幂等已读。
- `web/e2e/app-shell.spec.mjs` 覆盖直接进入 `/web/app/messages`、`/web` owner 路由登出、消息中心语义跳转和项目切换。

**剩余边界：**

- `/web/messages/{id}/open` 仍作为旧页面兼容层保留，不能视为新客户端契约。
- `api/static/app.js` 继续支撑未迁移 Askama 页面和旧 Electron 通知桥；W2 不删除该逻辑。
- 当前新壳已经开始承载 W3 的项目列表、工作项列表和只读详情，但写入闭环仍归 W3 后续切片。

**目标：** 在浏览器中迁移跨页面基础体验，验证新 Web 的认证恢复、路由、加载/错误状态和通知语义，不要求 Electron 同步接入。

**涉及文件：**

- 新增/修改：`web/src/**`
- 修改：`api/src/web/api/mod.rs`、`api/src/web/router.rs`、`api/src/web/user/mod.rs`、`api/templates/web/login.html`（仅按 W1 契约）
- 修改：`docs/openapi/yuance.openapi.json`
- 测试：Browser E2E、认证/通知 API 测试、SSR 登录/回跳流程测试、JSDoc/checkJs 检查

**实施方式：**

- 初期保留 SSR 登录页；登录成功后进入新的 Web 应用壳，新应用经 REST 会话检查恢复用户和 CSRF 状态。实现受服务端解析的同源 `return_to` path + query：受保护 SSR/SPA/旧通知入口、登录 GET、失败重渲染和成功响应都保留该目标；片段只通过一次性 Browser state 恢复，非法 scheme、`//host`、控制字符和跨源地址一律拒绝。
- 迁移登出、全局导航、项目上下文、加载/错误/未认证处理、顶部状态和消息中心。
- 通知点击由新 Web router 解析语义目标并调用幂等已读 API，不再访问 HTML 跳转路由。
- Browser adapter 只承担站内消息中心和浏览器文件能力，不提供 Electron 系统通知或本机文件路径能力。
- `api/static/app.js` 继续支撑旧 Askama 页面，W2 不删除旧 Electron bridge 逻辑。
- 新应用壳按服务端 rollout 决策保持会话粘滞；路由切换更新页面标题、主焦点和可访问的加载/错误状态，并上报脱敏的认证、路由和渲染失败指标。

**验收：**

- Browser E2E 覆盖登录衔接、会话刷新、登出、导航、通知列表、语义跳转和幂等已读。
- 对已迁移路由覆盖直接打开新旧 URL、路径/查询/锚点保留、未认证登录回跳、刷新、前进/后退和紧急回退后的 URL 兼容；SSR owner、SPA owner、旧通知、错误登录重试与非法 `return_to` 均不能丢失合法目标或产生开放重定向。
- 旧 Askama 登录页、消息中心和 `/web/messages/{id}/open` 兼容路径仍可用。
- W2 不需要改动 Electron，也不把浏览器 Cookie transport 或 `window.Notification` 暴露成未来 Desktop 的默认实现。
- 自动与人工无障碍验收覆盖键盘导航、路由焦点恢复、表单错误关联和消息中心 live region；rollout 扩大或回退按 W0 量化阈值执行。

### W3：浏览器端高频 Feature 逐步迁移

**当前状态：** `active`（首个工作项协作读写闭环已完成，后续继续迁移其他高频 feature）

**已落地：**

- 项目列表：`web/src/app.jsx` 已显示项目列表、分页信息、状态筛选和当前项目切换。
- 工作项列表：已覆盖需求/任务/Bug 列表、筛选和打开详情路径。
- 工作项详情：已覆盖只读基础字段、父项链接、编辑核心字段、推进并指派、普通评论新增/编辑、工作项附件与评论附件列表/下载/上传和旧版详情回退入口。

**下一推荐切片：** W4 共享 JavaScript 层提炼评估，或继续以独立 W3 子计划迁移资料库 / 项目详情 / 文档预览。工作项协作闭环已可支撑 W4 评估，但富文本回复、正文内附件节点、预览、高级上传与旧版详情下线仍需后续专项补齐。

**目标：** 以小且可回退的浏览器切片逐步迁移高频工作流，建立可作为 Desktop 功能基线的 Web feature。

**涉及文件：**

- 新增/修改：`web/src/features/**`、`web/src/**`
- 修改：`api/src/web/api/mod.rs`、`api/src/web/router.rs`（仅补齐当前 feature）
- 修改：`docs/openapi/yuance.openapi.json`
- 测试：对应 `api/tests/*_flow.rs`、Browser E2E、Web 单元/组件测试、JSDoc/checkJs 检查

**实施方式：**

- 建议迁移顺序：项目与当前项目上下文，工作项列表/详情，评论与附件，资料库与文档预览；低频系统管理页面不进入首批范围。
- 每个 feature 先补齐 REST/SSE/附件契约、服务端权限测试和浏览器测试，再切换新入口；每次只切换一个可独立验收的行为集合。
- 文档预览改用 API client、受控下载和前端资源路径，不依赖服务端模板、HTML partial 或旧 `/web/*/preview` 展示路由。
- 每个 feature 的 UI 将渲染与 use case 分开：组件通过 props/回调呈现，feature controller/use case 通过 `app-core` 调用 API 和平台契约；不得在 JSX 中混入直接 `fetch`、SSE 或宿主判断。
- 旧 Askama feature 直到权限、错误、分页、附件、实时刷新和回退窗口均通过后才下线。
- 为列表、附件和文档预览记录 route-level lazy loading、分页/虚拟化、上传并发/取消、资源体积和性能预算；运行期采集长任务、预览失败和 SSE 重连，超过阈值暂停 rollout 或回退。

**验收：**

- 每个已切换 feature 都有 API 契约、服务端集成测试、Browser E2E、新旧入口回退策略和下线条件。
- Browser E2E 对每个接管 canonical 路由的 feature 覆盖书签直达、路径参数、查询/锚点、未认证回跳、刷新、前进/后退、旧通知与页面内链接；回退后 URL 保持不变或按 W0 转换表转换。
- 该 feature 的 Web 验收记录可直接作为 D2 功能对齐矩阵的基准。
- 权限、审计、状态约束和通知创建仍只由 `api/src/domains/**` 决定；不引入客户端业务权限裁决、HTML 解析依赖或 Electron 特有代码。
- Browser E2E 与自动 axe 扫描、键盘/焦点人工路径、bundle diff 和代表性网络/设备性能预算共同通过；同一 rollout 的错误率、关键任务完成率和支持信号满足 W0 放量条件。

### W4：从已验证 Web Feature 提炼共享 JavaScript 层

**当前状态：** `active`（子计划/RFC 已创建，尚未实施）

**启动门槛：** 不以“应用壳 + 只读列表/详情”启动共享包抽取。工作项协作闭环已经通过 Browser E2E 覆盖编辑、handoff、评论和附件上传/下载，可作为 W4 的首个评估输入。`docs/plans/2026-07-31-001-refactor-w4-shared-javascript-layer-plan.md` 已作为 W4 子计划/RFC，明确抽取边界、包依赖图、保留在 Browser 宿主内的 Cookie/CSRF transport、以及不纳入本轮的富文本/预览/离线能力。正式创建 `frontend/packages/*` 前仍需先按该子计划完成 Unit 1 的边界冻结。

**目标：** 在至少一个完整业务 feature 已经通过 Browser E2E 和真实发布路径验证后，提取稳定共享 JavaScript/JSDoc 代码，为 Desktop 使用同一套 UI 与逻辑做准备。

**涉及文件：**

- 新增：`frontend/package.json`、`frontend/packages/api-client/{package.json,jsconfig.json,src/**}`、`frontend/packages/app-core/{package.json,jsconfig.json,src/**}`、`frontend/packages/ui/{package.json,jsconfig.json,src/**}`、`frontend/packages/platform-contract/{package.json,jsconfig.json,src/**}`、共享包 JSDoc/checkJs 配置、包级测试和边界检查配置
- 修改：`web/src/main.jsx`、`web/src/**`、根 workspace 配置（将 `check:frontend` 扩展为 Web + 共享包）
- 测试：共享 package 单元测试、JSDoc/checkJs、lint、Web 回归测试

**实施方式：**

- 仅移动已被 Web 证明稳定的 REST/SSE client、状态/use case、组件/样式和平台能力接口；保留 Web 宿主中的 Cookie transport、浏览器历史和资源交付配置。
- `ui` 只导出组件和样式，不向 `api-client`、`platform-contract` 或宿主 bridge 发请求；`app-core` 只面向 API 与平台 JSDoc 契约，不能导入 Electron 或浏览器全局桥。
- 建立 `mountApp({ api, platform, router })`，以 JSDoc 明确所有注入参数；本单元不创建 Electron renderer，也不以 Electron 需求改变已验证 Web 行为。
- `platform-contract` 定义通知、文件、外链、生命周期和路由能力；Browser 和 Desktop 各自实现，禁止共享 package 通过 `window.yuanceDesktop`、UA 或环境变量分支决定行为。
- 对共享目录增加静态规则，禁止 `electron`、Node.js、`ipcRenderer`、`window.yuanceDesktop`、原始本地路径和任意网络/文件系统访问。
- 固定 workspace 的唯一根 lockfile 与依赖升级责任；依赖图只能是 `platform-contract` 无内部依赖、`api-client` 无 UI/平台依赖、`ui` 只依赖 React/样式、`app-core` 仅依赖 `api-client` 与 `platform-contract`、宿主位于最外层。各包通过 `exports` 白名单暴露 API，禁止 deep import 和循环依赖；`react`/`react-dom` 使用一致 peer dependency，并在 Browser/Desktop bundle 中验证单例解析。

**验收：**

- Web 行为、API 契约和 Browser E2E 在提取前后保持一致。
- 至少一个完整业务 feature 通过共享包运行，而不是只有空应用壳。
- 共享包可独立构建，`npm --prefix frontend run check` 与 W4 范围的根 `npm run check:frontend` 都通过 JSDoc/checkJs、lint 和测试，且不含宿主特有依赖或 `.ts` / `.tsx` 源文件。
- 共享 UI 与 feature 能被新的 Browser composition root 使用，无需读取 Askama HTML 或 Web 全局 bridge。
- CI 验证 workspace 唯一 lockfile、依赖 DAG、循环依赖、`exports` 白名单、禁止 deep import 和 React/React DOM 单例；构建产物体积与无障碍组件测试不超过 W0 预算。

### D1：Electron 安全宿主、设备认证与内置 Renderer

**目标：** 建立正式 Electron 包的安全运行底座：`app://` 内置 JavaScript renderer、独立设备认证、最小 preload/IPC、凭证库和不可回退的 Electron 安全不变量。D1 只验证可安全挂载共享应用壳，不承担全量业务页面对齐。

**涉及文件：**

- 新增：`desktop/src/renderer/main.jsx`、`desktop/src/renderer/jsconfig.json`、`desktop/src/renderer/platform/**`（认证、生命周期和最小路由 adapter）、`desktop/src/credentials/**`、`desktop/src/network/**`、打包态生命周期/发行验证测试
- 修改：`desktop/src/main.mjs`、`desktop/src/preload.cjs`、`desktop/src/config.mjs`、`desktop/package.json`（将 `check` 拆为 `check:main` 与 `check:renderer` 后再聚合，并显式管理单实例、凭证和网络状态）
- 修改：`desktop/electron-builder.yml`、`desktop/package.json`、构建脚本和 GitHub Actions（将根 `check:frontend` 扩展为 Web + 共享包 + Desktop renderer，并增加签名、制品哈希、provenance/SBOM 和平台发布 Gate）
- 修改：`api/src/web/router.rs`、`api/src/web/api/mod.rs`、认证模块、OpenAPI/事件契约（仅按 D1 已确认的 device-session、版本协商和 Desktop SSE 模型）
- 修改：`docs/runbooks/desktop-release-publication.md`、相关发布/支持文档（记录发行、安装/卸载、诊断隐私、版本兼容和人工更新边界）
- 测试：`desktop/test/**`、打包安装包 smoke/E2E、认证/API 契约测试、JSDoc/checkJs、manifest、签名/制品完整性、网络与生命周期测试

**实施方式：**

- 在代码改动前完成 device-session RFC。首期使用系统浏览器设备授权流：Desktop 仅显示验证地址/短期用户代码并轮询批准结果，renderer 不接触密码；RFC 定义设备注册、批准、`state`/nonce、用户/设备绑定、scope、超时、取消、账户切换、设备丢失、服务端时间、冷启动/重启恢复和所有用户可见错误。RFC 还必须给出 browser-session、PAT、device-access、device-refresh 的 issuer/audience、允许 endpoint/scope、CSRF/Cookie、Cookie+Bearer 优先级和审计 actor/device-session 字段；明确选择 sender-constrained proof-of-possession，或由责任人接受 bearer refresh 的泄漏威胁模型和最大暴露窗口。D1 不注册 `yuance://` 或通用外部深链接；未来若引入，必须另行定义 OS 激活、单实例交接、认证前暂存和语义路由 schema。
- 认证状态由主进程的单一 credential manager 管理：access token 仅驻留内存并有最大生命周期，refresh 使用单飞锁和 refresh family 代际。发送 refresh 前，credential manager 必须在同一个 OS 凭证库记录中原子持久化 `{current_refresh, family, generation, pending_transaction_id}`；每次 rotation 使用高熵幂等 transaction ID。服务端以 `device_session + transaction_id` 唯一约束、family/generation CAS 和单一数据库事务持久化旧代失效、新代、审计与可恢复终态；不同 ID 使用旧代触发重放处置，同一 ID 仅在绑定旧 refresh 或等价设备证明后于受限窗口返回同一终态。若终态含新凭证，只能保存独立密钥保护的最小密文，并在窗口届满擦除。服务端已提交但本地写入失败、崩溃、响应丢失或旧响应迟到时，启动恢复只能读取该 pending 记录并按 transaction ID 查询/完成提交；只有新凭证与新代际原子写入成功后才清除 pending。无法读取或验证该记录时直接重新设备授权，不能盲目发起第二次 refresh。登出、endpoint 切换或用户切换先停止请求/SSE、清除内存和本地凭证，再通知 renderer；renderer 永不获得 refresh token 或通用授权头。
- 正式包注册安全 `app://` 协议，限制资源根、路径遍历、CSP、导航、重定向、窗口打开、权限请求和协议可访问路径；不使用不受控 `file://`。保持并测试 `contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`、`webSecurity: true`、`webviewTag: false`，默认拒绝权限。
- Browser Cookie transport 不能复用到 `app://`。Desktop REST/SSE 使用受控的 Bearer transport：SSE 为附带短期 header 的 fetch-stream，禁止 URL token；network service 只从已验证的官方签名 profile 或管理员签名 enrollment bundle 构造 canonical HTTPS endpoint 与固定路径，renderer 不能传递 URL，所有 REST/SSE 请求设置 `redirect: "error"` 且不跟随 `Location`/不携带 Cookie。profile/bundle 必须绑定 server instance、允许 API/SSE/storage origin、信任锚、有效期和轮换；私有化根密钥只能经 MDM/企业配置、预置可信根或带外人工指纹确认获得，bundle 不得自证其根。生产包禁止环境变量、网页、renderer 或 CLI 静默切换 endpoint。`connect-src` 只允许已确认 endpoint。仅使用系统代理/PAC 和 OS/企业受控信任库；禁止 `certificate-error` bypass，私有 CA、代理认证、TLS 过期/SAN 不匹配和 endpoint 变更均有明确拒绝/重新认证流程，并在每次重连重验 endpoint、TLS 和 device session。
- 明确单实例、窗口关闭与应用退出、休眠/唤醒、renderer/主进程崩溃、连续启动失败和系统凭证库不可用的状态机。平台 × 架构 × 凭证库/通知/文件对话框/托盘/外链支持矩阵必须标出支持、降级或不支持；安装、升级、卸载、彻底清理和重装时的 `userData`、凭证、缓存、日志和设备撤销语义逐平台验证。
- SSE connection 同时绑定 device/user/authorization version 与 access 到期上限。设备撤销、登出、用户禁用、角色/成员资格变更或授权 epoch 推进后，服务端必须在配置化的 `revocation_close_deadline` 内主动关闭已建立的流；超过 deadline 强制关闭，客户端只有完成 refresh/重新授权后才可建立新流。
- D1 只完成文件 capability 与 `StorageTransferGrant` RFC/主进程安全底座，D2 才接入业务 feature：主进程必须保有选中 regular file 的不可替换 identity，签发及打开前拒绝 symlink/reparse point、目录/FIFO 和文件替换；transfer grant 仅从认证 API 响应创建，固定 storage origin/path/method/允许 headers/字节数/digest/TTL/一次性消费，且不携带 device Authorization/Cookie 或跟随重定向。
- 显式将 renderer 输出和哈希 manifest 打入安装包；保留开发态与正式态 `userData`、session、Cookie、缓存和 macOS Dock 图标隔离。D1 的生产发行 Gate 要求 macOS Developer ID + notarization/stapling、Windows Authenticode 时间戳、Linux 制品签名与 SHA-256、受限 CI 密钥、构建 provenance/SBOM、依赖补丁 SLA 和下载页校验信息。每个制品还必须进入版本化、签名的 release manifest，记录平台/架构、SHA-256、字节数、验签/公证结果、发布者指纹、commit、workflow attestation 与 SBOM digest；GitHub 下载、OSS 上传后和公开下载入口均复核同一 manifest，任一缺项或不一致阻止发布。Gate 前先完成证书/公证凭证所有权、受保护 GitHub Environment、最小权限 publish job、固定到审核 commit 的第三方 actions、签名服务或 secret 注入、轮换/撤销演练和每平台签名失败阻止 `publish` 的 preflight。发布器只能访问精确 HTTPS control-plane origin、拒绝重定向，不得把高权限 system token 发往其他地址；生产环境拒绝任意本地资产目录、非 allowlist 仓库或 tag/SHA/provenance 不一致的制品。人工下载同样支持 `withdrawn/revoked`：新下载请求立即拒绝，D1 发行 RFC 在发布配置/runbook 中固定 `max_presigned_url_ttl`、`withdrawal_exposure_slo` 的数值、起算点、时钟来源与下载路径，并由发布服务拒绝未配置或超限 URL；若要求即时失效，必须经对象/边缘 deny 或受控下载网关实现，不得仅依赖控制面状态。撤回、残余窗口、审计和不可被普通 retention 清理的已验签 N-1 回退集均可追溯。未通过 Gate 的现有 ad-hoc/未签名制品只能标为开发或预览，不能作为长期设备凭证的生产分发渠道。
- D1 不实现自动更新；继续使用经校验的人工下载和升级路径。自动更新、渠道、强制安全升级和回退只在 D2 后的 `G-DIST` 进入。
- 诊断采用字段 allowlist 与脱敏：明确用户同意/企业禁用、崩溃报告 endpoint、source map 访问、日志轮转/容量/保留期和支持包预览。token、授权头、签名 URL、本地路径、文件名和项目内容不得写入日志、crash dump、遥测或支持包。D1 的人工分发与 G-DIST 共享按 release/platform/architecture/channel 聚合的 release-health 事件、告警阈值、观察期、负责人、暂停/撤回 runbook 和审计；注入启动崩溃、认证失败、hash 失败或撤回事件时，必须能在定义时限内关联发行并完成受控处置。
- preload 只暴露 schema 校验后的最小 API；共享 feature 不读取全局 bridge，只有 Desktop adapter 可通过受控注入访问该能力。

**验收：**

- macOS、Windows、Linux 打包产物均包含 renderer，断网时能启动本地 Shell；不把这项验收表述为离线业务数据可用。
- 打包态覆盖设备授权的开始、批准、取消、超时、账户切换、重启恢复、credential matrix 的 PAT/device/Cookie 拒绝与混合凭证优先级、refresh 单飞/发送前 pending transaction ID 原子持久化/带 transaction ID 的 rotation、服务端 CAS/同 ID 幂等/不同 ID 重放、服务端已轮换后的凭证库写入失败/进程强杀/响应丢失/旧响应迟到恢复、已认证会话探针、受限 endpoint 的 fetch-stream SSE 建立/轮换/断开/拒绝及 `revocation_close_deadline` 内撤销后主动关闭路径、登出、CSP、SPA 深链接、导航/重定向拦截、内部路由和 renderer manifest；业务 feature 的读写与业务 SSE 行为只在 D2 对齐 E2E 中验收。
- 负向测试覆盖错误服务器 endpoint、篡改 profile/enrollment bundle/server instance/DNS、HTTP 降级、跨/同 origin 重定向、代理 `Location`、endpoint 切换期间重连、TLS 过期/SAN 不匹配/私有 CA/代理认证、refresh 重放、设备撤销/用户禁用/权限变化后的 REST/SSE 拒绝与活跃流关闭、用户切换、登出清理、系统凭证库不可用、第二实例、休眠/唤醒、renderer/主进程崩溃、伪造 IPC payload、非顶层或非 `app://` sender、路径穿越、未许可导航、`window.open` 和权限请求；renderer 不得获得长期凭证。文件测试另覆盖选取后替换、symlink/reparse point、目录/FIFO、字节数/digest 变化、错误 storage host/path/header 和 302，且不泄漏路径或 token。
- 三平台安装、升级、普通卸载、彻底清理、重装和共享 OS 用户切换的用户数据/凭证/设备撤销语义通过支持矩阵验收；六个生产制品的 OS 原生验签/公证、release manifest、GitHub/OSS/公网入口 hash、provenance/SBOM、平台签名/公证与依赖补丁状态均可追溯。发布器 HTTP/重定向/错误 origin、同名同大小对象替换、缺失 manifest/provenance、未受保护 publish environment、撤回/恢复、既有预签名 URL 的 `max_presigned_url_ttl`/`withdrawal_exposure_slo` 配置与暴露 SLO 内拒绝或明确到期，以及 N-1 下载选择均应失败或得到受控结果。
- 注入 token、授权头、签名 URL、路径、文件名和项目名后，日志、支持包和崩溃上报均不泄漏；诊断关闭或企业禁用时有受支持的最小行为。
- Desktop 不加载生产 `/web` 页面，不信任远端页面决定的 IPC sender，也不因为开发 server/DevTools 扩大正式包的 CSP、导航或 IPC 权限。

### D2：Desktop 功能对齐与系统集成

**目标：** 以 W3/W4 已验证的 Web feature 为基线，使用同一共享 UI、`app-core` 和 API 契约完成在线 Desktop 功能对齐；把文件和原生通知等额外系统行为落实在 Desktop adapter、preload 和主进程，而不是浏览器层或业务组件中。

**涉及文件：**

- 新增/修改：`desktop/src/renderer/platform/**`、Desktop feature composition、主进程受控文件/通知服务
- 修改：`desktop/src/main.mjs`、`desktop/src/preload.cjs`、`desktop/src/renderer/main.jsx`
- 修改：`frontend/packages/api-client/**`、`frontend/packages/app-core/**`、`frontend/packages/ui/**`、`frontend/packages/platform-contract/**`
- 修改：`api/src/web/api/mod.rs`、相关 domain/OpenAPI（仅当 Web 已定义的契约缺口阻塞对齐）
- 新增：Desktop/Web feature 对齐矩阵与配套 E2E、系统 integration 测试

**实施方式：**

- 为每个 Desktop feature 维护对齐矩阵：Web feature/路由、共享 UI/feature 模块、读写 API、权限与错误状态、SSE 行为、附件/预览、Desktop adapter 调用、允许的宿主差异、Browser E2E、Desktop E2E、回退与发布条件。只有通过 W3 的 feature 才能进入矩阵。
- Desktop renderer 复用共享 UI 和 `app-core`；不能为 Desktop 复制业务页面、在 JSX 内写 Electron 条件分支，或绕过 API client 调用 HTML 路由。允许差异限于文件系统、原生通知、窗口/托盘、外链和受控下载/预览入口。
- 完成消息中心和原生通知链路：共享逻辑发出通知呈现意图，Desktop adapter 按前台状态和用户偏好调用 preload，主进程投递系统通知并在点击后发送语义路由；不使用浏览器 `Notification` API 替代 Electron 系统通知，且接收 SSE 时不得自动标已读。
- 完成文件选择、上传、下载、保存和定位链路：Desktop adapter 只接触 `DesktopFileCapability`，主进程负责系统对话框、capability 生命周期和受控流式传输；renderer 不看到路径，主进程不成为任意 HTTP 或文件系统代理。上传/下载对象存储流仅使用 D1 已定义的 `StorageTransferGrant`，不得接受 renderer URL/header 或携带 device Authorization/Cookie。
- 外链、预览、托盘和窗口行为均通过显式 platform contract；URL allowlist、路由 schema、文件大小/MIME/哈希限制和用户归属在 renderer、主进程和服务端按各自职责重复校验。
- 每次只完成一个可独立验收的 feature 对齐单元；Desktop 不阻塞 Web 后续 feature 的浏览器发布，但未对齐 feature 不得宣称桌面可用。
- 对齐矩阵增加平台/架构支持、网络与凭证库降级、窗口/托盘生命周期、最大并发上传/下载、取消/背压、预览尺寸/页数、SSE 去抖/退避、内存/CPU/磁盘/日志预算和隐藏窗口节流列；任何支持差异必须可见、可测且不能改变共享业务规则。

**验收：**

- 对齐矩阵中的每个 feature 以同一服务端测试数据运行 Browser E2E 与打包态 Desktop E2E，验证核心读写、权限、错误、分页、SSE 刷新、语义路由和回退行为一致；允许差异必须明确列在矩阵中。
- 创建回复、提及或指派后，后台/最小化 Desktop 收到一次且仅一次原生系统通知；点击后恢复并聚焦窗口、进入正确内部路由，并通过幂等 REST 标已读。前台窗口、重复 SSE、目标已失效和通知权限拒绝均有预期行为。
- 文件上传验证系统选文件、超限/错误提示、取消、进度、上传确认和权限失败；伪造/过期/跨用户 capability、任意路径、任意 URL、重定向、MIME/大小/哈希不匹配均被拒绝，日志和 renderer 不泄漏路径或签名 URL。
- 下载/保存/定位仅对当前用户授权的服务器对象和主进程受控文件有效；用户切换、登出、窗口销毁或 TTL 到期后 capability 全部失效。
- Browser 与 Desktop 复用同一共享 feature/API 契约；Desktop 不加载远端 `/web` 页面，Browser 不包含 Electron bridge 或系统文件/通知实现。
- 在低配置设备、大附件、长时间后台、频繁断网、休眠恢复和系统能力不可用场景下，打包态 E2E 仍满足矩阵中的资源预算、降级提示、键盘/焦点和站内等价通知要求。

### G-DIST：Desktop 发行与更新（D2 后独立 Gate）

**目标：** 在 D2 的在线功能对齐和 D1 的生产制品信任链均通过后，选择性提供受控自动更新；它不改变 D1-D4 的功能阶段，也不阻塞 D3/D4 的数据路线。

**涉及文件：**

- 修改：`desktop/electron-builder.yml`、Desktop 构建/发布脚本、GitHub Actions、`scripts/publish-desktop-release.mjs`、系统版本/发布接口和 `docs/runbooks/desktop-release-publication.md`
- 新增：更新 manifest、渠道配置、升级/回退 E2E 与发布暂停/最低版本控制测试

**实施方式：**

- 首先明确每个平台的更新支持矩阵；不支持可靠自动更新的制品保持人工下载，不能伪装为统一 updater。选定更新框架、可信更新 origin、签名 metadata、稳定/beta 渠道、灰度、暂停开关、下载校验、安装时机、用户延后和强制安全升级规则。
- 更新源只接受已签名且哈希校验通过的 metadata/制品；更新信任根、metadata 签名覆盖的渠道/版本/平台/大小/哈希/过期时间、密钥轮换/撤销和 rollback protection 必须在 RFC 中固定。渠道、最低支持版本、紧急禁用版本和服务端 capability 一致。更新必须复用 D1 的 release manifest、`withdrawn/revoked` 控制面、N-1 保留和 release-health 事件，但不得复用业务 API token、Desktop refresh token 或公开 OSS URL 作为认证/信任依据。
- 定义 N 到 N-1 升级、失败回退、损坏下载、磁盘不足、离线、用户延后、服务端降级与本地 `userData`/凭证/cache schema 的兼容 manifest：每个客户端声明可读 schema 范围、是否允许自动回退和最低升级路径。不可逆 migration 禁止 updater 降级；允许降级时缓存只能安全失效并重同步，不承诺保留不可兼容的派生缓存。D3 数据库迁移的前向/降级限制必须被 updater 尊重。

**验收：**

- 每个支持平台的 stable/beta 渠道、签名/哈希、下载、安装、取消、暂停、失败回退和紧急最低版本策略经打包态 E2E 验证；release-health 告警、观察期、暂停/撤回 runbook 能按 release/platform/architecture/channel 关联事故，且遵守同一隐私 allowlist。
- 从上一稳定版本升级到当前版本、服务端回滚到兼容版本以及用户延后升级均不丢失或越权读取凭证、服务器事实数据和用户配置；不可兼容派生缓存必须按 schema compatibility manifest 安全失效并重同步，不支持的 Linux/架构路径明确回退为人工升级。

### D3：可选离线只读缓存

**目标：** 让 Desktop 离线读取当前用户已授权且已同步的数据，不实现离线写入。

**涉及文件：**

- 新增：`desktop/src/agent/` 或独立 Rust sidecar（按技术决策）、本地 schema migration/checkpoint/attachment staging 模块
- 修改：`frontend/packages/app-core/`、`frontend/packages/api-client/`
- 修改：`api/src/web/api/mod.rs`、`docs/openapi/yuance.openapi.json`（按选择的全量或增量同步补齐授权、批次和附件内容版本契约）
- 测试：SQLite schema 迁移、强杀恢复、缓存加密、网络切换、离线授权、权限撤销、用户/endpoint 切换和附件缓存测试

**实施方式：**

- 按 `(canonical endpoint, server instance, user, device)` 隔离 SQLite、附件缓存、密钥、配额、日志和清理策略；renderer 不直接访问数据库或文件系统，endpoint 切换不得复用凭证、缓存或设备批准记录。D3 前选择数据库层或字段层加密，覆盖主库、WAL/SHM、临时目录、索引、staging、诊断包和备份；每个隔离 tuple 的版本化 DEK 使用 OS 凭证库/受支持硬件能力包装，轮换、登出、撤权、卸载和清理失败均有锁定/销毁顺序。
- 本地 agent 在启动时以单一 schema version 执行事务性 forward migration；迁移完成后才推进版本。迁移失败、磁盘满、密钥变化或降级客户端时停止读取不可信缓存并保留受限诊断标记，按 schema compatibility manifest 的范围安全重建/全量重同步，不能部分读取。
- 先确定“授权范围全量刷新”或“快照 + 稳定游标”同步基线；无论选择哪种路线，服务端都必须在一致读边界签发版本化 `snapshot_id`、`snapshot_sequence`、authorization epoch、scope manifest 和绑定 continuation，实体、删除和附件状态均有不可变 `entity_type/entity_id/entity_revision/tombstone` envelope。仅在选择增量时，后续 delta 才按全局 `change_sequence` 推进，并定义保留期、`cursor_expired` 后丢弃投影并重新快照；全量路线在每轮刷新中仍必须保持同一 snapshot fence。领域写入、删除和授权变更在同一服务端事务追加 change record。全量刷新仅写入 scope 的 staging generation；只有完整验证同一 `snapshot_id`、sequence、scope manifest、continuation 和 epoch 后，才以单一事务切换唯一 active completed generation，读取端只能选择该 active generation。`snapshot_expired`、continuation 失效、epoch 改变、分页或附件失败时丢弃 staging；只可继续读取租约仍有效的旧 active generation，否则锁定 scope，绝不混合新旧批次。增量路线的每个远端批次在同一数据库事务中写入实体投影、墓碑、授权元数据和完整应用 checkpoint；只有 commit 后才推进 cursor。附件采用 `pending -> verified -> available` 状态机：同一文件系统内完成 staging、长度/版本化 `sha-256:<base64url>` 明文 digest 校验、原子 rename 与文件/目录持久化后，才在事务中标为 `available` 并推进相关 checkpoint。启动时对账数据库、文件名、digest、generation、授权版本，清理/重拉不匹配或未提交 staging，不能显示为可读。
- 离线内容只能由服务端签发、绑定 `(canonical endpoint, server instance, user, device, authorization version)` 的短期可验证访问租约解锁；authorization version 由 user-global、project-scope 和 device-session revoke epoch 组成，成员、角色、权限、用户状态和设备撤销与 epoch、tombstone、审计/change record 在同一服务端事务推进。租约、snapshot、delta 和 outbox 均携带受影响 epoch；epoch 不匹配时 agent 先锁定 scope、清理附件/解密材料，再全量重同步。租约记录签发/到期、最大离线时长和最高已见服务端时间/单调时间证据。墙钟回拨、凭证库丢失、租约无法验证、用户禁用或租约到期即锁定内容；撤权未送达的最大暴露窗口不得超过租约上限。
- 受保护资料首期必须明确排除正文和附件的离线缓存，或另行定义 `resource_unlock_epoch`、短期解锁租约和独立 AEAD 密钥；口令及其派生材料不得持久化，密码设置/重置/清除、资料归档或租约失效时原子删除相关密钥与密文。
- 附件清单包含稳定 ID、版本化 `sha-256:<base64url>` 明文 `content_digest`、内容版本、字节数、MIME、生命周期状态和授权元数据版本；缓存键包含服务器/用户、附件 ID、内容版本和 digest。加密缓存使用 AEAD，读取时先验证 AEAD 再验证明文 digest；签名下载 URL 绝不持久化。
- `api-client` 通过 repository 接口读取缓存与远端数据，并向 renderer 提供版本化 `OfflineStatus`：scope/generation/最后成功服务端时间、网络/租约/密钥/缓存可读范围、队列/依赖、下一重试和安全错误。租约锁定、重建、配额逐出或永久拒绝时必须明确数据是否保留与可执行动作。

**验收：**

- 离线仅显示当前用户、当前服务器、当前可验证授权租约范围内已同步的数据；租约到期、墙钟回拨、凭证库丢失或无法确认新鲜授权时锁定内容，不以旧缓存伪装为“仍有权限”，撤权未送达的最大暴露窗口不超过租约上限。授权撤销发生在 snapshot 分页、附件下载或 operation 重试期间时，受影响 scope 也必须停止读取/写入并受控重建；全量刷新期间的读取只来自 active completed generation，snapshot/continuation/epoch/附件失败不会暴露 staging 或混合 generation。
- schema 升级、迁移中断、磁盘满、密钥轮换、批次任一写入点强杀、staging 附件损坏和重启后均按 schema compatibility manifest、数据库/文件对账和最近原子 checkpoint 恢复，不读取半迁移、半应用或非 `available` 附件；未解锁介质上的数据库、WAL/SHM、临时目录、诊断包和支持包均不得含业务正文、附件明文或密钥。
- 用户/endpoint 切换、登出、权限撤销、缓存配额超限和网络切换不会泄漏旧用户数据；附件仅在 AEAD、明文 `sha-256:<base64url>` digest、版本和授权均匹配后可读，未缓存、损坏或不匹配附件不会伪装为可离线访问。`OfflineStatus` 在休眠、强杀、撤权、磁盘满、迁移失败和附件部分失败后保留真实 generation、锁定/队列/重建状态与重试、清除、重新登录或重同步动作。

### D4：可选离线写入与双向同步

**目标：** 在明确冲突策略后实现评论、编辑、状态变更和附件的 outbox 同步。

**涉及文件：**

- 修改：`desktop/src/agent/**`
- 修改：`frontend/packages/app-core/**`
- 修改：`api/src/domains/**`、`api/src/web/api/**`、OpenAPI（新增同步契约）
- 测试：多设备、断网重试、冲突、附件断点续传和幂等性测试

**实施方式：**

- 每个本地操作生成不可变 operation ID、基线版本和依赖顺序；每次提交或重试都严格按 `认证/设备撤销检查 -> 当前 resource authorization 与 authorization epoch 的策略受限查询 -> 仅在授权成功后查询并重新投影同一 (actor_user_id, device_session_id, operation_id) 的最小 effect receipt` 执行。无权限路径不得读取、反序列化或返回历史 receipt、冲突 payload、资源存在性或附件引用。fingerprint 使用规范化、版本化序列化，仅包含协议版本、操作类型、目标、基线版本、规范化 payload 和依赖，明确排除认证头、actor、device session、当前权限/角色和其他可变服务端状态。相同 key/fingerprint 仅保证业务副作用不重复；当前仍有读取权限时才返回重新投影的终态/冲突数据，无权限时返回受控 `403`/`404`/`410`。仅同 key 但 fingerprint 不同才返回 `409 idempotency_key_reused`，不改变领域状态并写受限安全审计；首次请求在同一事务持久化最小 effect receipt、fingerprint、领域变更、终态分类和一条审计事件。
- 评论采用追加合并；标题、状态、成员关系等冲突由实体规则或用户确认处理。D4 前为每个 operation type 固定 `base_revision`、可自动合并条件、不可合并的 `409 conflict` schema（server/base/local 三方值、当前 revision、可合并字段和禁止原因）、用户动作（丢弃、重新应用、显式覆盖）及其新的 operation ID/fingerprint。服务端使用 revision CAS 或等效事务语义写入新 revision/change record；成员关系、状态流转等权限敏感操作默认不得静默覆盖。客户端发生时间只作为审计信息，权限、actor、服务端受理时间和最终冲突判断只以服务端事实为准。
- 附件使用内容哈希、内容版本和独立队列，不将二进制塞进普通业务 outbox；定义 `reserved -> uploading -> server_verified -> attached|cancelled|rejected|expired` 两阶段状态、每步独立幂等键、稳定 reservation/attachment ID、预期字节数/digest/过期时间和业务 operation 依赖。只有 `server_verified` 附件可满足依赖；确认响应丢失、续传、部分失败、取消、撤权和超时都具有服务端对象 GC 与本地密文清理终态。
- `api-client`/agent 向 renderer 提供逐操作 `SyncOperationStatus`：队列、依赖、重试时间、永久拒绝、冲突、安全错误与重试、取消、丢弃、查看冲突、重新登录或重同步动作。同步 API 以服务端事实和权限判定为准；现有页码分页和“刷新”型 SSE 不能充当增量同步协议。

**验收：**

- 网络超时后重试、重复提交、服务端响应丢失、撤权/角色变更后的同 key 相同 fingerprint 重试、同 key 不同 fingerprint、冲突、永久拒绝和审计写入失败不会重复创建业务记录/通知/审计。当前仍有读取权限时客户端可恢复重新投影的终态或受控 `409`；撤权后只确认无副作用且不泄露原始终态、冲突三方值或附件引用。多端同字段/不同字段、删除后编辑、状态流转、授权变化和 response 丢失均展示可验证的 server/base/local 或受控拒绝；重新应用/显式覆盖使用新的 operation ID。
- 冲突、权限撤销、部分附件失败、多端并发、跨版本客户端和强杀恢复均有可恢复行为；审计可关联可信 device session、operation ID、客户端发生时间和服务端受理时间。上传成功但确认响应丢失、依赖 operation 强杀、续传中撤权和附件 GC 后均不会让未验证附件被引用或把待发操作误报为已同步。

## 依赖关系与退出条件

```text
W0 -> W1 -> W2 -> W3 (按 feature 多次迭代) -> W4 -> D1 -> D2 -> D3 -> D4
                                                               \
                                                                -> G-DIST（D2 后独立的发行/自动更新 Gate）
```

- W0 直接阻塞 W1，并通过 W1 传递约束后续 W2-W4；Desktop 与离线决定不阻塞浏览器迁移。
- W1 的已定义契约是 W2 和每个 W3 feature 的前置条件；W3 的 Browser E2E 是该 feature 进入 D2 对齐矩阵的前置条件。
- W2 提供认证衔接、路由、错误和消息基线；W3 按 feature 独立发布、回退和下线。
- W4 依赖至少一个完整业务 feature 的浏览器验收，不能以空壳或静态原型作为抽取依据。
- D1 依赖 W4、全部 Desktop 安全门槛、credential/refresh/SSE/enrollment/file-transfer RFC 和人工生产发行 Gate；在 D1 之前不改动 Electron 的业务实现。
- D2 依赖 D1 与每个目标 feature 的 W3/W4 验收；D2 是在线 Desktop 功能可用的阶段，不是离线缓存阶段。
- `G-DIST` 依赖 D1 生产制品信任链与 D2 在线对齐，但不阻塞 D3/D4；未完成时只支持受控人工升级，不得暗示自动更新已经可用。
- D3 依赖 D2 与离线只读决策、snapshot/change sequence/authorization epoch、schema/checkpoint/数据保护/受保护资料/附件 Gate；D4 依赖 D3、operation conflict/attachment-operation RFC、同步协议、服务端幂等审计契约和单独批准。

## 范围边界

- 不在 W1-W3 同时迁移所有服务端系统管理页面；优先高频工作流和 Desktop 未来必需页面。
- 不在浏览器迁移期把 Web 与 API 改成跨源生产部署，除非先完成相应认证和安全验证。
- 不让新 Web 或共享代码解析 Askama HTML、依赖 HTML partial 或调用 `/web/*` 作为业务 API。
- 不因共享前端重构而删除现有 API 的服务端审计、权限、CSRF 和认证约束。
- 不在未确定设备凭证、`app://`、CSP、Electron 安全不变量、IPC 信任模型和文件 capability 前开始 D1/D2。
- 不在未通过 Browser E2E 的 feature 上另起 Desktop 业务实现；Desktop 仅复用已验证 feature，并把系统差异限制在 adapter。
- 不让 Browser 层伪装、模拟或直接承担 Desktop 原生通知、主机文件路径、任意文件系统访问或任意 HTTP 代理。
- 不在未确定缓存范围、snapshot/change sequence、authorization epoch、schema/checkpoint、离线数据保护/受保护资料范围、附件版本、冲突/attachment operation 和审计契约前承诺 D3/D4 离线能力。
- 不把 D1 的打包资源、ad-hoc/未签名制品、`app://` 或手工下载误称为生产发行信任链或自动更新；自动更新只在 `G-DIST` Gate 后启用。
- D1 不支持未定义的自定义协议、通用外部深链接、TLS 错误绕过或 renderer 侧凭证/代理降级；相关能力必须有独立 RFC 与打包态负向测试。

## 移动端 / APK 分发边界

APK 与 OSS 下载问题不属于本 Web/Desktop 共享前端主线的实施范围。相关排查口径与产品边界已迁出到 `docs/solutions/2026-07-30-apk-oss-download-boundary.md`。

本主线仅保留两条约束：

- D1/D2 的 Desktop 发行与下载信任链继续以桌面制品、release manifest、签名/哈希和撤回控制面为核心，不因 APK 能上传到 OSS 而扩展为移动端公开分发。
- 若后续要面向普通用户公开 Android/iOS 下载，需要单独创建移动端下载页或统一下载页计划，并明确“已发布资产公开可下载”的授权模型。

## 验证矩阵

- W0：迁移清单、JavaScript/JSDoc 基线、`checkJs` 配置、浏览器资源交付设计、route-to-contract parity、`return_to`/片段恢复、Browser CSRF transport、动态响应缓存、单/多副本实时拓扑、rollout/观测/性能/无障碍 Gate、锁定 Browser E2E runner 与旧页面回退路径审阅。
- W1：JavaScript/JSDoc 静态检查、lint、Web 构建、同源资源交付 smoke test、真实 Router 的 OpenAPI/事件 schema parity 与 breaking-change diff、N/N-1 契约套件、认证/CSRF/SSE/签名授权/动态 HTML/重定向缓存头与代理集成测试、脱敏指标与告警验证，以及 PR/push 的 headless Browser/生产同款镜像门禁与失败制品。
- W2-W3：Browser E2E 覆盖登录衔接、会话刷新、SSR/SPA/旧通知的合法 `return_to` 与片段恢复、非法跳转拒绝、导航、通知、权限、分页、错误、附件、预览、实时刷新、feature 回退、服务端 rollout 粘滞、axe/键盘/焦点路径、bundle/性能预算及 JSDoc 边界。
- W4：共享 package 单元测试、JSDoc/checkJs、依赖 DAG/循环/deep import/`exports`/React 单例边界检查，以及抽取前后的浏览器回归对比。
- D1：`npm --prefix desktop test`、根 `npm run check:frontend`、`npm --prefix desktop run check`、打包安装包的 device credential matrix、PoP/bearer 风险决策、服务端 refresh family/CAS/transaction recovery、受信 enrollment/profile、`revocation_close_deadline` 内的活跃 SSE 撤销、`StorageTransferGrant`/文件 identity、fetch-stream SSE、HTTP 降级与 redirect 拒绝、代理/TLS/生命周期/导航/IPC/CSP/深链接拒绝测试、Electron 安全不变量、renderer manifest、诊断脱敏、平台支持矩阵、release manifest、GitHub/OSS/公网 hash/provenance、人工撤回/既有预签名 URL 暴露 SLO/N-1 和生产制品签名验证。
- D2：同一服务端 fixture 下的 Browser/Desktop 功能对齐 E2E、系统通知端到端验收、文件 capability/上传/下载/保存/定位测试、伪造 IPC/capability/路径/URL 的负向测试，以及大附件、后台、断网、休眠、低配置设备的资源/降级/无障碍验证。
- G-DIST：支持平台的 stable/beta 渠道、D1 release manifest/撤回/N-1/release-health 控制面、签名 metadata/信任根/密钥轮换与撤销/rollback protection、升级/取消/暂停/回退/最低版本/schema compatibility manifest、用户数据兼容与不支持平台人工升级 E2E。
- D3-D4：一致 snapshot/staging-to-active generation/cursor 过期、authorization epoch、SQLite/WAL/临时介质/备份数据保护、受保护资料范围、schema 迁移、强杀 checkpoint 恢复、`pending -> verified -> available` 附件状态机与数据库/文件对账、版本化 digest/AEAD、离线授权租约/墙钟回拨、`OfflineStatus`/`SyncOperationStatus`、用户/endpoint 切换、断网恢复、撤权/角色变更后的同 key 无副作用且无历史响应泄漏、同 key 不同 fingerprint `409`、operation conflict matrix、attachment-operation 依赖/确认丢失/GC、同步幂等/审计原子性和附件队列测试。
- 移动端/APK OSS 验收：不作为本主线阶段门槛；相关排查口径见 `docs/solutions/2026-07-30-apk-oss-download-boundary.md`。
- 每个提交前执行与变更范围匹配的聚焦测试、`git diff --check`，并在阶段完成时对照本计划复核。

## 风险

- **同源交付被误解为未分离。** 首期同源只保留浏览器会话边界；`web/` 的代码、构建、测试和 REST 契约已独立。过早跨源会同时扩大 CORS、Cookie、CSRF 和 SSE 风险。
- **JSDoc 边界被放松。** JavaScript 不等于无契约；若不强制 `checkJs`、导出类型和 IPC schema，跨包 API 会在 Web/Desktop 复用时漂移。
- **API 契约覆盖不足。** 若 W1 未把 feature 交互、附件和通知语义补进契约，新 Web 会重新依赖 HTML 或出现隐式行为漂移。
- **共享层提取过早。** 若在 W3 验证前建立完整共享包，Electron 假设会反向固化 Web 设计，后续仍需拆除宿主耦合。
- **Web/Desktop 功能漂移。** 若 D2 不以 W3 Browser E2E 和对齐矩阵为准，Desktop 容易形成第二套业务页面或遗漏错误、权限和实时状态。
- **文件 capability 被弱化为路径传递。** 原始路径、泛化 IPC、任意 URL 上传或未绑定的 capability 会把主进程变成文件/网络代理并造成跨用户泄漏。
- **系统通知重复或越权。** SSE 重连、前台状态和通知点击若未按通知 ID 去重与受限路由处理，会重复投递、错误标已读或打开任意地址。
- **桌面认证与信任边界不同。** `app://` 不能默认复用浏览器 `SameSite=Lax` Cookie；D1 未收口设备凭证、endpoint、CSP、Electron 安全不变量、导航和 IPC sender 前不得开始桌面接入。
- **离线 Shell 被误认为离线数据。** 打包 renderer 只保证无网络启动；D3 前必须明确缓存范围、密钥管理、用户隔离、撤权清理和一致性语义。
- **离线写入不是缓存的自然延伸。** 缺少稳定游标/快照、墓碑、基线版本、幂等 operation ID、冲突策略和附件独立队列时不得开始 D4。
- **移动端分发议题污染主线。** APK/OSS 可下载性、Android 安装限制和移动端公开入口属于系统版本分发或移动端专项，不应混入 Web-first / Desktop renderer 阶段门槛；本计划只保留链接和边界约束。
- **契约或发行回滚不兼容。** 服务端 DTO/事件、已安装 Desktop、renderer revision、签名制品和 updater channel 若没有 N/N-1/最低版本规则，单独回滚任一方都会让用户无法认证或写入；发布 Gate 必须先验证兼容矩阵。
- **设备认证与网络降级。** 若把系统浏览器授权、refresh rotation、Desktop SSE、代理/TLS 或单实例逻辑留给各 renderer 自由实现，会造成凭证泄漏、重放、登录循环或以证书错误绕过恢复连接。
- **诊断和灰度泄漏。** 没有字段 allowlist、服务端粘滞 rollout、量化回退阈值和支持流程，既无法定位迁移事故，也可能把 token、路径或项目内容发送到日志/遥测。
- **本地数据升级与断网状态不一致。** 没有 schema migration、原子 checkpoint、离线授权新鲜度、附件版本和 operation 审计原子性时，升级、强杀或重试会读到错误数据、重复执行业务操作或留下不可解释审计。
