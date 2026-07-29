---
title: feat: Web 与 Electron 桌面端共享前端及离线演进
status: active
date: 2026-07-28
updated: 2026-07-29
origin: docs/brainstorms/2026-07-28-web-desktop-shared-frontend-architecture.md
---

# feat: Web 与 Electron 桌面端共享前端及离线演进

## 概述

将当前由 `api/` 同时提供 Rust 领域逻辑、Askama 页面、静态脚本和 REST API 的形态，按 **Web-first** 顺序渐进演进：先把浏览器前端做成独立的 `web/` 模块，并逐 feature 迁移浏览器工作流；在至少一个完整业务 feature 经浏览器验证后，再提炼稳定的共享前端层；最后由 Electron 使用该共享层构建内置 renderer，并接入桌面专属能力和可选离线数据能力。

“前后端分离”在首期指代码、构建和接口契约分离，不等于立即把浏览器前端部署到不同 origin。首批 `web/` 构建产物应继续与 `api/` 同源交付，或由同源反向代理交付，以保留现有浏览器 Cookie、CSRF 和 SSE 行为。跨源 Web 部署、`app://` 桌面认证和离线同步均属于后续独立门槛，不能阻塞浏览器端迁移。

本计划不把“内置前端资源”误称为“离线业务数据”。桌面端的本地 Shell、已同步数据只读缓存和离线写入/双向同步是三个独立阶段，分别验收。

## 当前基线

- `api/` 同时承担 Rust 领域规则、REST API、Askama 页面、`api/static/app.js`、`api/static/app.css` 和 `/web/*` 路由。
- `desktop/src/main.mjs` 通过 `BrowserWindow.loadURL(webConfig.url)` 加载远端 Web 页面；`preload.cjs` 当前只暴露受限的原生通知桥。
- `api/static/app.js` 仍含 `window.yuanceDesktop` 探测、同源相对请求、SSE 和 Electron 通知逻辑，不能直接复制为独立 renderer。
- `api/src/domains` 是服务端权限、审计、业务规则和通知事实的唯一来源；前端不得复制这些规则。
- `/api/v1` 已覆盖部分业务能力，但 `docs/openapi/yuance.openapi.json` 尚未覆盖所有 `/web/*` 交互、附件、SSE、通知语义和系统管理能力。
- 当前浏览器会话使用 `HttpOnly; SameSite=Lax` session、refresh 和 CSRF Cookie；非 Bearer 写请求依赖 CSRF 校验，API 没有通用跨源 CORS 层。

## 需求追踪

- R1：新增独立 `web/` 前端模块，先在浏览器中逐 feature 取代 Askama 页面实现。
- R2：`api/` 收敛为 Rust 业务后端、REST/SSE、认证、文件和过渡期 Web 资源宿主，不再长期承担唯一的 HTML 页面实现。
- R3：浏览器迁移期保持同源资源交付和旧页面兼容，不因前端分离提前改变 Cookie、CSRF 或 SSE 信任模型。
- R4：每个已迁移 Web feature 只能通过稳定 REST/SSE 契约工作，不解析 HTML、读取模板注入数据或拼接 `/web/*` 业务 URL。
- R5：在经浏览器验证的 feature 基础上提炼 `api-client`、`app-core`、`ui` 和 `platform-contract`；不以未验证的 Electron 需求预设共享抽象。
- R6：浏览器与 Electron 最终复用共享 feature/UI/API 源码，但保留各自独立的 composition root、路由历史、认证 transport 和平台适配器。
- R7：桌面正式安装包加载受限 `app://` 内置 renderer，不依赖生产远端 `/web` URL。
- R8：共享前端不直接依赖 Electron、Node.js、`ipcRenderer` 或 `window.yuanceDesktop`；桌面能力只经受限 adapter 暴露。
- R9：通知目标、已读状态和访问校验以 REST/事件契约表达，不以 `/web/*` 展示 URL 作为跨宿主业务契约。
- R10：离线能力分为内置 Shell、已同步数据只读缓存和可选离线写入同步三个阶段。

## 交付原则

