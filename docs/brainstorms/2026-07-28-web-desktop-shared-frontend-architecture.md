---
date: 2026-07-28
topic: web-desktop-shared-frontend-architecture
---

# Web 与桌面端共享前端及平台能力分层

## Problem Frame

当前 `api/` 同时承担 Rust 领域逻辑、REST API、Askama 服务端 HTML 模板、静态 JavaScript/CSS 和 Web 路由；`desktop/` 是 Electron 薄壳，运行时通过 `BrowserWindow.loadURL()` 访问远端 `/web`。这种形态可快速复用现有页面，但桌面安装包不包含业务 UI，无法在脱网时启动或读取本地数据，也使 Web 页面中的桌面能力判断直接耦合 `window.yuanceDesktop`。

目标是把 Web 页面从服务端渲染宿主中独立出来，使浏览器和 Electron 桌面端复用同一份前端业务代码；同时保留桌面端特有的系统通知、文件系统、自动更新、托盘、启动项、本地数据和同步能力，而不把这些能力泄漏进普通浏览器环境。

## Confirmed Requirements

- R1：新增独立的 `web/` 前端模块，Web 浏览器与桌面 Electron 渲染进程复用其页面、路由、组件、样式、业务状态和 API client。
- R2：桌面安装包包含由共享前端源码生成的桌面渲染产物；桌面渲染页面不依赖生产环境的远端 `/web` URL。
- R3：当前 `api/` 逐步收敛为业务后端和 REST API 宿主，不再长期承担唯一的 HTML 页面实现。
- R4：共享前端代码不得直接访问 Electron、Node.js、`window.yuanceDesktop` 或任意浏览器全局能力。
- R5：系统原生通知、文件系统、外部链接、窗口生命周期、更新、托盘与启动项属于桌面专属能力，通过受限平台适配器提供。
- R6：消息的业务事实、已读状态、权限和跳转目标由服务端 API 决定；桌面端原生通知只是该消息的一个呈现渠道。
- R7：后续支持本地数据时，桌面端可离线打开已同步内容；是否允许离线写入及联网后双向同步需在实施计划前确认。

## Current Facts

- `api/src/web/router.rs` 暴露 `/web/*` 服务端页面路由、`/api/v1/*` JSON 接口和 `/static/*` 静态资源。
- `api/templates/` 有认证、工作台、项目、工作项、消息、资料库和系统管理等 Askama 模板；`api/static/app.js` 同时包含页面行为、SSE、消息刷新和 Electron 通知桥逻辑。
- `desktop/src/main.mjs` 目前通过 `BrowserWindow.loadURL(webConfig.url)` 加载页面；`desktop/src/preload.cjs` 仅暴露原生通知及点击回调。
- 已有 `docs/openapi/yuance.openapi.json`，应成为独立前端 REST client 的契约来源；缺失的页面行为接口需要补齐到同一契约，不另建重复业务 API。

## Target Architecture

```text
                    +--------------------+
                    | services/api        |
                    | REST / Auth / Sync  |
                    +----------+---------+
                               ^
                               | HTTPS REST + events
               +---------------+---------------+
               |                               |
+--------------+---------------+  +------------+----------------+
| apps/web                     |  | apps/desktop                |
| Browser bootstrap            |  | Electron main / preload     |
| Browser platform adapter     |  | packages desktop renderer  |
+--------------+---------------+  | Desktop platform adapter     |
               |                  | desktop-agent (optional)    |
               v                  +------------+----------------+
+-----------------------------------------------------------------+
| packages/frontend-app                                            |
| routes, feature state, API use cases, notification policy       |
+-----------------------------+-----------------------------------+
                              |
+-----------------------------+-----------------------------------+
| packages/ui                                                      |
| components, style tokens, layouts, document preview UI          |
+-----------------------------+-----------------------------------+
                              |
+-----------------------------+-----------------------------------+
| packages/api-client                                              |
| OpenAPI types, REST transport, auth/session and event client    |
+-----------------------------------------------------------------+
```

`apps/web` 与 `apps/desktop` 是不同宿主；`packages/frontend-app`、`packages/ui` 和 `packages/api-client` 才是共享部分。桌面端不应复制一份 `web/` 源码，也不应让 `web/` 反向依赖 Electron。

## Recommended Repository Layout

