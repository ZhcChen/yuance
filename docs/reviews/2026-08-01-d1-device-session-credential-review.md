---
title: D1 设备会话与 Desktop 凭证收口复核
type: review
status: draft
date: 2026-08-01
---

# D1 设备会话与 Desktop 凭证收口复核

## 目标对齐

复核 `docs/plans/2026-08-01-001-feat-d1-device-session-credential-plan.md` 的 R1-R12 和 Unit 1-7，确认 Browser Cookie、PAT、system token 与 device session 保持隔离，并证明 Browser 批准、可恢复 exchange/refresh、撤销和 Desktop 主进程安全凭证生命周期形成闭环。

## 已执行验证

- 四组 device-session API integration：契约/迁移、Browser 批准与交换、access/probe/logout/撤销、refresh rotation。
- Browser Cookie 回归：`auth_csrf_refresh_flow` 与 `auth_security_flow`。
- API 全量 `cargo test`。
- Desktop `npm --prefix desktop run check` 与 `npm --prefix desktop test`，包含 client + coordinator 组合测试，以及真实 Electron 主进程、HTTP transport、`safeStorage`、重启恢复和 logout 集成。
- Electron `safeStorage` 与 OS single-instance smoke。
- 根 `npm run check:frontend`，确认现有 Web/共享前端边界不回归。
- `npm --prefix desktop run scan:credential-leaks` 扫描运行源码、脚本、fixture 与已有 `dist`；Release workflow 在构建后强制扫描打包产物。

## 主要发现

### 必须修正的问题

- 初次复核发现 pending revocation 可被新授权覆盖、并发撤销重试可能触发不同 transaction replay、logout 与迟到写盘存在竞态、Linux pending authorization 可能使用 `basic_text`、删除 backup 可能复活以及伪造 HTTP profile 可绕过 client 边界。均已通过状态门控、单飞、mutation queue、两阶段 tombstone、backend allowlist、完整 profile key 校验和故障注入测试修正。
- installation ID 原单次写入在强杀或 Windows 覆盖场景不可恢复，已改为 POSIX 原子替换与 Windows `.previous` 恢复协议。
- 初始 exchange 幂等密文原本只有清理函数、未接入运行期任务，已与 rotation 密文一起接入小时级清理循环。
- 真实 Electron 重启验证发现 access token 不落盘后直接 logout 无法在线撤销，已改为先持久化撤销标记并锁定请求，再以 refresh credential 获取一次短期 access 完成撤销。

### 可接受的残留项

- `.github/workflows/desktop-security.yml` 已配置 macOS/Windows/Linux 的 Desktop tests、泄漏扫描、真实 Electron `safeStorage` 与 single-instance smoke；当前结论保持 draft，等待本次推送的 matrix 结果。
- API integration 独立覆盖 Browser Cookie + CSRF 批准和真实服务端状态；Electron integration 使用真实主进程入口、loopback HTTP server、真实 `safeStorage` 与进程重启。人工 Browser 操作与部署现场强杀演练作为环境级补充，不冒充自动化证明。
- 发行 bundle 扫描 Gate 已写入 `release-desktop.yml`，但未创建发布 tag，因此当前只有 Gate 配置与本地已有 `dist` 扫描结果，不声称已有新发行包结果。
- 当前远端 Web renderer 不消费 device token，业务 API 也默认拒绝 device access。这是计划边界，不是功能缺失。

### 建议后续跟进

- 下一 D1 子计划只处理 `app://` 内置 renderer、安全导航、CSP、preload sender 和 composition root。
- Desktop SSE、文件 capability/transfer、发行签名和自动更新继续保持独立 Gate。

## 与计划的一致性

- 服务端实现独立 token namespace、server/device/family/generation 绑定、同 transaction 恢复与不同 transaction replay 撤销。
- Desktop access token 只在主进程内存，refresh 与 pending authorization 只进入加密、profile-bound 的原子 record。
- 未创建 renderer、`app://`、Desktop SSE、文件 transfer 或生产发行能力，范围没有向后续子域漂移。

## 回归与风险

- Browser Cookie、PAT scope、system token 和现有 Web 路径保持原认证语义。
- 后续 `app://` 或 Desktop network adapter 接入 coordinator 时，必须保留固定 endpoint、无 redirect、无 Cookie、单飞 refresh 和 logout fail-closed 约束。

## 结论

- 结论：本地实现与验证通过，等待三平台 Desktop Security workflow 后接受。
- 下一步：取得 CI matrix 证据，完成计划状态回填，再将本切片作为 `app://` 安全宿主 RFC 的认证输入。