- **先逻辑分离，后部署分离。** `web/` 可以独立开发、构建和测试，但首期生产资源保持 API 同源交付；只有明确重做 CORS、Cookie、CSRF 和 SSE 后才允许独立 origin 部署。
- **先浏览器验证，再共享提炼。** 在一个完整业务 feature 通过浏览器回归前，不创建完整的 `frontend/packages/**` 空壳，也不要求 Electron 同步实现。
- **按 feature 切换和回退。** 新旧入口并存；每个 feature 都要有旧路由、切换条件、回退路径和旧实现下线条件，禁止一次性重写所有 Askama 页面。
- **业务规则只在服务端。** `api/src/domains` 保持权限、审计、状态约束和通知事实的唯一来源；客户端仅负责展示、输入校验、缓存和同步编排。
- **桌面与离线单独设门。** 浏览器迁移不等待 `app://`、设备凭证、SQLite、附件缓存或冲突策略；但 Desktop 开始前必须完成相应安全设计和打包验证。

## 目标职责与构建方向

```text
api/
  src/domains/                 # 业务规则、权限、审计、通知事实
  src/web/api/                 # REST、认证、SSE、后续同步接口
  src/web/                     # 过渡期 Askama 路由与资源交付

web/
  src/                         # 浏览器 composition root、feature、Browser adapter
  package.json                 # 独立开发、构建、类型检查和浏览器测试

frontend/
  packages/
    api-client/                # 从稳定 Web 请求层提取的 REST/SSE client
    app-core/                  # 从稳定 Web feature 提取的 use case、状态和路由协议
    ui/                        # 从稳定 Web feature 提取的无宿主 UI
    platform-contract/         # Browser/Desktop 都可实现的平台能力接口

desktop/
  src/main.mjs                 # Electron 主进程、窗口、协议、生命周期
  src/preload.cjs              # 最小受信任 IPC surface
  src/renderer/main.ts         # Desktop composition root，仅在 D1 创建
  src/agent/                   # 仅在离线阶段批准后创建
```

`web/` 是首个实现宿主，不是 Electron renderer 的副本。W1-W3 中的代码可以先留在 `web/src/**`；W4 只提取已经在浏览器生产路径中被证明可复用的部分。提取完成后，两个宿主通过薄入口组装同一共享能力：

```ts
mountApp({ api, platform, router });
```

- `web/src/main.ts` 注入 Browser API transport、Browser platform adapter 和浏览器路由。
- `desktop/src/renderer/main.ts` 在 D1 才创建，注入 Desktop API transport、Desktop platform adapter 和桌面路由。
- 宿主入口可以不同；共享 feature、组件、样式和契约必须来自同一份前端包。
- Electron Builder 必须显式复制桌面 renderer 输出，不能依赖开发机存在的 `web/dist`。

## 浏览器交付与兼容策略

- 当前正式环境只部署 `yuance-api` 容器。W0 的默认交付方式是：前端构建阶段生成 `web/dist`，在 `api/Dockerfile` 的多阶段构建中复制到最终 `yuance-api` 镜像的版本化静态目录，由 API 在同源 `/web/app/*` 提供；首期不新增 Caddy 静态站点、独立前端容器或跨源生产拓扑。
- API 静态服务只为新 Web SPA 路径提供 `index.html` 回退；缺失的哈希资源必须返回 `404`，不得回退成 HTML。入口 HTML 和 manifest 使用短缓存或 `no-store`，内容哈希资产使用长缓存和 `immutable`；同一个镜像必须包含匹配的入口、manifest 和全部资产，构建缺失任一产物即失败。
- 开发环境可使用受控 dev server/proxy，前提是 Cookie、CSRF、SSE、重定向和错误响应有集成测试；正式发布必须在与生产相同的 API 镜像中验证 SPA 入口、MIME、深链接、版本和缓存策略。
- 新 Web 应用先使用隔离的迁移入口，例如 `/web/app/*`；旧 `/web/*` Askama 页面继续可用。迁移清单必须为每个 feature 声明 canonical URL 的当前所有者、切换条件、紧急回退行为和最终接管方式，不能只写“后续决定”。
- 已迁移 feature 接管 canonical URL 时，直接打开旧书签或新 URL 都必须保留路径参数、查询参数和锚点。未认证回跳、浏览器刷新、前进/后退、旧通知和页面内链接必须按同一转换表工作；片段在服务端不可见时，由客户端在跳转前保留并恢复，`return_to` 仍只允许同源白名单路径。
- 首批可保留现有 SSR 登录页：登录成功后进入新 Web 应用壳；新应用通过明确的 REST 会话检查和 CSRF 获取契约恢复会话。登录 UI 的完全迁移属于 W2 的后续切片，而不是 W1 的阻塞条件。
- `api/static/app.js`、模板和 `/web/*` 只在对应 feature 切换、浏览器回归和回退窗口结束后删除或收缩；不得因新 Web 构建成功就全量删除。
- 文档预览、PDF.js、OOXML vendor 和附件下载必须先脱离模板内联路径与 HTML partial 假设，再作为 Web feature 迁移；不能直接复制 `api/static/` 作为新应用产物。