```text
api/
  src/
    domains/                 # 现有业务规则，继续作为服务端核心
    web/api/                 # REST API、认证、同步与事件接口
    web/                     # 过渡期保留现有服务端 Web 路由

web/
  src/
    bootstrap/               # 浏览器入口与 BrowserPlatformAdapter
    app/                     # Web 壳配置，不放业务重复实现
  package.json

frontend/
  packages/
    api-client/              # OpenAPI 类型、REST/SSE client、认证抽象
    app-core/                # 功能 use case、路由状态、离线状态策略
    ui/                      # 无平台依赖的页面/组件/样式/预览 UI
    platform-contract/       # 平台能力接口及 no-op 实现

desktop/
  src/
    main.mjs                 # Electron 生命周期、窗口、协议、进程管理
    preload.cjs              # 最小受信任 IPC surface
    renderer/                # DesktopPlatformAdapter 与桌面 composition root
    agent/                   # 可选：本地 SQLite、附件缓存、同步队列
  resources/
    web/                     # 桌面 renderer 构建产物，由共享前端包生成
```

目录名可在计划阶段根据现有 Node 工具链调整；关键约束是“共享包不依赖宿主，宿主只实现平台适配”。

## Composition Roots and Build Handoff

“复用同一份 Web 代码”指共享同一套前端包，而不是让两个宿主必须加载字节完全相同、没有入口差异的文件。需要固定两个很薄的 composition root：

```ts
// frontend/packages/app-core
export function mountApp(input: {
  api: ApiClient;
  platform: PlatformCapabilities;
  router: AppRouter;
}): void;

// web/src/main.ts
mountApp({ api: browserApiClient, platform: browserPlatform, router: browserRouter });

// desktop/src/renderer/main.ts
mountApp({ api: desktopApiClient, platform: desktopPlatform, router: desktopRouter });
```

- `mountApp()`、feature、组件、样式和 API client 来自同一份共享包；只有 API 端点、认证运输、路由历史和平台能力由宿主注入。
- `web` 构建浏览器入口；`desktop` 构建桌面入口，二者共享依赖图和版本号，但允许各自注入 Browser / Desktop adapter。
- CI 必须先构建共享前端，再构建两个入口；Electron Builder 通过明确的 `extraResources` 或 `files` 规则将桌面 renderer 输出复制进安装包。
- 构建产物须生成 manifest（前端版本、git revision、文件哈希），Electron 启动时校验资源存在；安装包级测试须验证深链接回退、CSP、资源完整性和 `app://` 加载。

## Shared and Platform-Specific Ownership

| 范围 | 归属 | 说明 |
|---|---|---|
| 页面、路由、表单状态、权限可见性、项目/工作项/资料库/消息 UI | `frontend/packages/ui` + `app-core` | 浏览器与桌面复用，不能引用 Electron API。 |
| REST 请求、分页、错误模型、鉴权刷新、SSE 协议 | `api-client` | 由 OpenAPI 契约驱动；传输端点由宿主配置。 |
| 业务规则、权限判定、消息创建、审计 | `api/src/domains` | 服务端唯一事实来源，不复制到 Web 或 Electron。 |
| 浏览器入口、PWA/浏览器通知策略、Cookie 会话 | `web/` | 仅浏览器宿主实现。 |
| Electron 窗口、preload、系统通知、托盘、自动更新、打开文件、外部链接 | `desktop/src` | 仅桌面宿主实现，必须经过 IPC 白名单。 |
| SQLite、附件缓存、待同步变更、网络重试 | `desktop/agent` | 仅在要求离线数据/写入时引入。 |
| 远端 REST、实时事件、同步服务 | `api/` | 不区分 Web 业务 API 与 Desktop 业务 API；仅增加同步/设备能力。 |

## Platform Contract

共享前端只依赖显式能力接口，而不是运行时探测 `window.yuanceDesktop`：

```ts
interface PlatformCapabilities {
  readonly kind: "web" | "desktop";
  notifications: {
    show(input: NotificationInput): Promise<void>;
    onClick(callback: (target: InternalRoute) => void): () => void;
  };
  files: {
    chooseFiles(input: FileSelectionOptions): Promise<SelectedFile[]>;
    reveal(handle: LocalFileHandle): Promise<void>;
  };
  shell: {
    openExternal(url: string): Promise<void>;
  };
  lifecycle: {
    onOnlineChange(callback: (online: boolean) => void): () => void;
  };
}
```

- `web/` 注入 Browser adapter：系统通知不可用时返回安全 no-op 或使用站内 toast；不暴露 Node 能力。
- `desktop/` 注入 Desktop adapter：调用受限 preload；主进程再次校验来源、URL、参数长度和权限。
- `LocalFileHandle` 是主进程或 desktop agent 签发的不可猜测、不透明句柄，不能是 renderer 传入的原始路径。主进程必须按句柄 TTL、当前用户、文件归属和允许根目录解析；无效、过期或跨用户句柄必须拒绝。
- `app-core` 只表达“有新消息且应提醒”，不决定使用 Electron、浏览器通知或站内提示。
- 现有 `api/static/app.js` 中的 `desktopBridge()`、`notifyDesktopForNewItems()` 和 `initDesktopNativeNotifications()` 在迁移时拆出为 Desktop adapter，不继续留在共享页面逻辑中。

