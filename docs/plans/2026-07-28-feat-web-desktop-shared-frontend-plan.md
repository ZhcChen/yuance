---
title: feat: Web 与 Electron 桌面端共享前端及离线演进
status: active
date: 2026-07-28
origin: docs/brainstorms/2026-07-28-web-desktop-shared-frontend-architecture.md
---

# feat: Web 与 Electron 桌面端共享前端及离线演进

## Overview

将当前由 `api/` 直接服务 Askama 页面、`desktop/` 远程加载 `/web` 的形态，渐进迁移为“共享前端业务代码 + 浏览器与 Electron 两个宿主入口”。浏览器与桌面端共享页面、组件、路由状态、API client 和 feature 逻辑；Electron 保留窗口、preload、系统通知、托盘、文件能力、本地数据和同步等专属职责。

本计划不把“内置前端资源”误称为“离线业务数据”。首先让桌面安装包可靠地加载内置 renderer，再按明确的数据边界引入只读缓存和可选的离线写入同步。

## Current Baseline

- `api/` 同时承担 Rust 领域规则、REST API、Askama 页面、`api/static/app.js` 和 `/web/*` 路由。
- `desktop/src/main.mjs` 通过 `BrowserWindow.loadURL(webConfig.url)` 加载远端 Web 页面；`preload.cjs` 当前只暴露受限的原生通知桥。
- `api/static/app.js` 中仍含 `window.yuanceDesktop` 探测和 Electron 通知逻辑，需在迁移中抽离。
- `api/src/domains` 是服务端权限、审计、业务规则和通知事实的唯一来源；前端不得复制这些规则。
- `docs/openapi/yuance.openapi.json` 已存在，但尚未覆盖所有 `/web/*` 交互、附件、SSE 与系统管理能力。

## Requirements Trace

- R1：新增独立 `web/` 前端模块，并让浏览器和 Electron renderer 复用共享 feature/UI/API 代码。
- R2：桌面正式安装包加载内置 renderer，不依赖生产环境远端 `/web` URL。
- R3：保留 `api/src/domains` 作为唯一业务规则和权限事实来源，不创建重复的 Desktop 业务后端。
- R4：共享前端不直接依赖 Electron、Node.js、`ipcRenderer` 或 `window.yuanceDesktop`。
- R5：系统通知、文件系统、外部链接、窗口、托盘、更新和本地数据只通过桌面专属适配器暴露。
- R6：通知目标、已读状态和访问校验以 REST/事件契约表达，不以 `/web/*` 展示 URL 作为跨宿主业务契约。
- R7：离线能力分为内置 Shell、已同步数据只读缓存和可选离线写入同步三个阶段。

## Architecture Decisions

### Shared Packages and Composition Roots

```text
frontend/
  packages/
    api-client/         # OpenAPI 类型、REST/SSE、认证传输抽象
    app-core/           # feature use case、路由状态、通知策略、repository 接口
    ui/                 # 页面、组件、样式、文档预览 UI
    platform-contract/  # 平台能力接口及 Browser no-op 实现

web/
  src/main.ts           # Browser composition root

desktop/
  src/
    main.mjs            # Electron 主进程、协议、窗口与生命周期
    preload.cjs         # 最小特权 IPC surface
    renderer/main.ts    # Desktop composition root 与 adapter
    agent/              # 后续 SQLite、附件缓存、outbox、同步
```

共享的是前端源码和 feature 依赖图，不要求浏览器与桌面加载字节完全相同的入口文件。两个宿主只允许注入 API 端点、认证传输、路由历史和 `PlatformCapabilities`：

```ts
mountApp({ api, platform, router });
```

- `web/src/main.ts` 注入 Browser adapter。
- `desktop/src/renderer/main.ts` 注入受限 preload 支持的 Desktop adapter。
- `mountApp()`、页面、feature、样式和 API client 必须来自共享包。
- Electron Builder 必须显式复制桌面 renderer 输出，不能依赖开发机存在的 `web/dist`。

### Platform Boundary

- `app-core` 只表达“有新通知且应提示”等业务意图，不决定 Electron 通知、浏览器通知或站内 toast。
- 文件打开/定位必须使用主进程或 desktop agent 签发的 `LocalFileHandle`，不得让 renderer 传递任意本地路径。
- Electron 主进程按 IPC 来源、句柄 TTL、当前用户、文件归属、允许根目录、URL allowlist 和参数长度再次校验。
- 共享代码不能通过运行时检测 `window.yuanceDesktop` 选择行为；平台差异由构建入口显式注入。