## 契约与平台边界

### REST、事件与通知契约

- 每个进入新 Web 的用户操作必须有 JSON REST、错误模型、分页和需要时的 SSE 契约，并纳入 OpenAPI 或配套事件契约。
- 通知 DTO 不再以 `/web/messages/{id}/open` 等 HTML URL 表示业务跳转，而应包含通知 ID 与语义目标，例如工作项键和可选评论 ID。
- 新增经权限校验的通知目标读取与幂等已读 REST 操作；旧 HTML 跳转可在迁移期保留为兼容层。
- Web 与后续 Desktop 共享内部路由映射和服务端通知 ID 去重键。显示通知不自动标已读，用户点击后才调用幂等已读操作。
- SSE 当前只能表达“刷新”信号，不能被当作离线同步协议；断线、Lagged 和重连的行为必须由 Web client 明确处理。

### 桌面平台边界

- `app-core` 只表达“有新通知且应提示”等业务意图，不决定 Electron 通知、浏览器通知或站内 toast。
- 文件打开/定位必须使用主进程或 desktop agent 签发的 `LocalFileHandle`，不得让 renderer 传递任意本地路径。
- Electron 主进程按 IPC 来源、句柄 TTL、当前用户、文件归属、允许根目录、URL allowlist 和参数长度再次校验。
- 共享代码不能通过运行时检测 `window.yuanceDesktop` 选择行为；平台差异由宿主入口显式注入。
- 现有 `desktopBridge()`、`notifyDesktopForNewItems()` 和 `initDesktopNativeNotifications()` 只服务旧 Askama 页面；在 D1 由 Desktop adapter 取代。

## 决策门槛

决策按阶段拆分。未收口的决定只阻塞其对应阶段，不应阻塞浏览器端 `web/` 的基础迁移。

### W0 前必须确认的浏览器门槛

| 决策 | 要求 | 对计划的影响 |
|---|---|---|
| 前端技术栈 | 选择 TypeScript/构建工具、路由、组件和测试基线；建议采用 TypeScript + Vite + React，最终以 W0 决策记录为准。 | 决定 `web/` 的目录、构建、测试和依赖管理。 |
| 浏览器资源交付 | 首期明确采用同源交付，或在选择跨源时先完成 CORS/Cookie/CSRF/SSE 集成验证。 | 决定开发代理、生产静态资源、SPA 回退和会话行为。 |
| 首批迁移范围 | 确认新 Web 应用壳、消息中心和首个完整业务 feature；定义旧入口、回退和下线条件。 | 防止大爆炸式重写。 |
| REST 契约基线 | 确认 OpenAPI/事件契约的维护方式、错误模型、CSRF 获取和未认证跳转行为。 | 决定 W1-W3 的 API 改动与测试。 |

### D1 前必须确认的桌面门槛

| 决策 | 要求 | 对计划的影响 |
|---|---|---|
| 桌面认证 | 形成独立 device-session 协议和 OpenAPI/RFC：设备与用户绑定、受限 scope、短期 access token、refresh rotation 与重放检测、撤销/登出、设备丢失处置、服务端时间与失败状态；现有 PAT 明确不得作为桌面登录凭证。 | 决定 API transport、凭证存储、刷新、登出、CORS、CSRF、SSE 和负向测试。 |
| 服务端配置 | 确认第一期仅支持官方服务端，或设计私有化/多服务器登记、TLS/私有 CA 和 endpoint allowlist。 | 禁止由任意远端页面 URL 决定 IPC 信任。 |
| 本地 renderer 安全 | 固定 `app://` origin、CSP、资源 manifest、深链接、导航/重定向、`window.open`、权限和 IPC sender 规则。 | 决定主进程、preload、打包和安装包测试。 |
| 通知产品语义 | 明确投递类别、前台/最小化判定、设备偏好、显示与已读时机、目标缺失回退和退出后是否承诺通知。 | 决定 Desktop adapter 与服务端通知契约。 |

推荐：Desktop 使用按设备可撤销的短生命周期凭证，刷新凭证仅存操作系统凭证库，renderer 不持有长期凭证；应用存活且窗口非前台时才展示原生通知，点击后才标已读，应用退出后不承诺 SSE 通知。

### D2/D3 前必须确认的离线门槛