## Message Notification Flow

```text
领域事件（回复、提及、指派）
  -> api 创建通知记录与语义目标（唯一事实）
  -> REST/SSE/同步增量告知客户端
  -> app-core 更新通知 store、未读数和消息中心
  -> Web adapter：站内 badge / toast / 可选 Web Notification
  -> Desktop adapter：窗口非前台时请求主进程原生通知
  -> 用户点击系统通知
  -> preload/main 仅回传受限的 InternalRoute
  -> app-core router 打开消息或工作项，并调用幂等 REST 操作标记已读
```

规则：

- 原生通知不创建第二份桌面消息，也不在客户端直接改变服务端已读状态。
- 通知 REST DTO 不再把 `/web/messages/{id}/open` 或任意 `/web/*` URL 当成业务目标；应返回通知 ID 与语义目标，例如 `{ kind: "work-item", workItemKey, commentId? }`。共享 router 独占语义目标到 UI 路由的映射。
- Unit 1 必须补充经权限校验的通知目标读取和幂等“标记已读”REST 操作，并让 Web 与桌面共用该契约；旧 HTML 重定向可在迁移期保留为兼容层。
- 去重键应使用服务端通知 ID 或稳定事件 ID；离线重连和多设备同步均不得重复弹出同一通知。
- 原生通知仅在桌面窗口非前台、用户未关闭该通知类别且系统权限允许时展示。
- 完全退出桌面应用时，Electron 无法接收 SSE；若未来要求退出后仍推送，需另行接入平台推送服务或常驻 agent，不能由当前 Electron 通知机制解决。

## Offline Data Boundary

把桌面 renderer 资源打进 Electron 只能解决“离线打开页面资源”，不能解决“离线读取或编辑业务数据”。

### Phase A: Offline Shell

- Electron 使用安全的 `app://` 协议加载内置桌面 renderer 资源，而非生产 HTTPS URL 或不受控 `file://`。
- 无网络时可启动、显示登录/离线状态和已缓存的静态 UI。
- 数据请求仍由远端 REST API 提供；未缓存数据不可用。

### Phase B: Offline Read Cache

- Desktop agent 保存登录后的授权数据镜像、消息、项目摘要、工作项、资料元数据和经过授权的附件缓存。
- `api-client` 通过统一 repository 接口优先读取本地缓存，再按网络状态刷新远端数据。
- 本地数据库加密、用户切换清理、缓存配额和附件权限必须在计划中明确。
- 进入本阶段前必须确定一致性基线：第一版是按授权范围全量刷新缓存，还是提供快照水位与稳定游标的增量同步。后者必须定义初始同步原子性、删除墓碑、权限撤销失效语义、重连恢复和服务端版本边界，不能从页码分页或“刷新”型 SSE 信号推导。

### Phase C: Offline Write and Sync

- 本地写操作写入 SQLite 与 outbox，生成不可变操作 ID、基线版本与依赖顺序。
- 联网后向同一 `api/` 服务的同步端点上传变更，再拉取服务器增量。
- 冲突策略按实体定义；例如评论可追加合并，标题/状态/成员关系需要版本冲突提示或服务端规则裁决。
- 附件采用断点续传/内容哈希和独立同步队列，不能把文件二进制塞进普通业务变更请求。

## Migration Strategy

### Unit 1: Contract and Boundary Baseline

- 盘点现有 `/web/*` 交互所需的数据和写操作，映射到 `docs/openapi/yuance.openapi.json`。
- 补齐缺失 REST 端点、分页、错误模型、CSRF/Token 方案和 SSE 事件语义；每个已迁移交互必须有 OpenAPI/事件契约和兼容测试，不能以 Askama URL 作为客户端业务契约。
- 在开始客户端页面迁移前确定并验证单一信任模型：`app://` 本地资源 origin、远端 API origin、凭证存储与携带方式、CORS、CSRF、SSE 以及 IPC 发起方校验。不得假设现有 `SameSite=Lax` Cookie 会话可直接跨源复用。
- 增加通知语义目标 DTO、通知目标读取和幂等已读 REST 操作，逐步淘汰 API 中的 `/web/*` 展示 URL 泄漏。
- 先建立 `api-client` 与 `platform-contract`，禁止新增 Web 页面逻辑直接访问 Electron 全局对象。

### Unit 2: Shared Frontend Foundation

