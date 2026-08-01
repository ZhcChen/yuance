---
title: feat: D1 app protocol 安全宿主
type: feat
status: ready
date: 2026-08-01
origin: docs/plans/2026-07-28-feat-web-desktop-shared-frontend-plan.md
depends_on: docs/plans/2026-08-01-001-feat-d1-device-session-credential-plan.md
---

# feat: D1 `app://` 安全宿主

## 概述

本计划是 Desktop 六阶段路线图的第一个可执行子计划。它将当前加载远端 `/web` 的 Electron 壳替换为打包内 `app://` renderer，建立协议资源边界、CSP、导航/权限拒绝、最小 preload sender 校验和 Desktop composition root，并复用已完成的设备认证状态机作为认证状态来源。

本切片只证明共享应用 Shell 能在安全本地宿主中启动、路由和呈现认证状态。它不开放业务 REST/SSE，不实现文件 capability，不扩展业务 feature，不建立生产签名或自动更新。

## Product Contract Preservation

父计划与 D1 设备认证计划的产品边界不变。本计划只把父计划中已选定的 `app://` 安全宿主切片深化到可执行粒度，不改变 R1-R12、token namespace、凭证生命周期或后续阶段顺序。

## 问题框架

当前 `desktop/src/main.mjs` 通过 `loadURL(webConfig.url)` 加载远端 Web，preload 以远端 origin 判断 sender。即使 Electron 已启用 `contextIsolation`、sandbox 并默认拒绝权限，远端页面仍不是正式 Desktop 的可信本地 renderer，也无法形成稳定的打包资源、CSP、SPA 深链接和 Desktop adapter 边界。

W4 已形成 `frontend/packages/api-client`、`app-core`、`ui` 和 `platform-contract`，D1 设备认证也已在主进程形成 coordinator 与安全凭证存储。本切片应连接这些既有边界，但不得把长期 credential、通用 URL、Authorization header 或 Node 能力暴露给 renderer。

## 需求追踪

- R1. 正式态窗口只加载固定 origin `app://yuance/` 的 standard、secure 自定义协议和打包内 renderer；scheme privilege 在 Electron ready 前注册，正式窗口不得接受其他 host；不加载生产 `/web`，不使用 `file://`，也不允许任意目录作为资源根。
- R2. 协议只服务构建 manifest 中的 regular files，规范化 URL/path 后拒绝 traversal、编码绕过、反斜杠、NUL、目录、symlink 和 manifest 外资源；未知 SPA path 只回退受信 `index.html`，静态资源缺失保持 404。
- R3. HTML 响应强制设置收敛的 CSP 和安全响应头。正式态 `default-src 'self'`，脚本不允许 inline/eval，`object-src 'none'`、`base-uri 'none'`、`frame-ancestors 'none'`，本切片 `connect-src 'none'`。
- R4. BrowserWindow 保持 `contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`、`webSecurity: true`、`webviewTag: false`；权限、webview、非受信导航、redirect 和 `window.open` 默认拒绝。
- R5. preload 只暴露版本化、冻结、schema 校验后的最小 bridge；每个 IPC handler 同时校验顶层 frame、未销毁 sender、固定 `app://` origin 与当前主窗口 webContents，不以 renderer 传入 URL 判断信任。
- R6. Desktop renderer 复用共享 UI/app-core，通过 Desktop composition root 注入 router、认证状态和暂不联网的明确 adapter；共享 package 不读取 `window.yuanceDesktop`，renderer 不获得 credential、通用 fetch 代理或文件路径。
- R7. renderer 提供启动、未认证、认证中、已认证但业务网络未启用、locked/reauthorization-required 和不可恢复启动错误状态；本切片不在 renderer 内收集密码，也不伪装业务功能已经可用。
- R8. 开发态可使用独立 renderer dev server，但必须使用独立 `userData`/session，显式 allowlist loopback origin；正式构建路径不得读取环境变量切换 renderer origin或自动打开 DevTools。
- R9. renderer 产物和资源 manifest 必须进入安装包，构建后验证 hash、路径和 CSP；断网时三平台均可启动本地 Shell，但不宣称离线业务数据可用。
- R10. 当前远端 Web 壳保留为开发兼容/回退路径，只能由显式开发模式启用；正式态违反 `app://` 不变量必须 fail closed，不回退远端页面。

