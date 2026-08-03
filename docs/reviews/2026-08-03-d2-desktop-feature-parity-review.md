---
title: D2 Desktop 首批业务功能对齐最终复核
type: review
status: accepted
date: 2026-08-03
---

# D2 Desktop 首批业务功能对齐最终复核

## 结论

D2 通过，状态为 `accepted`。U1-U8 已按 `docs/plans/2026-08-03-001-feat-d2-desktop-feature-parity-plan.md` 完成；Browser 与 Desktop 共用同一 App、UI、`app-core` 与 `api-client`，Desktop 的网络、文件和通知差异均留在受限 adapter、preload 与 main。四平台 Desktop Security Gate 在提交 `eeb07a8f2c2763c79333a88b53bb9cd9136c1feb` 全绿，可以把主线 D2 标记为 `completed`。

## 四平台 Gate

同一 `.github/workflows/desktop-security.yml` 在四个 runner 执行 Desktop tests、unpacked build、ASAR/bundle verifier、协议 smoke、D2 feature-parity smoke、artifact verifier、泄漏扫描及平台安全边界：

| Runner | 结论 | Job |
|---|---|---|
| macOS | success | https://github.com/ZhcChen/yuance/actions/runs/30822259863/job/91714855308 |
| Ubuntu | success | https://github.com/ZhcChen/yuance/actions/runs/30822259863/job/91714855367 |
| Windows x64 | success | https://github.com/ZhcChen/yuance/actions/runs/30822259863/job/91714855276 |
| Windows ARM64 | success | https://github.com/ZhcChen/yuance/actions/runs/30822259863/job/91714855515 |

总 Run：https://github.com/ZhcChen/yuance/actions/runs/30822259863

## R1-R22 审计

| 要求 | 判定与证据 |
|---|---|
| R1-R5 共享应用与一致性 | 通过。共享 composition、路由、UI 状态和迟到响应规则由 U1、U4 及 19 项 Browser E2E 锁定；Desktop 没有第二套业务页面或 Electron JSX 分支。 |
| R6-R10 业务网络与权限 | 通过。版本化 operation registry、逐 operation schema、sender/frame/navigation/epoch 负向测试、Device principal matrix 和响应 DTO 上限均通过；renderer 不接触 URL、method、header 或 credential。 |
| R11-R13 文件与附件 | 通过。工作项和评论附件复用 D1-C capability、spool 与 transfer grant；登记、签名、上传、确认、落盘和定位均在 main，详见 `docs/reviews/2026-08-03-d2-u5-desktop-business-attachments-review.md`。 |
| R14-R16 SSE 与通知 | 通过。SSE fact allowlist、固定通知查询、epoch/TTL 去重、前台抑制、后台投递和语义 target 已覆盖，详见 `docs/reviews/2026-08-03-d2-u6-desktop-messages-notifications-review.md`。 |
| R17-R18 平台安全 | 通过。macOS 未使用 Keychain，未向 credential runtime 注入 Electron `safeStorage`，只使用进程内随机 AES-256-GCM key 并在重启后重新授权；Linux 仅接受安全 backend；CSP 保持 `connect-src 'none'`。 |
| R19-R22 parity、质量与状态 | 通过。Browser/Desktop 对成功、400/403/404、uncertain、附件阶段和通知 target 使用同一共享语义；正式包、资源、键盘焦点、live region、清理与四 runner Gate 均通过。 |

## F1-F6 与 AE1-AE6