| 决策 | 选项 | 对计划的影响 |
|---|---|---|
| 离线范围 | 内置 Shell / 已同步数据只读 / 完整离线写入 | 决定是否进入 D2、D3，以及是否需要 outbox 与冲突 UI。 |
| 缓存同步 | 授权范围全量刷新 / 快照与稳定游标增量 | 决定初始同步、删除墓碑、权限撤销、重连和恢复语义。 |
| 缓存数据与附件 | 数据集、附件下载策略、配额、加密、用户切换和登出清理 | 决定本地数据库、文件缓存和测试范围。 |
| 冲突与附件同步 | 操作幂等、基线版本、实体冲突规则、内容哈希与续传 | D3 的前置条件，未确认时不得开始离线写入。 |

推荐将“已同步数据只读缓存”作为 D2 的单独产品 Gate；离线写入仅在同步协议、冲突策略和附件策略确定后进入 D3。

## 实施单元

### W0：Web-first 边界、发布与回退基线

**目标：** 在不改动 Desktop 行为的前提下，确定浏览器端独立 `web/` 模块的交付方式、首批范围、兼容策略和可验证退出条件。

**涉及文件：**

- 修改：`docs/plans/2026-07-28-feat-web-desktop-shared-frontend-plan.md`，在 W0 中记录已确认的工具链、同源交付和首批迁移决策
- 后续检查/修改：`api/src/web/router.rs`、`api/templates/**`、`api/static/**`、`docs/openapi/yuance.openapi.json`

**实施方式：**

- 建立 `/web/*` 页面、HTML partial、静态资源、表单写操作、REST、SSE、附件预览与旧路由的迁移清单。
- 为每个首批 feature 记录：新入口、旧入口、canonical URL 当前所有者、路径参数、查询参数、锚点、未认证 `return_to`、页面内链接、旧通知、刷新/前进/后退行为、所需 REST/SSE、鉴权/CSRF 行为、浏览器验收、回退开关和旧实现下线条件。
- 固定首期唯一生产链路：前端构建阶段 -> `web/dist` -> `api/Dockerfile` 多阶段构建 -> 最终 `yuance-api` 镜像静态目录 -> API 同源 `/web/app/*` 服务；同时明确入口/manifest/哈希资源的缓存头、SPA 回退边界、构建失败语义和镜像回滚行为。
- 确认 `web/` 工具链、开发代理、生产同源资源交付、SPA 回退、版本/构建标识和浏览器测试基线。
- 明确 W0 不创建 Desktop renderer、不修改 Electron 认证、不引入 SQLite、缓存或同步。

**验收：**

- 迁移清单覆盖首批浏览器路径，并能追溯到具体 API 契约、canonical URL、参数/锚点转换和旧页面回退路径。
- W0 决策记录说明同源 Cookie、CSRF、SSE、未认证跳转、静态资源交付、缓存头、镜像构建和回滚的验证方式。
- 后续 W1-W3 可以在不变更 `desktop/` 的情况下实施。

### W1：独立 Web 构建与首批 REST/SSE 契约

**目标：** 建立独立浏览器前端的构建和同源交付通路，并只为首批 Web 切片补齐可消费的 API 契约。

**涉及文件：**

- 新增：`web/package.json`、`web/src/main.ts`、`web/src/**`
- 修改：根 `package.json` / workspace 配置（按 W0 工具链决策）
- 修改：`api/Dockerfile`、`scripts/build-api-image-amd64.sh`、`Makefile`、部署/CI 配置（将 Web 构建和版本标识纳入 API 镜像构建）
- 修改：`api/src/web/router.rs`、`api/src/platform/config.rs`、`api/Cargo.toml`（提供受控 SPA 资源服务、深链接回退和配置；以实际实现为准）
- 修改：`api/src/web/api/mod.rs`
- 修改：`api/src/domains/notifications.rs`（仅通知语义目标和已读能力）
- 修改：`docs/openapi/yuance.openapi.json`、`docs/runbooks/production-deployment.md`
- 测试：`api/tests/*_flow.rs`、Web 构建/契约测试、生产同款镜像 smoke test

**实施方式：**

- 让 `web/` 独立开发、构建、类型检查和测试；通过 `api/Dockerfile` 的前端构建阶段将 `web/dist` 复制进最终 API 镜像，再由 API 同源提供，不新增独立生产服务。
- 为 `/web/app/*` 定义受控的静态资源服务：导航请求才回退到 SPA 入口，哈希资源、manifest 与资源 MIME 必须精确返回；入口 HTML/manifest 短缓存，哈希资源长期 `immutable` 缓存。
- 建立隔离的 SPA 迁移入口和资源路径；旧 Askama `/web/*` 继续工作，不改变其默认行为。
- 将首批新 Web 所需的会话检查、CSRF 获取、读写、登出、错误模型和 SSE 重连明确为 REST/事件契约。
- 为通知新增语义目标读取与幂等单条/批量已读操作；保留旧 `/web/messages/{id}/open` 仅供旧页面兼容。
- 新 Web 不读取 HTML meta、HTML partial 或 `/web/*` 展示 URL 作为业务契约。