## 范围边界

### 包含

- Desktop renderer 的 Vite/JSDoc/checkJs 构建入口和最小应用 Shell。
- `app://` 协议注册、资源 manifest、MIME/安全头、SPA fallback 和错误响应。
- BrowserWindow、navigation、permission、window-open、webview 与 IPC sender hardening。
- Desktop composition root、认证状态快照/订阅的最小 bridge，以及显式不可用的 network/file adapters。
- 开发态与正式态加载策略、打包资源配置、三平台 CI/build/smoke 和负向测试。

### 不包含

- 不实现 Desktop REST、fetch-stream SSE、endpoint enrollment/profile 签名或业务 API allowlist。
- 不实现文件选择、文件路径、capability、对象存储 transfer grant、原生通知扩展或深链接。
- 不新增 device-session 服务端接口，不修改 refresh rotation、凭证存储和撤销语义。
- 不完成工作项、项目、消息中心等业务功能对齐；只挂载最小共享 Shell/状态界面。
- 不执行生产签名、公证、公开发布、自动更新或离线数据缓存。

## Context & Research

### 复用的现有实现

- `desktop/src/main.mjs`：窗口生命周期、单实例、默认权限拒绝、外链处理和 credential coordinator 组装入口。
- `desktop/src/preload.cjs`：现有最小 contextBridge；本切片在此基础上增加版本化宿主状态 API，不扩展通用 IPC。
- `desktop/src/config.mjs`：开发/正式模式和独立数据目录模式；正式态 renderer 选择必须改为编译/打包决定。
- `desktop/src/auth/credential-coordinator.mjs`：认证状态真相源；renderer 只接收脱敏状态，不直接调用 store/client。
- `web/src/main.jsx`：共享服务注入的 composition root 模式；Desktop 建立独立入口，不复制 Browser adapter。
- `frontend/packages/platform-contract`：平台接口边界；新增能力先进入明确 contract，再由 Desktop adapter 实现。
- `desktop/test/device-auth-electron-integration.test.mjs`：真实 Electron 主进程、重启和 `safeStorage` 集成测试模式。
- `.github/workflows/desktop-security.yml`：当前三平台安全 smoke Gate，应在本切片扩展打包态本地 Shell 验证。

### 技术决策

1. 使用 Electron `protocol.handle` 处理固定 `app://yuance/` origin，并在 `ready` 前通过 `protocol.registerSchemesAsPrivileged` 声明 `standard`、`secure` 和构建所需的最小 privilege；不启用 service worker 或绕过 CSP。协议 handler 只从构建生成的 manifest 映射资源，不将 URL pathname 直接拼接文件系统路径。
2. renderer 独立构建，不直接复用 Web 的入口。共享的是 package、use case 和 UI；Browser Cookie/EventSource/history 与 Desktop 状态/路由 adapter 保持分离。
3. CSP 由协议响应统一注入，构建产物不得依赖 inline script、eval 或外部 CDN。本切片不联网，因此 `connect-src 'none'`；D1-B 必须显式修改并验证 endpoint allowlist 后才能开放。
4. IPC 信任采用主进程持有的窗口身份与 frame URL 双重校验。`app://` origin 只是必要条件，不是充分条件；subframe、旧窗口、导航中的 sender 和非当前窗口全部拒绝。
5. 正式态 fail closed：manifest 缺失/篡改、入口不存在、CSP 无法注入或协议注册失败时展示主进程生成的最小错误窗口或退出，不回退远端 Web。

## 实施阶段与执行单元

### Unit 1：冻结协议、资源 manifest 与加载契约