### Notification Contract

- 服务端创建通知记录及语义目标，作为唯一事实来源。
- 通知 DTO 不再以 `/web/messages/{id}/open` 等 HTML URL 表示业务跳转，而应包含通知 ID 与语义目标，例如工作项键和可选评论 ID。
- Web 与 Desktop 共享内部路由映射，并通过幂等 REST 操作标记已读。
- Desktop adapter 仅在窗口非前台、用户允许且系统允许时请求原生通知；应用完全退出后不承诺继续接收 SSE。

## Decision Gates

以下决定必须在开始页面迁移前完成；未收口时只允许做盘点、原型和契约测试。

| 决策 | 选项 | 对计划的影响 |
|---|---|---|
| 离线范围 | 已同步数据只读 / 完整离线写入 | 决定是否进入 Unit 6、7，以及是否需要 outbox 与冲突 UI。 |
| 前端技术栈 | 渐进式原生 TypeScript / 组件框架 | 决定 `web/` 与共享包的构建、组件和测试基线。 |
| 桌面认证 | Cookie 跨源策略 / PKCE 或受控 Token | 决定 `app://` 与远端 API 的 CORS、CSRF、SSE、凭证存储与登出实现。 |
| 服务端配置 | 单一服务端 / 多私有化服务器 | 决定桌面 endpoint 配置、证书信任和用户数据隔离。 |
| 缓存同步 | 授权范围全量刷新 / 快照与稳定游标增量 | 决定删除墓碑、权限撤销、重连与初始同步语义。 |

推荐顺序：首期只做“内置 Shell + 已同步数据只读”，桌面认证使用独立受控凭证模型；离线写入在同步协议、冲突策略和附件策略确定后单独进入 Unit 7。

## Implementation Units

### Unit 0：可信来源与迁移基线验证

**Goal:** 在引入任何独立 renderer 前，验证 `app://`、远端 API、认证、CORS、CSRF、SSE 和 IPC 的单一可信来源模型。

**Files:**

- Create: `docs/decisions/` 下的认证与可信来源决策记录（目录不存在时先在计划中确认位置）
- Modify: `desktop/src/config.mjs`、`desktop/src/main.mjs`、`desktop/src/preload.cjs`（仅在验证原型需要时）
- Modify: `api/src/web/router.rs`、`api/src/web/api/mod.rs`、认证相关模块（仅按已确认模型）
- Test: Electron 打包/集成验证、认证 API 测试

**Approach:**

- 固定本地资源 origin、远端 API origin、证书策略、凭证存储、请求携带方式、CORS、CSRF、SSE 重连和 IPC sender 校验。
- 明确浏览器与桌面是否使用不同 transport adapter；业务 API 不得因此复制。
- 编写最小 `app://` renderer 验证：登录、刷新会话、读请求、写请求、SSE、登出和被拒绝 IPC。

**Verification:**

- 打包 Electron 环境通过完整认证最小闭环。
- 任何 `app:// -> API` 跨源失败都有可诊断的 HTTP/CORS/CSRF 错误，而不是静默失效。
- 未受信 renderer、任意路径和非 allowlist URL 无法调用桌面 IPC。

### Unit 1：REST、事件与通知语义契约盘点

**Goal:** 将待迁移 `/web/*` 交互收敛到稳定 REST/SSE 契约，去除 Askama 页面 URL 对客户端的业务泄漏。

**Files:**

- Modify: `docs/openapi/yuance.openapi.json`
- Modify: `api/src/web/api/mod.rs`
- Modify: `api/src/web/router.rs`
- Modify: `api/src/domains/notifications.rs` 与相关业务 domain（仅补充语义目标/已读能力）
- Test: `api/tests/*_flow.rs`

**Approach:**

- 建立 `/web/*` 交互到 REST、错误模型、分页和 SSE 事件的映射表。
- 为通知新增语义目标读取与幂等已读操作；保留旧 HTML 跳转仅作为兼容层。
- 将附件、下载、预览、系统管理、实时刷新等实际客户端依赖补入 OpenAPI/事件契约。
- 每个迁移的用户操作都必须有兼容测试，不允许新客户端通过解析 HTML 或拼接 `/web/*` URL 工作。