**验收：**

- 新 Web 入口仅通过已定义 REST/SSE 完成会话检查、读取、写入、登出和实时刷新。
- API 测试覆盖成功、未认证、无权限、CSRF 拒绝、分页和统一错误响应。
- 在正式同款 API 镜像中验证 `/web/app/*` 入口、带路径参数的深链接、资源 MIME、入口/哈希资源缓存头、构建版本和 manifest；缺失前端构建物或 manifest 时镜像构建必须失败，不能发布半套产物。
- OpenAPI/事件契约覆盖已迁移交互；浏览器不会因 HTML 模板细节变化而失效。

### W2：仅浏览器的应用壳、认证衔接与消息中心

**目标：** 在浏览器中迁移跨页面基础体验，验证新 Web 的认证恢复、路由、加载/错误状态和通知语义，不要求 Electron 同步接入。

**涉及文件：**

- Create/Modify: `web/src/**`
- 修改：`api/src/web/api/mod.rs`、`api/src/web/router.rs`（仅按 W1 契约）
- 修改：`docs/openapi/yuance.openapi.json`
- 测试：Browser E2E、认证/通知 API 测试

**实施方式：**

- 初期可保留 SSR 登录页；登录成功后进入新的 Web 应用壳，新应用经 REST 会话检查恢复用户和 CSRF 状态。
- 迁移登出、全局导航、项目上下文、加载/错误/未认证处理、顶部状态和消息中心。
- 通知点击由新 Web router 解析语义目标并调用幂等已读 API，不再访问 HTML 跳转路由。
- `api/static/app.js` 继续支撑旧 Askama 页面，W2 不删除旧 Electron bridge 逻辑。

**验收：**

- Browser E2E 覆盖登录衔接、会话刷新、登出、导航、通知列表、语义跳转和幂等已读。
- 对已迁移路由覆盖直接打开新旧 URL、路径/查询/锚点保留、未认证登录回跳、刷新、前进/后退和紧急回退后的 URL 兼容。
- 旧 Askama 登录页、消息中心和 `/web/messages/{id}/open` 兼容路径仍可用。
- W2 不需要改动 Electron，也不把浏览器 Cookie transport 暴露成未来 Desktop 的默认实现。

### W3：浏览器端高频业务 Feature 逐步迁移

**目标：** 以小且可回退的浏览器切片逐步迁移高频工作流，建立经真实使用验证的 Web 代码基础。

**涉及文件：**

- Create/Modify: `web/src/features/**`、`web/src/**`
- 修改：`api/src/web/api/mod.rs`、`api/src/web/router.rs`（仅补齐当前 feature）
- 修改：`docs/openapi/yuance.openapi.json`
- 测试：对应 `api/tests/*_flow.rs`、Browser E2E、Web 单元/组件测试

**实施方式：**

- 建议迁移顺序：项目与当前项目上下文，工作项列表/详情，评论与附件，资料库与文档预览；低频系统管理页面不进入首批范围。
- 每个 feature 先补齐 REST/SSE/附件契约、服务端权限测试和浏览器测试，再切换新入口；每次只切换一个可独立验收的行为集合。
- 文档预览改用 API client、受控下载和前端资源路径，不依赖服务端模板、HTML partial 或旧 `/web/*/preview` 展示路由。
- 旧 Askama feature 直到权限、错误、分页、附件、实时刷新和回退窗口均通过后才下线。

**验收：**

- 每个已切换 feature 都有 API 契约、服务端集成测试、浏览器 E2E、新旧入口回退策略和下线条件。
- Browser E2E 对每个接管 canonical 路由的 feature 覆盖书签直达、路径参数、查询/锚点、未认证回跳、刷新、前进/后退、旧通知与页面内链接；回退后 URL 保持不变或按 W0 转换表转换。
- 权限、审计、状态约束和通知创建仍只由 `api/src/domains/**` 决定。
- 不引入客户端业务权限裁决、HTML 解析依赖或 Electron 特有代码。

### W4：从已验证的 Web Feature 提炼共享前端层

**目标：** 在至少一个完整业务 feature 已经浏览器回归和真实发布路径验证后，提取稳定共享代码，为 Desktop 接入做准备。