**目标：** 先建立不依赖 Electron UI 的纯函数边界，使路径、MIME、SPA fallback 和 CSP 可穷举测试。

**涉及文件：**

- 新增 `desktop/src/protocol/app-protocol.mjs`
- 新增 `desktop/src/protocol/resource-manifest.mjs`
- 新增 `desktop/test/app-protocol.test.mjs`
- 新增 `desktop/test/resource-manifest.test.mjs`

**测试场景：**

1. `app://yuance/`、已登记静态资源和无扩展 SPA route 分别映射正确入口；其他 host、userinfo、port、query 驱动资源选择和 fragment 驱动资源选择均不改变映射，缺失带扩展资源返回 404。
2. `..`、percent/double encoding、反斜杠、NUL、绝对路径、目录和 manifest 外文件全部拒绝。
3. MIME、CSP、`X-Content-Type-Options`、cache policy 与 HTML/asset 差异正确；正式 CSP 不含 `unsafe-inline`、`unsafe-eval` 或网络 origin。
4. manifest 重复路径、非法 hash、symlink/非 regular file、入口缺失和根目录越界导致构建或启动失败。

**完成标准：** 协议决策可在 Node 测试中验证，handler 没有 renderer 可控的文件系统路径拼接。

### Unit 2：建立独立 Desktop renderer 构建与最小 Shell

**目标：** 复用共享 package 构建 Desktop composition root，并在无业务网络时呈现清晰状态。

**涉及文件：**

- 新增 `desktop/src/renderer/index.html`
- 新增 `desktop/src/renderer/main.jsx`
- 新增 `desktop/src/renderer/app.jsx`
- 新增 `desktop/src/renderer/app.css`
- 新增 `desktop/src/renderer/platform/router.js`
- 新增 `desktop/src/renderer/platform/auth-state.js`
- 新增 `desktop/vite.config.js`、`desktop/jsconfig.json`、`desktop/eslint.config.js`
- 新增 `desktop/test/renderer-composition.test.mjs`
- 修改 `desktop/package.json`、根 `package.json`

**测试场景：**

1. composition root 只注入 Desktop adapters，共享 package 不访问 DOM bridge、Cookie、EventSource 或 Node global。
2. 未认证、认证中、authenticated/network-pending、locked、reauthorization-required 和 fatal 状态渲染稳定，未知状态 fail closed。
3. router 只接受应用内语义路径，拒绝 absolute URL、协议相对 URL 和编码绕过。
4. `checkJs`、ESLint、单 React runtime 和 production build 通过；输出不引用远端 `/web`、外部 CDN 或 dev server。

**完成标准：** `npm run check:frontend` 同时覆盖 Web、共享包与 Desktop renderer，正式 renderer 可独立构建且不含业务网络实现。

### Unit 3：注册 `app://` 并收紧窗口安全策略

**目标：** 正式态主窗口只从受控协议加载本地 Shell，所有非应用导航和权限请求默认拒绝。

**涉及文件：**

- 修改 `desktop/src/main.mjs`
- 修改 `desktop/src/config.mjs`
- 新增 `desktop/src/window/security-policy.mjs`
- 新增 `desktop/test/window-security-policy.test.mjs`
- 修改 `desktop/test/config.test.mjs`

**测试场景：**

1. 正式态只选择 `app://yuance/`；其他 `app://` host、环境变量、远端配置和 renderer 参数不能切换正式入口。
2. 开发态仅接受明确 allowlist 的 loopback dev origin，并继续隔离 `userData`/session；非 loopback HTTP 与任意 file URL 拒绝。
3. 顶层/子 frame 导航、同 scheme 非法 host、redirect、`window.open`、webview attach 和所有 permission 请求按矩阵拒绝；允许的 HTTPS 外链只交给系统浏览器。
4. BrowserWindow 安全不变量逐项断言，生产构建不能启用 DevTools 自动打开或禁用 web security。