**Verification:**

- 已迁移交互有 OpenAPI 定义、服务端集成测试和 API client 契约测试。
- Web 与 Desktop 使用同一通知 payload，并能进入相同业务实体。

### Unit 2：共享前端工程与双入口底座

**Goal:** 建立共享包、浏览器入口和桌面入口，但不在此单元完成业务页面重写。

**Files:**

- Create: `web/`
- Create: `frontend/packages/api-client/`
- Create: `frontend/packages/app-core/`
- Create: `frontend/packages/ui/`
- Create: `frontend/packages/platform-contract/`
- Create: `desktop/src/renderer/`
- Modify: 根 `package.json` / workspace 配置（按选定工具链）
- Test: package 单元测试、构建完整性测试

**Approach:**

- 提供 `mountApp({ api, platform, router })`，由两个 composition root 调用。
- 将 Browser/ Desktop platform adapter 放在宿主层，shared package 只依赖接口。
- 由 OpenAPI 类型生成或受控手写类型初始化 `api-client`；明确超时、重试、错误和认证 transport。
- CI 先构建共享包，再分别构建浏览器和桌面 renderer；产物携带前端版本、git revision 和哈希 manifest。

**Verification:**

- 两个入口均能构建，且共享包不包含 Electron/Node 依赖。
- 静态检查禁止共享目录引用 `electron`、`ipcRenderer` 或 `window.yuanceDesktop`。
- manifest 校验可识别桌面 renderer 缺失或版本不一致。

### Unit 3：认证、应用壳、导航与消息中心迁移

**Goal:** 先迁移跨页面的基础体验，验证共享状态、认证传输和通知 adapter 的实际边界。

**Files:**

- Create/Modify: `web/src/**`、`frontend/packages/**`、`desktop/src/renderer/**`
- Modify: `api/src/web/api/mod.rs`、`api/src/web/router.rs`（按 Unit 1 契约）
- Modify: `api/static/app.js`（逐步移除桌面桥逻辑）
- Test: Browser E2E、Electron 集成测试、认证与通知 API 测试

**Approach:**

- 迁移登录、登出、应用壳、项目上下文、全局导航、错误/加载状态和消息中心。
- 将 `desktopBridge()`、`notifyDesktopForNewItems()`、`initDesktopNativeNotifications()` 替换为 Desktop adapter。
- 保持 Askama `/web/*` 页面可用，按路由或 feature 开关逐步切换，不做一次性重写。

**Verification:**

- 浏览器和桌面分别从自己的入口使用相同共享消息中心。
- Native notification 点击只能打开受限内部路由，并按 REST 契约标记已读。

### Unit 4：高频业务 Feature 渐进迁移

**Goal:** 以可回归的粒度迁移工作台、项目、工作项、评论、资料库与文档预览。

**Files:**

- Create/Modify: `frontend/packages/app-core/**`、`frontend/packages/ui/**`
- Create/Modify: `web/src/**`、`desktop/src/renderer/**`
- Modify: `api/src/web/api/mod.rs`、`docs/openapi/yuance.openapi.json`（仅补齐已迁移 feature）
- Test: feature API 测试、共享 UI 测试、Browser/Electron 回归测试

**Approach:**

- 每次仅迁移一个能独立验收的 feature，并保留对应 Askama 页面直到权限、回归与数据一致性通过。
- 文档预览继续复用浏览器能力，但其数据源改为 API client/签名下载契约，不绑服务端模板路由。
- 不迁移低频系统管理页面，除非桌面用户工作流确实需要。

**Verification:**

- 每个 feature 在 Web 与 Electron 中行为一致，且权限、错误、加载、附件下载和 SSE 刷新均通过回归。
- 不引入客户端业务权限裁决或与 `api/src/domains` 重复的规则。

### Unit 5：Electron 本地 Renderer 与原生能力

**Goal:** 使正式 Electron 包从 `app://` 加载内置 renderer，并将桌面能力收敛到最小特权边界。

**Files:**

- Modify: `desktop/src/main.mjs`
- Modify: `desktop/src/preload.cjs`
- Modify: `desktop/src/config.mjs`
- Modify: `desktop/electron-builder.yml`
- Modify: `desktop/package.json`、构建脚本和 GitHub Actions
- Test: `desktop/test/**`、安装包级 smoke test

**Approach:**

