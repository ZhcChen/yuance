---
title: D2-U6 Desktop 消息与原生通知收口复核
type: review
status: accepted
date: 2026-08-03
---

# D2-U6 Desktop 消息与原生通知收口复核

## 目标对齐

复核 `docs/plans/2026-08-03-001-feat-d2-desktop-feature-parity-plan.md` 的 U6，以及 R14-R18、R20-R22。确认 Desktop 只消费版本化 SSE 业务事实；main 通过固定 notification operation 查询已验证 DTO，renderer 不能构造系统通知内容、URL、图标或行为。

## 已执行验证

- `cargo test --manifest-path api/Cargo.toml --test device_sse_authorization_flow --test device_business_parity_flow`：14 项通过，覆盖 Device SSE credential/epoch/目标用户隔离、revoke/rotation/expiry，以及普通业务权限矩阵。
- `npm --prefix desktop run check`：native、main、IPC、network、smoke source、renderer 类型检查、lint 与 production build 全部通过。
- `npm --prefix desktop run test`：343 项中 340 项通过、0 失败，3 项 Windows-only 在 macOS 明确跳过。
- `desktop-business-api-integration`：真实 API + Electron 完成 Device 授权、SSE、消息固定查询、前台抑制和业务读写矩阵；报告只保留布尔值与公共计数。
- `npm --prefix web run test:e2e`：19 项 Browser E2E 全部通过，消息中心 unread/read、语义 target 与 app-owner 内部跳转无回归。
- `npm --prefix desktop run pack:dir`、`verify:bundle -- dist` 与 `smoke:app-protocol`：最新 macOS arm64 unpacked 包、ASAR、bridge v7、共享 App、React 单例、manifest 和 CSP 全部通过。
- `npm --prefix desktop run smoke:desktop-network` 与 `verify:desktop-network-artifacts`：正式包报告包含 `credentialRestart: reauthorized`、`messageRefresh: true`、`releaseVersion: true`、`foregroundSuppressed: true`，revoke-to-EOF 为 30ms。
- `npm --prefix desktop run scan:credential-leaks -- dist/verification`：7 个报告与日志文件扫描通过。

## 主要发现

### 已修正问题

- API Device stream 原先没有复用用户 realtime 广播；现先发送 `connected`、`release-version`、`topbar connected`，并只把目标用户刷新映射为 `topbar refresh`。
- Desktop SSE client 和 coordinator 现只接收版本化 `topbar`、`release-version`，拒绝字段漂移、超长 version 和未知事件，并丢弃旧 generation 的迟到事实。
- 旧 `yuance:notify` 允许 renderer 提交 title、body 和 target；该 IPC、preload `notifications.show(payload)`、payload parser 与 normalizer 已全部删除。
- 新 notification controller 只调用 `notification.list`、`notification.target` 和 `notification.read`；以 credential epoch + notification ID 做短 TTL、有上限的去重。
- 通知点击先执行 restore、show、focus，再重新查询 target；未读时调用幂等 read，最终只发布共享 `notificationTargetPath(target, "app")` 生成的内部路径。403、404、删除或未知 target 回退消息中心。
- preload bridge 升级到 schema v7，只接受 `topbar`、`release-version`、`notification-target` 三类精确字段 fact；外链、额外字段和不符合共享 work-item 路由的路径均丢弃。
- credential runtime 重新初始化、logout/revoke、network invalidation、suspend、窗口销毁和退出都会失效 controller，并关闭尚存的原生通知。
- 修复了交错 credential 初始化可能由旧 generation 覆盖全局 notification controller 的竞态。

### 安全与行为结论

- 前台窗口始终先刷新站内消息，不投递系统通知；后台或最小化时同一 epoch + notification ID 最多投递一次。
- 系统不支持通知或系统级通知设置关闭时，原生投递可以无效果，但站内 `topbar` refresh 已在投递判断前发布，消息中心入口不受影响。controller 的 disabled/unsupported 测试冻结该降级语义。
- renderer 只订阅固定业务 fact；无法观察 raw SSE、credential epoch、通知 DTO、notification ID、标题、正文或点击 API。
- 点击路径不接受 renderer 或服务端 URL。main 只消费 operation registry 已验证的语义 target，共享函数只生成 `/web/app/messages` 或 `/web/app/work-items/...#comment-N`。
- 点击才标记单条已读；SSE 刷新和系统通知展示本身不调用 read。
- macOS 继续使用进程内随机 AES-256-GCM key，未使用 Keychain，也未向 credential runtime 注入 Electron `safeStorage`；正式包重启后重新授权。

## 测试场景映射

- 版本化 SSE、目标用户隔离、断线/rotation/revoke/expiry：API Device SSE tests、SSE client 与 network coordinator tests。
- 前台抑制、后台去重、unsupported/disabled、TTL/epoch/迟到查询：notification controller tests。
- 固定 target/read、comment hash、restore/show/focus、403/404 回退和重复点击：notification controller tests。
- 旧 channel 不存在、畸形 fact、伪造 URL/title/token 与 unsubscribe：preload contract、config source contract 和 renderer events tests。
- Browser 消息中心 parity：19 项 Browser E2E 中的 unread/read 与双 owner target 场景。
- 真实运行与制品：真实 API + Electron business integration、packaged network smoke、app-protocol smoke、ASAR verifier 和 credential leak scan。

## 可接受残留项

- 本地原生系统通知自动化不验证操作系统通知中心的可视像素或按钮；投递参数、点击 callback、不可用降级和生命周期由 main-only 单测与正式包事实链覆盖，跨平台手工证据留给 U7-U8。
- 本地正式包证据仅覆盖 macOS arm64；Ubuntu、Windows x64 与 Windows ARM64 由 U8 Gate 收口，不能据此宣称四平台完成。
- 长时间后台、通知风暴、低资源和系统通知权限 UI 的跨平台观察属于 U7 完整 parity E2E。
- D2 总计划仍有 U7-U8；本 review 不把 U6 完成扩展为总计划完成。

## 结论

- 结论：通过。
- U6 已满足单元 Definition of Done，可进入 U7。
- D2 总计划保持进行中；U7-U8 与全局 Definition of Done 尚未完成。