**完成标准：** 正式态 `loadURL` 只接收固定 `app://` 入口，协议初始化失败不会回退远端页面。

### Unit 4：最小 preload bridge 与 IPC sender 校验

**目标：** renderer 只获得脱敏宿主/认证状态和有限命令，IPC 不能被 subframe 或伪造 sender 调用。

**涉及文件：**

- 修改 `desktop/src/preload.cjs`
- 新增 `desktop/src/ipc/sender-policy.mjs`
- 新增 `desktop/src/ipc/host-state.mjs`
- 新增 `desktop/test/preload-contract.test.mjs`
- 新增 `desktop/test/ipc-sender-policy.test.mjs`

**测试场景：**

1. bridge 对象冻结且带 schema version，只暴露状态快照、状态订阅和本切片批准的有限命令；无 token、header、URL、文件路径、任意 channel invoke。
2. handler 拒绝 subframe、非当前主窗口、已销毁/替换 webContents、非固定 host/path 和导航过渡中的 sender。
3. payload 拒绝未知字段、超长字符串、错误类型和原型污染键；返回值只含 allowlist 字段。
4. 窗口销毁、renderer reload 和订阅取消后 listener 全部清理，不重复推送或泄漏旧账户状态。

**完成标准：** preload 合约有独立 schema/负向测试，renderer 无法构造通用主进程调用。

### Unit 5：接入 credential coordinator 的脱敏状态

**目标：** 把已完成的主进程认证状态映射到本地 Shell，保持 credential 生命周期仍完全位于主进程。

**涉及文件：**

- 修改 `desktop/src/main.mjs`
- 修改 `desktop/src/auth/credential-coordinator.mjs`（仅在需要稳定状态订阅接口时）
- 新增 `desktop/src/auth/public-auth-state.mjs`
- 新增 `desktop/test/public-auth-state.test.mjs`
- 修改 `desktop/test/credential-coordinator.test.mjs`

**测试场景：**

1. coordinator 各状态映射到固定公开枚举，不透出 user/device/family ID 之外的敏感内部字段；错误信息经过 allowlist。
2. 启动恢复完成前 renderer 不误判 authenticated；locked/revoked/pending revocation 和 logout 顺序保持 fail closed。
3. reload、第二实例聚焦、窗口重建和 coordinator 状态变化只绑定当前窗口；迟到事件不覆盖新状态。
4. renderer bundle、IPC trace、日志 fixture 和 crash-like error 中不存在 access/refresh/device code、Authorization 或加密 record 内容。

**完成标准：** 本地 Shell 能正确呈现认证生命周期，但不能读取或转发 credential，也没有新增业务 API 权限。

### Unit 6：打包资源、构建验证与回退边界

**目标：** 将 renderer 与 manifest 纳入三平台构建，证明正式包断网可启动且资源不可被替换/遗漏。

**涉及文件：**

- 修改 `desktop/electron-builder.yml`
- 修改 `desktop/scripts/run-electron-builder.mjs`
- 新增 `desktop/scripts/build-renderer.mjs`
- 新增 `desktop/scripts/verify-app-bundle.mjs`
- 新增 `desktop/test/app-bundle-verification.test.mjs`
- 修改 `.github/workflows/desktop-security.yml`
- 修改 `.github/workflows/release-desktop.yml`

**测试场景：**

1. macOS、Windows、Linux bundle 都包含 renderer、manifest 和 preload，且不包含 source map、dev URL、测试 fixture 或未登记可执行脚本。
2. manifest 缺项、hash/字节数不符、额外 HTML/JS、入口丢失或 CSP 漂移使构建 Gate 失败。
3. 禁网环境启动正式 bundle，加载 `app://` Shell 并保持 `connect-src 'none'`；网络请求尝试被阻止并有非敏感诊断。
4. credential 泄漏扫描继续覆盖构建产物；现有 safeStorage、single-instance 和 device-auth headless 验证不回归。

**完成标准：** 三平台 CI 对同一正式构建执行本地 Shell smoke 与 bundle verifier，不能通过远端 Web 回退制造假阳性。