**涉及文件：**

- 新增：`frontend/packages/api-client/`
- 新增：`frontend/packages/app-core/`
- 新增：`frontend/packages/ui/`
- 新增：`frontend/packages/platform-contract/`
- 修改：`web/src/main.ts`、`web/src/**`、根 workspace 配置
- 测试：package 单元测试、类型检查、Web 回归测试

**实施方式：**

- 仅移动已被 Web 证明稳定的 REST/SSE client、状态/use case、组件/样式和平台能力接口；保留 Web 宿主中的 Cookie transport、浏览器历史和资源交付配置。
- 建立 `mountApp({ api, platform, router })`，但本单元不创建 Electron renderer，也不以 Electron 需求改变已验证 Web 行为。
- `platform-contract` 只表达通知、外链、文件和生命周期等抽象能力；Browser adapter 可以是 no-op 或站内体验，不能泄漏 Node 能力。
- 对共享目录增加静态规则，禁止 `electron`、Node.js、`ipcRenderer`、`window.yuanceDesktop`、原始本地路径和任意网络/文件系统访问。

**验收：**

- Web 行为、API 契约和 Browser E2E 在提取前后保持一致。
- 至少一个完整业务 feature 通过共享包运行，而不是只有空应用壳。
- 共享包可独立构建、类型检查和测试，且不含宿主特有依赖。

### D1：Electron 本地 Renderer、认证与最小特权适配器

**目标：** 在共享层稳定后，让正式 Electron 包以受限 `app://` 加载内置 renderer，并以明确的设备安全模型接入同一 REST/SSE 契约。

**涉及文件：**

- 新增：`desktop/src/renderer/main.ts`、Desktop platform adapter
- 修改：`desktop/src/main.mjs`、`desktop/src/preload.cjs`、`desktop/src/config.mjs`
- 修改：`desktop/electron-builder.yml`、`desktop/package.json`、构建脚本和 GitHub Actions
- 修改：`api/src/web/router.rs`、`api/src/web/api/mod.rs`、认证模块（仅按 D1 已确认模型）
- 测试：`desktop/test/**`、打包安装包 smoke/E2E、认证 API 测试

**实施方式：**

- 在开始代码改动前完成 D1 桌面门槛决策和设备会话协议：固定本地 renderer origin、远端 API endpoint、设备注册/批准、用户/设备绑定、scope、短期 access token、refresh rotation 与重放检测、撤销、登出、设备丢失处置、系统凭证库、服务端时间、SSE 和 IPC sender 校验；PAT 不得作为替代方案。
- 正式包注册安全的 `app://` 协议，限制资源根、路径遍历、CSP、导航、重定向、窗口打开、权限请求和协议可访问路径；不使用不受控 `file://`。
- Browser Cookie transport 不能默认复用到 `app://`。Desktop 采用已确认的独立 transport；renderer 不获得长期凭证，主进程/受限协议代理不得成为任意 URL 或任意请求的代理。
- 显式将 renderer 输出和哈希 manifest 打入安装包；保留开发态与正式态 `userData`、session、Cookie、缓存和 macOS Dock 图标隔离。
- Desktop adapter 只通过受限 preload 请求通知、外链、文件选择/保存、`LocalFileHandle` 定位、托盘和更新能力；通知点击仅传递受限内部路由或通知 ID。

**验收：**

- macOS、Windows、Linux 打包产物均包含 renderer，断网时能启动本地 Shell；不把这项验收表述为离线业务数据可用。
- 打包态覆盖登录、刷新、读写、SSE、登出、CSP、SPA 深链接、导航/重定向拦截、IPC 拒绝路径和通知点击。
- 设备会话负向测试覆盖错误服务器 endpoint、refresh 重放、设备撤销后的 REST/SSE 拒绝、用户切换、登出清理和系统凭证库不可用时的安全失败；renderer 不得获得长期凭证。
- 浏览器与 Desktop 使用同一共享 feature/API 契约，Desktop 不加载生产 `/web` 页面，也不信任由远端页面配置决定的 IPC sender。

### D2：可选离线只读缓存

**目标：** 让 Desktop 离线读取当前用户已经授权且已同步的数据，不实现离线写入。

**涉及文件：**

- 新增：`desktop/src/agent/` 或独立 Rust sidecar（按技术决策）
- 修改：`frontend/packages/app-core/`、`frontend/packages/api-client/`
- 修改：`api/src/web/api/mod.rs`、`docs/openapi/yuance.openapi.json`（仅当选择增量同步）
- 测试：SQLite、缓存加密、网络切换、权限撤销、用户切换和附件缓存测试

