---
title: D1 app protocol 安全宿主收口复核
type: review
status: accepted
date: 2026-08-02
---

# D1 `app://` 安全宿主收口复核

## 目标对齐

复核 `docs/plans/2026-08-01-002-feat-d1-app-protocol-secure-host-plan.md` 的 R1-R11 与 Unit 1-7，确认正式 Electron 包只加载经 manifest 校验的 `app://yuance/` renderer，并由 CSP、导航/权限策略、受信 IPC sender、脱敏认证状态和 ASAR verifier 形成闭环。本切片不开放业务 REST/SSE、文件 capability、生产签名或自动更新。

## 已执行验证

- `npm --prefix desktop run check`。
- `npm --prefix desktop test`：139 项通过，包含协议/manifest、窗口策略、preload/IPC、coordinator、renderer composition、ASAR verifier 和 smoke report 合约。
- `npm run check:frontend`：Web、四个共享 package 与 Desktop renderer 全部通过。
- `npm --prefix desktop run scan:credential-leaks`，并扫描实际 `desktop/dist`。
- macOS arm64 实际执行 `pack:dir`、`verify:bundle` 与 `smoke:app-protocol`；真实 executable 验证 CSP、SPA route/reload、JS/CSS ASAR 响应、400/403/404、恶意导航、`window.open`、permission、subframe sender、非法 payload、零外部网络请求、正式 partition 和隔离 profile。
- 开发态实际执行 `npm --prefix desktop run dev`，确认 loopback Vite renderer 与 Electron 使用独立 `元策 Dev` profile。
- Desktop Security [运行 30710401125](https://github.com/ZhcChen/yuance/actions/runs/30710401125)：macOS、Windows、Linux 全部通过 checks/tests、unpacked build、ASAR verifier、真实 `app://` smoke、凭证扫描和平台 smoke。
- 独立复核完成多轮负向审查；最终未发现高风险或中风险残留。

## 主要发现

### 必须修正的问题

- 初次复核发现 installer 与已验证 staging 不是同一次构建、外部请求未取消且观察窗口过短、CSP verifier 未证明响应绑定；已改为单次最终构建后验证、网络 fail closed、稳定窗口与 CSP/handler 绑定负向测试。
- Unit 7 初版 smoke 存在 permission timeout、subframe IPC、外部 scheme 计数和空白 UI 假阳性；已改为明确 permission 状态与 handler 计数、真实 `WebFrameMain` sender policy、主动 HTTPS 拒绝、完整 scheme 计数及 Shell/JS/CSS 强断言。
- 三平台 CI 暴露共享 frontend 依赖未安装、Linux 通知不可用时跳过 payload 校验、Windows ASAR entry 分隔符不兼容；均已修正并由运行 30710401125 复验。

### 可接受的残留项

- 正式 renderer 只端到端呈现 `unauthenticated`。authenticated、locked、revoked 和重启恢复由真实 coordinator/Electron integration 覆盖，但在缺少受信 endpoint enrollment 的本切片中不向 renderer 注入伪造状态；D1-B 建立 enrollment/network 边界后补齐联动。
- Windows runner 不具备普通 symlink 创建权限，源目录 symlink fixture 按既有平台约定跳过；Windows 实际 bundle 仍通过 ASAR regular-file、manifest、hash 和 unpacked 检查。
- 当前产物是 ad-hoc/未签名验证制品，不代表生产发行、安装升级卸载、签名、公证或自动更新已经完成。
- 本地 Shell 只证明断网可启动，不包含离线业务数据或业务网络能力。

### 建议后续跟进

- 下一计划只处理 D1-B Desktop Network/SSE：受信 enrollment/profile、主进程 Bearer REST、fetch-stream SSE、redirect/TLS/代理和撤销关闭边界。
- 文件 capability/transfer、D2 功能对齐、生产发行和自动更新继续保持独立 Gate。

## 与计划的一致性

- 正式态固定 `app://yuance/`，环境变量和 channel 注入不能切换 renderer、partition 或 profile。
- renderer manifest 按最终字节生成并进入 ASAR；运行期和 bundle verifier 均复算 hash/bytes，manifest 外资源和篡改 fail closed。
- CSP 保持 `connect-src 'none'`，renderer 无 credential、通用 fetch、Node 或文件路径能力；共享 package 不读取 Desktop bridge。
- Unit 7 认证场景按本计划既有“不实现 endpoint enrollment”边界校准为组合证据，没有扩大网络范围或加入测试后门。

## 回归与风险

- Web、共享前端、设备认证 coordinator、原生通知与单实例能力的既有测试均通过。
- D1-B 修改 CSP 与开放网络前，必须继续保留固定 endpoint、主进程持有 credential、无 Cookie/URL token、redirect fail closed 和 active stream 撤销约束。

## 结论

- 结论：通过。
- 下一步：进入沉淀，并规划 D1-B Desktop Network/SSE。
