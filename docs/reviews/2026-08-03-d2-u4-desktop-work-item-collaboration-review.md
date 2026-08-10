---
title: D2-U4 Desktop 工作项协作收口复核
type: review
status: accepted
date: 2026-08-03
---

# D2-U4 Desktop 工作项协作收口复核

## 目标对齐

复核 `docs/plans/2026-08-03-001-feat-d2-desktop-feature-parity-plan.md` 的 U4，以及 R1、R4-R10、R19、R21-R22。确认 Desktop 通过共享 App、`app-core` 与 `api-client` 完成工作项编辑、handoff、评论新增/编辑和通知已读；renderer 只提交领域参数，不获得 URL、method、header、raw body 或 credential。

## 已执行验证

- `npm run check:frontend`：Web、共享 packages、Desktop renderer 类型检查、lint、单测与 production build 全部通过。
- `cargo test --manifest-path api/Cargo.toml --test device_access_auth_flow --test device_business_parity_flow`：10 项通过，覆盖 Device 普通业务读写、成员关系、viewer 写拒绝、撤销与附件签名权限边界。
- `npm --prefix desktop run check`：native、main、IPC、network、smoke source、renderer 检查通过。
- `npm --prefix desktop test`：307 项中 304 项通过，3 项 Windows-only 在 macOS 明确跳过；真实 API + Electron 完成读取、项目选择、工作项编辑、handoff、评论新增/编辑、通知已读和服务端回读。
- `npm --prefix web run test:e2e`：19 项 Browser E2E 全部通过，覆盖 mutation、companion refresh 失败、迟到响应、评论和项目切换。
- `npm --prefix desktop run pack:dir`：生成 macOS arm64 unpacked 包；真实 ASAR verifier 通过，确认 U4 写 operation、共享 mutation/uncertain UI、React 单例、manifest 与 CSP 进入制品。
- `node desktop/scripts/smoke-app-protocol.mjs desktop/dist/mac-arm64`：真实 unpacked `app://` smoke 通过，renderer 保持未授权状态壳、无外部请求、固定 CSP 与 schema version 4 bridge。

## 主要发现

### 已修正问题

- 写 operation 设为非幂等；401 不 refresh、不重放，断网、超时及响应读取/解析不确定统一映射为 `mutation_result_uncertain`。
- 403/404 保留确定性公共 code/status，不误报为 uncertain；所有负向场景均断言 transport 只调用一次。
- 共享 UI 对 uncertain 显示“结果待确认，请刷新检查”，并明确系统不会自动重试；其他 Browser/API 错误语义保持不变。
- 真实 Electron 集成不再止于读取，现通过 mutation 后详情与评论回读证明持久化，并限制报告只包含布尔值和计数。
- unpacked smoke verifier 原先仍要求 bridge schema version 3，与 U3 已发布的 version 4 漂移；现已修正并由真实包重验。
- ASAR verifier 现明确检查 U4 operation registry 与共享编辑、handoff、评论、uncertain 文案，避免仅凭共享 App 基础标记误判 feature 已打包。

### 安全与生命周期结论

- renderer 到 main 仍只有固定 `yuance:business-execute` channel；URL、method、header、raw body 与任意 request options 不跨 IPC。
- registry 独占 path、method 与 JSON body 构造，输入使用 operation-specific schema 和上限，响应经 DTO parser 丢弃未知字段。
- `app-core` 已冻结 mutation commit、迟到响应和 companion refresh 语义：过期 action 不更新当前页面，已提交 mutation 不因伴随刷新失败回滚。
- macOS 未使用 Keychain，也未向 credential runtime 注入 Electron `safeStorage`；集成驱动使用进程内随机 AES-256-GCM key，重启后仍按既定 session-only 语义重新授权。

## 可接受残留项

- Electron Builder 仍输出 workspace `file:` dependency path 提示；renderer 已由 Vite 打包，真实 ASAR verifier 已证明共享代码和 React 单例完整进入制品。该提示不改变当前运行与制品结论。
- 当前仅完成 U4。附件复合 operation 属于 U5，SSE 与原生通知属于 U6，完整 parity smoke、低资源与四平台 Gate 属于 U7-U8，均未在本复核中标记完成。
- 本地正式包证据仅覆盖 macOS arm64；Windows、Ubuntu 与 Windows ARM64 由 U8 统一 Gate 收口。

## 结论

- 结论：通过。
- U4 已满足单元 Definition of Done，可进入 U5。
- D2 总计划保持进行中，不得在 U5-U8 完成前标记 accepted 或 completed。