- F1/F2、AE1：管理员与成员分别完成 Device authorization，共享应用读取用户、项目、消息和工作项；编辑、handoff、评论后由同一 API domain service 返回持久结果。
- F3/F4、AE3：工作项及评论附件完成选择、登记、签名、上传、确认、下载和单次定位；artifact、日志和 bridge 扫描无路径、对象键、signed request 或 credential。
- F5、AE6：受控 SSE fact 驱动消息刷新；macOS 使用 `packaged-sse` 证据，Linux/Windows 明确使用 `integration-fallback` 并由同 runner 的真实 Electron integration 补齐 topbar/release/notification 查询；通知 target 只进入内部语义路由。
- F6、AE4：logout、revoke、suspend、epoch 和文件 operation invalidation 均会中止活动工作并清空敏感业务状态。真实 network smoke 覆盖 SSE 断开、探针、refresh 与恢复；UI smoke 独立验证三轮公开 `offline -> online` 状态壳恢复，不自动重放 mutation。
- AE2：未知 operation、URL/header/path 注入、非可信 sender、subframe 和导航竞态均在副作用前拒绝，错误输出经过脱敏。
- AE5：macOS 正常业务、重启后重新授权和无 Keychain/`safeStorage` 边界由 macOS Gate 明确验证。

## Browser/Desktop Parity Matrix

| 能力 | Browser | Desktop | 允许差异 |
|---|---|---|---|
| 应用壳、项目、工作项与消息 | Cookie/CSRF、Browser router | Device lease、`app://` router | 仅认证恢复与宿主生命周期 |
| 编辑、handoff、评论 | 共享 use case/API client | 同一共享 use case，经固定 business operation | 无业务规则差异 |
| 附件 | Browser `File` 与 signed capability | 系统对话框、opaque capability、main transfer | 文件选择、保存和定位 |
| SSE 与通知 | Browser SSE、站内消息 | main fetch-stream SSE、站内消息和原生通知 | 原生投递、窗口恢复与聚焦 |
| 错误与恢复 | 共享 400/403/404/uncertain 状态 | 同一共享状态，宿主另有 locked/offline/reauthorization shell | 宿主状态入口 |

Browser 全量 E2E 19 项通过；Desktop feature parity 正向、权限、校验、404、生命周期和清理证据见 `docs/reviews/2026-08-03-d2-u7-desktop-feature-parity-e2e-review.md`。工作项协作 checkpoint 见 `docs/reviews/2026-08-03-d2-u4-desktop-work-item-collaboration-review.md`。

## 制品、安全、资源与无障碍

- ASAR 与 unpacked verifier 证明共享 App、样式、公开 package exports、协议 manifest、CSP 与 React 单例进入制品；Desktop renderer 不加载生产 `/web` 页面。
- source、fixture、report、ASAR 和 unpacked artifact 扫描未发现 Bearer、refresh credential、signed URL/header、对象键、本地路径或通用网络/文件 bridge。
- smoke 报告只保存布尔结果和有界公共指标；Electron 进程数、工作集、CPU、profile、活动 operation、spool 和报告大小均受 verifier 限制，结束时 `activeOperations=0`、`spoolFiles=0`。
- 共享页面保持唯一 `main`/`h1`、语义导航、可访问名称和 live region；键盘路径、编辑/校验/通知跳转/文件操作后的焦点恢复由 Browser 与正式包 smoke 覆盖。
- 系统通知、凭证 backend、文件操作或网络不可用时均保留站内入口、重新授权或明确公共错误，不静默降级为不安全能力。

## U1-U8 与残留边界

- U1-U3 已完成共享 composition、Device principal route matrix 和受限 business transport。
- U4-U7 的独立 accepted checkpoint 已覆盖协作、附件、消息通知和正式包 E2E。
- U8 已完成四 runner Gate、平台差异记录、最终复核与主线回填。
- G-DIST、自动更新、资料库/项目详情等后续 W3，以及 D3/D4 离线能力不属于 D2；这些工作保持独立计划，不影响本次 accepted 结论。

## 最终判定

- R1-R22、F1-F6、AE1-AE6 与 U1-U8 均有实现、测试或 checkpoint 证据。
- 未保留 API stop/start 临时 IPC、ack 文件、调试诊断或 renderer 测试后门。
- D2 Definition of Done 已满足；主线 D2 可以更新为 `completed`。
