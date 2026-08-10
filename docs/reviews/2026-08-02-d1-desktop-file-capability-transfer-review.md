---
title: D1-C Desktop 文件 Capability 与受控传输收口复核
type: review
status: accepted
date: 2026-08-02
---

# D1-C Desktop 文件 Capability 与受控传输收口复核

## 目标对齐

复核 `docs/plans/2026-08-02-002-feat-d1-desktop-file-capability-transfer-plan.md` 的 R1-R19、F1-F4、AE1-AE5 与 U1-U8。确认 renderer 只持有不透明 capability 和脱敏状态；本地路径、文件 handle、transfer request、header 与 Device credential 均留在主进程；D1-C 只通过 Device-only canary 验证安全底座，不开放普通业务 API 或提前迁移 D2 业务 UI。

## 已执行验证

- `cargo test --manifest-path api/Cargo.toml`：API 全量通过，Device canary、principal matrix 与普通业务 API 默认拒绝边界保持通过。
- `npm run check:frontend`：共享契约、Browser adapter、Web 与 Desktop renderer 检查通过。
- `npm --prefix desktop run check`：Rust native、JSDoc/checkJs、ESLint、renderer build 与 source policy 通过。
- `npm --prefix desktop test`：Desktop 全量通过；macOS 本地结果为 285 项、282 通过、3 项 Windows-only 明确跳过。
- `npm --prefix desktop run verify:bundle -- dist`、`npm --prefix desktop run scan:credential-leaks`、macOS unpacked file smoke 与 artifact verifier 通过。
- Desktop Security [运行 30750970820](https://github.com/ZhcChen/yuance/actions/runs/30750970820)：macOS、Ubuntu、Windows x64、Windows ARM64 全部通过聚焦 API、Desktop check/test、unpacked build、ASAR verifier、协议/网络/文件 smoke、泄漏扫描、cleanup verifier 与平台凭证边界验证。

## 主要发现

### 已修正问题

- Linux Gate 现通过临时 D-Bus 与 GNOME Keyring 提供 `gnome_libsecret`，Electron 子进程显式使用 `--password-store=gnome-libsecret`，不再降级到不安全后端。
- Windows spool 使用受保护 DACL、no-follow/reparse 检查和稳定 file ID；Node/libuv fd 通过 `uv_get_osfhandle` 与 `DuplicateHandle` 转为独立 handle，避免跨 CRT fd fail-fast。
- Windows snapshot 与下载重验改用“精确路径 no-follow 重开 + direct-child + 稳定对象 identity”，不再因 8.3 short name 与规范路径字符串差异误拒绝。
- Windows 原子提交使用 root-directory handle 与 `FileRenameInformationEx`，覆盖新文件和已有目标替换，不采用 `unlink -> rename`。
- Windows ASAR fixture 按正式规则携带并 unpack 当前架构 native binding，native verifier 在子进程执行后释放 DLL，确保 fixture 可清理。
- POSIX 文件系统单测与真实 Windows native integration 明确分层；上传篡改测试使用确定性大小漂移，避免依赖文件系统时间戳分辨率。

### 平台凭证边界

- macOS 严禁使用 Keychain，也不向 credential composition 注入 Electron `safeStorage`。凭证仅由进程内随机 AES-256-GCM key 加密，key 不持久化；应用重启后旧密文 fail closed，用户必须重新授权。
- macOS native `safeStorage` smoke 明确返回 unavailable，CI 只执行无 Keychain 的单实例与 session-only 边界验证，不运行 native Keychain 路径。
- Linux 使用 `gnome_libsecret`；Windows 使用系统安全存储。两者的平台持久化能力不改变 macOS 的 session-only 结论。

### 可接受残留项

- D1-C 仍只提供固定 Device canary，不开放项目、工作项、资料库或附件业务 operation；这些属于 D2。
- macOS 不提供 credential restart persistence，这是明确的平台安全选择，不是已实现能力或待绕过限制。
- 当前制品用于安全验证，生产签名、公证、安装升级卸载、撤回与自动更新仍属于 G-DIST/G-UPDATE。

## 与计划的一致性

- R1-R5：原生对话框、私有 spool、短 TTL 单次 capability、sender/profile/purpose 绑定、配额与启动 cleanup 均有实现和负向测试。
- R6-R12：transfer grant 只从受信 API 合约创建；上传/下载流式执行、manual redirect、无 ambient credential、原子落盘与生命周期 abort 均已覆盖。
- R13-R17：preload/IPC 参数固定，renderer CSP 保持 `connect-src 'none'`，bundle verifier 与泄漏扫描拒绝路径、signed URL、header、Bearer 和 Node 文件能力。
- R18-R19：三平台四 runner Gate 覆盖 symlink/reparse、替换、取消、超时、redirect、配额、cleanup 与泄漏结论；Windows 使用真实 native integration，POSIX 使用 no-follow/symlink 证据。
- F1-F4 与 AE1-AE5 均由真实 API + Electron canary、正式包 smoke、攻击失败路径和 cleanup artifact 形成端到端证据。

## 回归与风险

- Browser 文件适配、D1 credential、D1-A protocol/manifest、D1-B network/SSE 和普通 API principal matrix 均由同一完整 Gate 覆盖，未发现明显回归。
- D2 必须复用现有 capability、grant、sender policy、operation registry 与 trusted network session，不得向 renderer 暴露业务 signed request、路径或通用 fetch。
- 后续若改变 Windows 最低支持版本，需重新确认 `FileRenameInformationEx` 支持矩阵；不得静默降级为非原子覆盖。

## 结论

- 结论：通过。
- D1-C 已满足 Definition of Done，可标记 `completed`。
- 下一阶段：D2 Desktop 业务功能对齐，且它是唯一下一 Desktop 子计划。