- 新建独立 `web/` 与共享前端包，确定 TypeScript、构建工具、路由、状态管理和测试基线。
- 固定 `mountApp()` 与 Browser / Desktop 两个 composition root；同一 feature 只能由共享包实现，宿主入口只能注入 adapter 和配置。
- 先迁移认证、应用壳、导航、通知中心和基础错误/加载状态。
- 新旧 `/web/*` 服务端页面并存，逐页切换，禁止大爆炸重写。

### Unit 3: Common Feature Migration

- 按业务优先级迁移工作台、项目、工作项、评论、资料库、消息和文档预览。
- 每迁移一个页面，Web 与 Electron 从同一份共享 feature/UI 源码构建并验收；原 Askama 页面保留到回归和权限验证完成。
- 将现有前端脚本中的路由、动态局部刷新和 SSE 行为重构为共享 feature 模块。

### Unit 4: Desktop Local Renderer and Native Features

- Electron 通过 `app://` 加载桌面 renderer 构建产物；取消默认远端 `loadURL()` 生产入口。协议必须注册为安全标准协议，严格限制资源根目录和导航目标，不使用不受控 `file://`。
- 明确构建顺序、资源复制规则、打包 manifest 和 Web/Desktop 前端版本一致性校验；CI 与安装包级测试必须证明 renderer 文件实际进入产物且 `app://` 可加载 SPA 深链接。
- 按 Platform contract 实现原生通知、点击路由、文件选择/保存、外部链接、自动更新和托盘等桌面 adapter。
- 将 Electron 主进程/预加载脚本保持为最小特权边界，持续覆盖导航、IPC、权限和协议安全测试。

### Unit 5: Local Data and Sync

- 在明确离线读写范围后引入 desktop agent、SQLite、缓存索引、outbox 和同步 API。
- 建立网络切换、重试、冲突、用户切换、数据清理、附件缓存与恢复测试。
- 在真实多端场景验证同步顺序、通知去重和权限撤销后的本地数据处理。

## Scope Boundaries

- 不在第一阶段同时迁移所有服务端系统管理页面；优先迁移用户高频工作流和桌面必需页面。
- 不在未确定冲突策略前承诺完整离线写入。
- 不让 Electron renderer 直接访问本地数据库、文件系统或任意网络地址。
- 不复制 `api/src/domains` 业务逻辑到 TypeScript；客户端仅处理展示、输入校验、缓存和同步编排。
- 不因 Web/桌面前端重构而删除现有 API 的服务端审计、权限、CSRF 和认证约束。

## Success Criteria

- Web 浏览器和桌面端从同一份共享前端 feature/UI 源码构建并渲染核心业务页面；两个 composition root 仅在宿主配置和 platform adapter 上不同。
- 已迁移共享前端不包含 `electron`、`ipcRenderer`、`window.yuanceDesktop` 或 Node.js 依赖。
- 桌面安装包在断网时可以启动并加载内置页面资源；后续离线数据能力按明确阶段验收。
- 服务端消息在 Web 与桌面消息中心呈现一致；桌面端可在符合策略时显示系统通知，点击后安全打开同一业务路由。
- REST/OpenAPI 契约有自动化兼容验证，Web 与桌面不会因 API 演进而各自漂移；已迁移 API 不返回仅供 Askama `/web/*` 使用的展示 URL。

## Outstanding Questions

### Resolve Before Planning

- 离线第一期是“只读已同步数据”，还是“允许完整编辑并在联网后同步”？
- Web 独立前端的技术栈是否指定；若未指定，计划阶段需要比较延续原生 JavaScript 模块化与引入 TypeScript 组件框架的迁移成本。
- 登录是否继续采用 Cookie 会话，还是为 Web/桌面统一采用 OAuth/PKCE 或受控 Token 会话；桌面本地凭证如何安全保存？
- `app://`、远端 API、CORS、CSRF、SSE 与 IPC 的完整可信来源模型是什么？该模型必须能覆盖登录、会话刷新、写请求、登出和实时连接的打包 Electron 集成验证。
- 桌面端是否允许多个服务器/私有化部署配置，还是固定单一组织服务端？
- 离线读缓存采用全量授权范围刷新，还是快照/游标增量同步？若采用后者，删除、权限撤销、设备初始同步和重连恢复的语义是什么？

### Deferred to Planning

- `app://` 自定义协议的 CSP、资源缓存和 SPA 深链接实现。
- OpenAPI 类型生成工具、客户端请求库、状态管理和组件框架选择。
- 本地数据库加密、附件缓存容量、冲突 UI 与同步观测指标。
- Askama `/web/*` 旧页面的迁移顺序、双栈期限和最终下线策略。

## Next Steps

→ 先确认“离线读写范围”“前端技术栈”和“桌面认证/可信来源模型”三个关键决策，再生成分阶段实施计划；实施应从 Unit 1 的契约盘点、语义化通知契约和共享边界开始，不直接重写全部页面。