**实施方式：**

- 按当前用户隔离 SQLite、附件缓存、密钥、配额和清理策略；renderer 不直接访问数据库或文件系统。
- 先确定“授权范围全量刷新”或“快照 + 稳定游标”同步基线；后一种必须具备水位、墓碑、权限撤销、初始同步和重连语义。
- `api-client` 通过 repository 接口读取缓存与远端数据，明确陈旧状态、网络状态和未缓存内容的展示。

**验收：**

- 离线仅显示当前用户已同步、仍有权限的数据。
- 用户切换、登出、权限撤销、缓存配额超限和网络切换不会泄漏旧用户数据。
- 附件缓存遵守权限、配额和清理规则，未缓存附件不会伪装为可离线访问。

### D3：可选离线写入与双向同步

**目标：** 在明确冲突策略后实现评论、编辑、状态变更和附件的 outbox 同步。

**涉及文件：**

- 修改：`desktop/src/agent/**`
- 修改：`frontend/packages/app-core/**`
- 修改：`api/src/domains/**`、`api/src/web/api/**`、OpenAPI（新增同步契约）
- 测试：多设备、断网重试、冲突、附件断点续传和幂等性测试

**实施方式：**

- 每个本地操作生成不可变 operation ID、基线版本和依赖顺序。
- 评论采用追加合并；标题、状态、成员关系等冲突由实体规则或用户确认处理。
- 附件使用内容哈希和独立队列，不将二进制塞进普通业务 outbox。
- 同步 API 以服务端事实和权限判定为准；现有页码分页和“刷新”型 SSE 不能充当增量同步协议。

**验收：**

- 重试不会重复创建业务记录或重复弹出通知。
- 冲突、权限撤销、部分附件失败和多端并发均有可恢复行为。

## 依赖关系与退出条件

```text
W0 -> W1 -> W2 -> W3 (按 feature 多次迭代) -> W4 -> D1 -> D2 -> D3
```

- W0 直接阻塞 W1，并通过 W1 传递约束后续 W2-W4；Desktop 与离线决定不阻塞浏览器迁移。
- W1 的已定义契约是 W2 和每个 W3 feature 的前置条件。
- W2 提供认证衔接、路由、错误和消息基线；W3 按 feature 独立发布、回退和下线。
- W4 依赖至少一个完整业务 feature 的浏览器验收，不能以空壳或静态原型作为抽取依据。
- D1 依赖 W4 和所有桌面安全门槛；在 D1 之前不改动 Electron 的业务实现。
- D2 依赖 D1 与离线只读决策；D3 依赖 D2、同步协议和单独批准。

## 范围边界

- 不在 W1-W3 同时迁移所有服务端系统管理页面；优先高频工作流和桌面未来必需页面。
- 不在浏览器迁移期把 Web 与 API 改成跨源生产部署，除非先完成相应认证和安全验证。
- 不让新 Web 或共享代码解析 Askama HTML、依赖 HTML partial 或调用 `/web/*` 作为业务 API。
- 不因共享前端重构而删除现有 API 的服务端审计、权限、CSRF 和认证约束。
- 不在未确定设备凭证、`app://`、CSP 和 IPC 信任模型前开始 D1。
- 不在未确定缓存范围、同步基线和冲突策略前承诺 D2/D3 的离线能力。

## APK 与 OSS 分发结论

### 当前事实

- 在签名身份具备对象读取权限、Bucket Policy 与 OSS 配置允许访问的前提下，阿里云 OSS 可通过签名 GET URL 下载任意对象类型；APK 不是 OSS 的禁用类型。
- 当前 `api/src/domains/files.rs` 已允许 `application/vnd.android.package-archive`。
- 当前系统版本 API 已允许 `platform = android`，且 `api/tests/system_management_flow.rs` 覆盖了 APK 的“创建资产 -> 签名上传 -> 上传确认 -> 发布”流程。
- 系统管理页对已上传 APK 提供受权限保护的下载入口；公开 `/web/downloads` 页面则被设计为“桌面端下载页”，只选择完整的三平台桌面版本：每个平台为 `universal`，或同时具备 `x64` 与 `arm64`，刻意不展示 Android。
- `GET /web/downloads/{release_id}/assets/{asset_id}` 只验证“已发布且已上传”，不按平台限制。因此已发布 APK 在知道 release/asset ID 时也会走短时 OSS 签名 URL，但当前没有面向普通用户的 Android 发现页面。

### 结论与处理原则

