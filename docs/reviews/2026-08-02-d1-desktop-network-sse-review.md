---
title: D1 Desktop Network 与 SSE 安全边界收口复核
type: review
status: accepted
date: 2026-08-02
---

# D1 Desktop Network 与 SSE 安全边界收口复核

## 目标对齐

复核 `docs/plans/2026-08-02-001-feat-d1-desktop-network-sse-plan.md` 的 R1-R19、AE1-AE5 与 U1-U8，确认正式 Electron 主进程通过固定 enrollment 建立受信 profile，使用 Device credential lease 执行受控 REST 与 fetch-stream SSE，并只向 `app://yuance` renderer 发布版本化、脱敏状态。本切片不开放普通业务 API、文件 transfer、生产发行或自动更新。

## 已执行验证

- `cargo test --manifest-path api/Cargo.toml`：API 全量通过。
- `npm run check:frontend`：共享 packages、Web 与 Desktop renderer 全量通过。
- `npm --prefix desktop run check`：Desktop JSDoc/checkJs、ESLint 与构建边界通过。
- `npm --prefix desktop test`：210 项通过，覆盖 enrollment、credential runtime、REST、SSE、IPC、生命周期和既有安全回归。
- 实际 macOS unpacked bundle 通过 `verify:bundle`、`smoke:app-protocol`、`smoke:desktop-network`、credential scan 与 cleanup artifact verifier。
- 本地正式包网络报告证明 authorization、restart recovery、Device Session probe、首次 SSE、rotation 后第二次 SSE 与 logout 全部通过；revoke HTTP response 到 EOF 为 30ms。
- `api/tests/device_sse_authorization_flow.rs` 使用 Rust 单调时钟证明 family/device/user/version 变化和 API graceful shutdown 均在 5 秒内关闭控制流。
- Desktop Security [运行 30718612505](https://github.com/ZhcChen/yuance/actions/runs/30718612505)：macOS、Windows、Linux 全部通过聚焦 API、Desktop checks/tests、unpacked build、ASAR verifier、`app://` smoke、packaged network smoke、凭证扫描、cleanup verifier 与平台 safeStorage Gate。

## 主要发现

### 已修正问题

- packaged network smoke 初版未在正常应用 composition root 中运行，且可能触碰正式凭证 service；已改为正式 bundle 的 authorize/verify 两阶段入口和独立 `Network Smoke` Keychain service。
- Electron streaming response 的 `Response.url` 可能为空；transport 现以受信请求 URL 完成严格响应绑定，不放宽 redirect、origin 或 credential policy。
- Linux 初版可能降级到 `basic_text` 凭证后端；CI 现启动临时 D-Bus 与 GNOME Keyring，并强制 `gnome_libsecret`。
- Windows 命名内存 SQLite URI 被误判为文件路径；数据库准备逻辑现结构化解析 `mode=memory`，并覆盖 query 顺序和反例。
- Windows Desktop fixture 使用 POSIX 路径拆分；测试替身现统一使用 `node:path`。

### 证据口径校准

- graceful shutdown 是 API 进程内部 signal 到流关闭的服务端性质，权威证据为 `api/tests/device_sse_authorization_flow.rs` 的同进程单调时钟测试。
- `desktop-network-smoke.json` 记录正式 Electron 与真实 API 跨进程链路中的 revoke HTTP response 到 EOF，作为端到端辅助证据。两类证据分别保持 5000ms 上限，不把无法观察服务端 signal 时刻的 packaged client 报告误写成 commit/signal 权威时间。

### 可接受残留项

- 当前 Device principal 仍只允许 Device Session control plane，不开放项目、工作项、通知和文件业务 API。
- 当前正式包是未签名验证制品；签名、公证、安装升级卸载、撤回与自动更新仍归属 G-DIST/G-UPDATE。
- D1-C 才建立文件 capability/transfer；renderer 继续无法取得路径、signed URL、Bearer、通用 fetch 或 Node 文件能力。

## 与计划的一致性

- enrollment 固定到构建内正式 origin；生产环境不能通过环境变量改变 endpoint，server instance 漂移 fail closed。
- 独立 Electron network partition 不使用 Cookie、HTTP auth cache或 renderer session；请求采用 `redirect: manual`，跨源和同源 redirect 均拒绝。
- credential coordinator、operation registry、SSE generation/profile epoch 与 suspend/resume 生命周期形成统一取消边界；旧响应和旧事件不发布。
- Browser/PAT/system token 语义和普通业务 API 的 Device 默认拒绝保持不变。
- renderer CSP 继续为 `connect-src 'none'`，preload 只暴露固定认证命令和脱敏网络快照/订阅。
- source、fixture、报告、日志、ASAR 与 unpacked 产物均纳入 credential scan；cleanup 证据证明临时 API 停止且 profile 删除。

## 回归与风险

- Web、共享前端、D1 credential、D1-A protocol/manifest、窗口导航权限、原生通知和单实例能力均由全量测试与三平台 Gate 覆盖。
- D1-C 必须复用 D1-B 的 profile、credential lease、operation registry、network partition 与 sender policy；不得以文件传输为由向 renderer 暴露通用 URL、header、路径或 fetch。
- D1-C 在 D2 之前只建立文件安全底座和 canary 闭环，不提前扩大 Device 业务 method/path allowlist。

## 结论

- 结论：通过。
- 下一阶段：D1-C 文件 Capability / Transfer。