### Unit 7：端到端安全复核与计划收口

**目标：** 从干净构建证明协议、renderer、IPC、认证状态和打包边界形成闭环。

**涉及文件：**

- 新增 `desktop/test/app-protocol-electron-integration.test.mjs`
- 新增或修改 `desktop/scripts/smoke-app-protocol.mjs`
- 新增 `docs/reviews/YYYY-MM-DD-d1-app-protocol-secure-host-review.md`
- 修改本计划和父计划状态

**测试场景：**

1. 真实 Electron 进程启动 `app://`，断言主 frame URL、CSP、无远端请求、SPA route、reload 和构建资源加载。
2. 注入 traversal、非 manifest 资源、恶意导航、redirect、subframe IPC、`window.open`、permission 和伪造 payload，全部得到受控拒绝。
3. 真实 coordinator 的 unauthenticated、authenticated、locked、revoked 与重启恢复状态在 renderer 正确切换，renderer/capture 输出无 credential。
4. 开发态仍可显式启动独立 dev renderer；正式态忽略 dev 配置，且两者数据目录、session 与信任规则互不污染。

**完成标准：** 聚焦测试、根前端检查、Desktop 全量测试、credential 扫描、三平台 CI 和实际 bundle smoke 全部通过；review 记录平台证据和可接受残留项。

## 建议执行顺序与提交边界

按 Unit 1 至 Unit 7 串行执行。Unit 1-2 冻结可构建输入，Unit 3-5 建立运行期信任链，Unit 6 才修改正式打包，Unit 7 负责独立复核。每个 Unit 形成可单独解释和回滚的提交；发现协议、CSP 或 sender 模型无法在纯测试中证明时，不进入后续 Unit。

## 验证矩阵

计划执行期至少保持以下验证入口：

```bash
npm run check:frontend
npm --prefix desktop run check
npm --prefix desktop test
npm --prefix desktop run scan:credential-leaks
npm --prefix desktop run dist:ci -- --mac --arm64
npm --prefix desktop run scan:credential-leaks -- dist
```

CI 必须覆盖 macOS、Windows、Linux 的正式 bundle verifier 与 Electron `app://` smoke。平台能力差异须在 review 中逐项说明，不以 Node 单元测试替代真实 Electron 协议加载，也不以 macOS bundle 替代 Windows/Linux 路径语义。

## 回退策略

- Unit 1-5 可按提交回退，且在正式打包切换前不改变现有远端开发壳行为。
- 正式态切换后若 `app://` Gate 失败，回退整个发行候选版本；不能在同一正式版本运行期降级到远端 `/web`。
- 本切片不修改服务端认证 schema。若状态桥接发现 D1 credential contract 缺口，应回到 D1 计划补充实现与 review，而不是在 renderer 建立旁路。

## 风险与控制

- **协议被当作文件代理。** 只允许 manifest 映射，并同时验证规范化路径、realpath、文件类型与 hash。
- **`app://` origin 被过度信任。** IPC 还必须绑定当前主窗口和顶层 frame，导航状态变化时 fail closed。
- **共享层被 Desktop bridge 污染。** bridge 仅由 Desktop adapter 使用，共享 UI/use case 只依赖平台 contract。
- **CSP 为后续网络提前放宽。** 本切片固定 `connect-src 'none'`；D1-B 以独立 plan 和测试修改。
- **断网 Shell 被误称离线能力。** UI 和 review 明确只证明静态壳可启动，不提供缓存业务数据。
- **开发便利进入正式包。** dev server、DevTools、环境变量入口和远端回退均由 bundle verifier 阻止。

## 后续衔接

本计划 accepted 后，下一份可执行文档是 Desktop Network/SSE 子计划。其输入包括固定 `app://` origin、CSP 基线、sender policy、公开认证状态和 D1 credential coordinator；它不得反向让 renderer 获得 credential、任意 endpoint 或通用网络代理。
