---
title: D2-U5 Desktop 业务附件收口复核
type: review
status: accepted
date: 2026-08-03
---

# D2-U5 Desktop 业务附件收口复核

## 目标对齐

复核 `docs/plans/2026-08-03-001-feat-d2-desktop-feature-parity-plan.md` 的 U5，以及 R11-R13、R17-R22。确认 Browser 与 Desktop 继续使用同一共享附件 UI 和 `app-core` 生命周期；Desktop renderer 只持有展示元数据、业务引用和不透明 capability，附件登记、签名、传输、确认、落盘路径与系统定位均留在 main。

## 已执行验证

- `npm run check:frontend`：Web、共享 packages、Desktop renderer 的类型检查、lint、单测与 production build 全部通过。
- `npm --prefix web run test:e2e`：19 项 Browser E2E 全部通过，包含工作项/评论附件上传下载、确认失败保留 pending 上下文、迟到 mutation 和焦点恢复。
- `cargo test --manifest-path api/Cargo.toml --test device_access_auth_flow --test device_business_parity_flow`：10 项通过，覆盖 Device 附件签名生命周期、成员关系、viewer 写拒绝和撤销。
- `cargo test --manifest-path api/Cargo.toml --test device_file_transfer_flow`：4 项通过，冻结 D1 canary grant、无 ambient credential 与 D2 route 共存边界。
- `npm --prefix desktop run check`：native、main、IPC、network、smoke source、renderer 与 bundle build 全部通过。
- `npm --prefix desktop run test`：335 项中 332 项通过、0 失败，3 项 Windows-only 在 macOS 明确跳过；真实 API + Electron 同时完成工作项和评论附件的选择、登记、签名、上传、确认、列表、下载、哈希、定位与取消。
- `npm --prefix desktop run pack:dir` 与 `npm --prefix desktop run verify:bundle -- dist`：最新 macOS arm64 unpacked ASAR 通过，确认附件 coordinator、registry、file IPC、reveal controller、共享 UI、React 单例、manifest 和固定 CSP 进入制品。
- `npm --prefix desktop run smoke:desktop-network -- dist`、`smoke:desktop-file-transfer -- dist`、`smoke:desktop-business-file -- dist`：最新 unpacked 包中的 D1 network、D1 file 与 U5 业务附件闭环全部通过。
- 三类 artifact verifier 全部通过；`npm --prefix desktop run scan:credential-leaks -- dist/verification` 扫描 7 个报告与日志文件通过。

## 主要发现

### 已修正问题

- `.txt` 原生选择曾产生 `text/plain; charset=utf-8`，而业务附件 API 拒绝参数化 MIME；现统一为 `text/plain`，D1 canary 与真实业务签名契约同步。
- 测试对象存储原先要求 Cookie/Bearer 与 CSRF，违背 transfer 层禁止 ambient credential 的边界；现由短 TTL 加密 grant 独立授权，并继续绑定对象键、携带签发用户身份和绝对过期时间。
- 成功下载原先缺少安全定位能力；现由 main 签发 `yrd_` 单次 capability，绑定 profile epoch、authorization version、webContents、frame 与 purpose，并在消费后重验文件 identity。
- renderer bundle 中的 Vite modulepreload polyfill曾带入通用 `fetch`；Desktop build 已禁用该 polyfill，ASAR verifier 现在拒绝 renderer/preload 中的通用网络、文件、外链、signed request 和本地路径能力。
- 旧 packaged network smoke 错误要求 macOS 跨重启恢复 credential；现明确验证 `credentialRestart: reauthorized`，证明进程内随机 AES-256-GCM key 失效后重新授权，不宣称持久化。

### 安全与生命周期结论

- 独立 attachment operation registry 仅存在于 main，不并入 renderer business registry；renderer 无法提交 URL、method、header、object key、路径或任意 transfer options。
- 上传严格按 `registering -> signing -> uploading -> confirming` 执行。登记不确定、部分上传和确认不确定使用不同公共错误，写操作不自动重放。
- 下载只接受服务端 `uploaded` 附件和服务端建议文件名；保存取消不消耗 grant，落盘后重验大小、SHA-256 与目标 identity。
- reveal capability 短 TTL、单次消费且绑定完整 sender/profile；目标缺失、替换、符号链接、目录、跨绑定、重放和过期均 fail closed。定位失败不回滚已完成下载。
- logout、profile epoch、authorization version、suspend、窗口销毁和 file runtime invalidation 会中止 operation 并清空 file/grant/reveal state。
- macOS 未使用 Keychain，也未向 credential runtime 注入 Electron `safeStorage`；正式包重启后显式重新授权。

## 测试场景映射

- 两类附件正向闭环：Browser 19 项 E2E、`desktop-business-file-integration` 与 packaged business-file smoke。
- partial/uncertain/confirm failure：`business-attachment-coordinator`、`rest-transport`、共享 `app-core` 与 Browser pending E2E。
- 非成员、viewer、撤销、未 uploaded：Device principal matrix、coordinator download 负向测试和 API 附件测试。
- sender/profile/purpose/重放/过期：file、grant、reveal vault 与 IPC sender policy 单测。
- redirect、超时、部分字节、源文件变化、目标替换、生命周期 abort：D1 upload/download executor、transfer contract、operation registry 与 file state 回归。
- 焦点与 live region：共享 UI/app-core 单测及 Browser 附件 E2E；系统文件管理器本身的平台可访问性留给 U7-U8 手工证据。
- 泄漏与制品：ASAR verifier、preload/renderer source tests、严格公共 smoke report 和 artifact leak scan。

## 可接受残留项

- 本地正式包证据仅覆盖 macOS arm64；Ubuntu、Windows x64 与 Windows ARM64 由 U8 同一 Gate 收口，不能据此宣称四平台完成。
- 大附件、低资源、长时间后台与量化 CPU/内存/磁盘预算属于 U7 的完整 parity E2E，不在本 checkpoint 中标记完成。
- Electron Builder 仍输出 workspace `file:` dependency path 提示；共享代码已由 Vite 打包，ASAR verifier 已证明共享 App 和 React 单例完整进入制品。
- SSE、消息中心与原生通知属于 U6；本复核不将附件完成扩展为 D2 总计划完成。

## 结论

- 结论：通过。
- U5 已满足单元 Definition of Done，可进入 U6。
- D2 总计划保持进行中；U6-U8 与全局 Definition of Done 尚未完成。