APK 上传完成后“不能下载”不是 OSS 的必然行为。应先区分：

1. 上传失败：检查浏览器直传的 CORS、签名请求头、Content-Type 和 OSS 返回 XML。
2. 已上传但页面看不到：这是当前公开页面仅支持桌面端的产品边界，不是 OSS 下载失败。
3. 点击后 302/403：检查签名是否过期、Bucket/Endpoint 是否匹配、对象是否存在、RAM 权限，以及 OSS 防盗链 Referer 规则。
4. 返回 200 但手机不安装：这是 Android 浏览器/系统对未知来源 APK、下载权限或签名包的安全限制，不是 OSS 读取失败。

移动端公开分发需要在明确接受“已发布资产公开可下载”这一模型后单独实施：新增 `/web/mobile-downloads` 或统一下载页、按 Android/iOS 平台显式筛选资产、通过 OSS 对象元数据或已签名的响应参数设置 `Content-Disposition: attachment`、展示由服务端对已上传字节计算并持久化的 SHA-256 与版本说明，并补齐 APK 的真实 OSS 验收测试。发布前还应校验目标平台允许的文件格式；Android 至少校验 CI 产物签名清单，条件具备时校验 APK package name、versionCode 与允许的签名证书。不得仅因为公开桌面页未显示 APK 就把问题归因于 OSS。

## 验证矩阵

- W0：迁移清单、决策记录、浏览器资源交付设计和旧页面回退路径审阅。
- W1：Web 类型检查、构建、同源资源交付 smoke test、API/OpenAPI 契约测试、认证/CSRF/SSE 集成测试。
- W2-W3：浏览器 E2E 覆盖登录衔接、会话刷新、导航、通知、权限、分页、错误、附件、预览、实时刷新和 feature 回退。
- W4：共享 package 单元测试、类型检查、依赖边界静态检查，以及抽取前后的浏览器回归对比。
- D1：`npm --prefix desktop test`、`npm --prefix desktop run check`、打包安装包的登录/SSE/通知/导航/IPC/CSP/深链接测试，以及 renderer manifest 完整性校验。
- D2-D3：SQLite、缓存加密、用户切换、权限撤销、断网恢复、同步幂等、冲突和附件队列测试。
- 真实 OSS 验收：上传一个测试 APK，分别访问系统下载、无 Cookie 的公开下载入口与草稿/未上传拒绝路径；使用 `curl -I -L` 和 Android 浏览器记录 HTTP 状态、`Content-Type`、`Content-Disposition`、`x-oss-request-id` 与服务端持久化的文件哈希。
- 每个提交前执行与变更范围匹配的聚焦测试、`git diff --check`，并在阶段完成时对照本计划复核。

## 风险

- **同源交付被误解为未分离。** 首期同源只保留浏览器会话边界；`web/` 的代码、构建、测试和 REST 契约已独立。过早跨源会同时扩大 CORS、Cookie、CSRF 和 SSE 风险。
- **API 契约覆盖不足。** 若 W1 未把 feature 交互、附件和通知语义补进契约，新 Web 会重新依赖 HTML 或出现隐式行为漂移。
- **共享层提取过早。** 若在 W3 验证前建立完整共享包，Electron 假设会反向固化 Web 设计，后续仍需拆除宿主耦合。
- **旧 Askama 页面被过早删除。** 每个 feature 必须以浏览器权限回归、数据一致性和回退窗口结束为删除条件，而非以新 Web 构建成功为条件。
- **桌面认证与信任边界不同。** `app://` 不能默认复用浏览器 `SameSite=Lax` Cookie；D1 未收口设备凭证、endpoint、CSP、导航和 IPC sender 前不得开始桌面接入。
- **离线 Shell 被误认为离线数据。** 打包 renderer 只保证无网络启动；D2 前必须明确缓存范围、密钥管理、用户隔离、撤权清理和一致性语义。
- **离线写入不是缓存的自然延伸。** 缺少稳定游标/快照、墓碑、基线版本、幂等 operation ID、冲突策略和附件独立队列时不得开始 D3。
- **APK 的浏览器下载成功不等于可以安装。** Android 的未知来源授权、应用签名和渠道策略应由移动端发布方案单独覆盖。
- **公开版本资产一经发布即属于公开内容。** `release_id` 与 `asset_id` 不是访问控制或机密；短时 OSS 签名 URL 是有效期内的 bearer 凭证，不得写入审计详情、分析系统、错误上报或第三方跳转 Referer。若不接受该模型，必须在公开路由前增加鉴权与授权校验。