- 注册安全的 `app://` 协议，限制资源根、导航、重定向、窗口打开和 CSP；不使用不受控 `file://`。
- 将桌面 renderer 输出通过明确 `files`/`extraResources` 规则打入安装包。
- 为通知、外链、文件选择/保存、文件句柄定位、托盘和更新提供受限 IPC；每项能力独立 allowlist。
- 保留开发态与正式态 `userData`、session、Cookie、缓存和 macOS Dock 图标隔离。

**Verification:**

- macOS、Windows、Linux 安装包均包含 renderer 文件，断网时仍可启动并显示本地 Shell。
- 深链接回退、CSP、导航阻断、协议资源访问、IPC 拒绝路径和系统通知点击全部自动化覆盖。

### Unit 6：离线只读缓存

**Goal:** 让桌面端离线读取已经授权且已同步的数据，而不实现离线写入。

**Files:**

- Create: `desktop/src/agent/` 或独立 Rust sidecar（按技术决策）
- Modify: `frontend/packages/app-core/`、`frontend/packages/api-client/`
- Modify: `api/src/web/api/mod.rs`、`docs/openapi/yuance.openapi.json`（仅当选择增量同步）
- Test: SQLite、缓存加密、网络切换、权限撤销与附件缓存测试

**Approach:**

- 按当前用户隔离 SQLite、附件缓存、缓存配额和清理策略。
- 先确定“全量刷新”或“快照 + 稳定游标”同步基线；后一种必须具备水位、墓碑、权限撤销、初始同步和重连语义。
- `api-client` 通过 repository 接口读取缓存与远端数据，renderer 不直接访问数据库或文件系统。

**Verification:**

- 离线仅显示当前用户已同步、仍有权限的数据。
- 用户切换、登出、权限撤销和缓存配额超限不会泄漏旧用户数据。

### Unit 7：离线写入与双向同步（可选，需单独批准）

**Goal:** 在明确冲突策略后实现评论、编辑、状态变更和附件的 outbox 同步。

**Files:**

- Modify: `desktop/src/agent/**`
- Modify: `frontend/packages/app-core/**`
- Modify: `api/src/domains/**`、`api/src/web/api/**`、OpenAPI（新增同步契约）
- Test: 多设备、断网重试、冲突、附件断点续传和幂等性测试

**Approach:**

- 每个本地操作生成不可变 operation ID、基线版本和依赖顺序。
- 评论采用追加合并；标题、状态、成员关系等冲突由实体规则或用户确认处理。
- 附件使用内容哈希和独立队列，不将二进制塞进普通业务 outbox。

**Verification:**

- 重试不会重复创建业务记录或重复弹出通知。
- 冲突、权限撤销、部分附件失败和多端并发均有可恢复行为。

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

## Verification Matrix

- `cargo test -p yuance-api`：REST、通知、权限、存储、版本与下载路由。
- `npm --prefix desktop test` 与 `npm --prefix desktop run check`：Electron 主进程、preload、构建配置。
- 共享前端 package 单元测试、类型检查、构建 manifest 验证。
- Browser 与打包 Electron 的登录、SSE、通知点击、附件下载、登出和导航安全 E2E。
- 真实 OSS 验收：上传一个测试 APK，分别访问系统下载、无 Cookie 的公开下载入口与草稿/未上传拒绝路径；使用 `curl -I -L` 和 Android 浏览器记录 HTTP 状态、`Content-Type`、`Content-Disposition`、`x-oss-request-id` 与服务端持久化的文件哈希。
- `git diff --check`。

## Risks

- `app://` 与远端 API 跨源认证若未在 Unit 0 收口，会使后续 UI 迁移无法安全落地。
- 当前 OpenAPI 覆盖度不足；若跳过 Unit 1，Web 与 Desktop 会重新依赖不同的隐式行为。
- 离线写入不是缓存功能的自然延伸，缺少同步版本、墓碑、冲突和附件策略时不得提前承诺。
- APK 的浏览器下载成功不等于可以安装；Android 的未知来源授权、应用签名和渠道策略应由移动端发布方案单独覆盖。
- 公开版本资产一经发布即属于公开内容，`release_id` 与 `asset_id` 不是访问控制或机密；短时 OSS 签名 URL 是有效期内的 bearer 凭证，不得写入审计详情、分析系统、错误上报或第三方跳转 Referer。若不接受该模型，必须在公开路由前增加鉴权与授权校验。
