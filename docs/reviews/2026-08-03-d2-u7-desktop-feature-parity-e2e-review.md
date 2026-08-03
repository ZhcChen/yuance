---
title: D2-U7 Desktop 业务对齐 E2E 与正式包复核
type: review
status: accepted
date: 2026-08-03
---

# D2-U7 Desktop 业务对齐 E2E 与正式包复核

## 目标对齐

复核 `docs/plans/2026-08-03-001-feat-d2-desktop-feature-parity-plan.md` 的 U7，以及 AE1-AE6、R20-R22。确认真实 API、真实 Electron session 与 macOS arm64 unpacked bundle 能通过公开 UI 和受限 bridge 完成首批业务闭环；测试未增加 renderer 通用后门，报告只保留布尔结论和有界公共指标。

## 已执行验证

- `npm run check:frontend` 与 `npm --prefix web run build`：Web、共享 packages、Desktop renderer 的边界、类型、lint、单测和 production build 全部通过。
- `cargo test --manifest-path api/Cargo.toml --test device_access_auth_flow --test device_business_parity_flow`：10 项通过，覆盖 Device 读写、成员关系、viewer 拒绝、撤销和附件签名生命周期。
- `npm --prefix web run test:e2e`：修复评论编辑焦点竞态后 19 项全部通过，覆盖协作、迟到响应、校验/服务端错误、附件、消息 target 和路由。
- `npm --prefix desktop run check`：native、main、IPC、network、smoke source、renderer 与 production renderer build 全部通过。
- `npm --prefix desktop test`：349 项中 346 项通过、0 失败，3 项 Windows-only 在 macOS 明确跳过。
- `npm --prefix desktop run pack:dir` 与 `npm --prefix desktop run smoke:desktop-feature-parity -- dist`：最新 macOS arm64 unpacked bundle 完成共享 UI、双用户授权、工作项协作、两类附件、消息 target、权限/校验/404、三轮真实 API 中断恢复和三轮 suspend/resume。
- `npm --prefix desktop run verify:desktop-feature-parity-artifacts`：聚合报告、9 个支持证据与 cleanup 契约通过。
- `npm --prefix desktop run scan:credential-leaks -- dist/verification`：10 个正式包报告和日志文件通过泄漏扫描。

## 正式包证据

### 业务与异常恢复

- 管理员通过正式包 UI 完成工作项详情、编辑、handoff、评论新增/编辑，以及工作项和评论附件上传、下载、受控定位。
- 第二个项目成员通过独立 Device authorization 进入消息中心，打开真实通知 target，导航至工作项详情并把焦点恢复到页面主标题。
- 正式包 UI 验证 403 权限拒绝、空白评论 validation、真实不存在工作项 404；失败后输入、按钮和焦点保持可恢复，404 后可返回有效详情。
- fixture 真实停止并重启 API 三次；每次网络状态进入 `offline` 后恢复 `online`。首次中断还验证宿主状态壳出现、业务写表单被清除且恢复按钮可用；恢复不自动重放写操作。
- 隐藏窗口执行三次 suspend/resume，恢复后重新读取可见数据。mutation uncertain、迟到响应和禁止自动重放继续由共享 app-core、Browser E2E、Desktop REST transport 与附件 coordinator 测试冻结。

### 文件、资源与清理

- 正式包 UI 使用 256 KiB 文件分别完成工作项和评论附件流式上传、下载与定位；D1/D2 回归另行覆盖取消、partial、uncertain、redirect、目标替换、源变化和生命周期 abort。
- 报告限制 Electron 进程数不超过 32、工作集不超过 1 GiB、总 CPU 不超过 3200%、profile 不超过 256 MiB；本次采样全部在预算内。
- 每次 smoke 无论成功或失败均停止 API child，并删除 profile、spool 和下载目录；最终报告要求 `activeOperations: 0`、`spoolFiles: 0`。
- 4 MiB 测试样本曾触发测试存储的 `attachment_upload_partial`，未作为成功证据，也未通过放宽生产边界掩盖；跨平台 Gate 的可复现压力样本固定为 256 KiB。

### 无障碍与宿主边界

- 正式包通过键盘 Tab 获得可交互焦点，通知 target、validation、评论编辑完成和宿主恢复均验证明确焦点目标。
- 最终共享页面包含唯一 `main` 和唯一 `h1`、live region、语义导航；等效自动检查拒绝重复 ID、无可访问名称的交互控件、缺失主 landmark 或标题。
- renderer bridge 只暴露版本化 `auth/business/events/files/hostState/network` 语义能力，通用 `invoke/request/fetch/openExternal/readFile/writeFile` 数量必须为 0。
- artifact scan 未发现 credential、signed request、对象键、本地路径或通用宿主能力。macOS 继续使用进程内随机 AES-256-GCM key，未使用 Keychain，也未向 credential runtime 注入 Electron `safeStorage`。

## 已修正问题

- packaged smoke 的若干 UI 点击曾在共享应用尚未完整恢复时被可选链静默跳过；现等待目标控件可交互，并在控件缺失时于最早步骤明确失败。
- SPA `pushState` 后 IPC sender 信任曾因只接受初始 URL 而拒绝合法业务操作；现 sender policy 继续绑定可信 `app://` origin，并接受经过路由规范化的当前文档 URL。
- Browser 评论编辑完成后，提前安排的按钮焦点会被 companion refresh 的标题焦点覆盖；现等待 mutation 与 companion refresh 完成后再恢复编辑按钮焦点。

## 可接受残留项

- 本地正式包运行证据仅为 macOS arm64。`.github/workflows/desktop-security.yml` 已让 macOS、Ubuntu、Windows x64、Windows ARM64 执行同一 D2 Gate，但四个远端 runner 的实际结果必须在 U8 复核，不能由本地结果替代。
- 资源检查采用有界公共指标和失败 Gate，不是 cgroup 或虚拟机级低资源隔离；更长后台驻留和平台通知交互由 U8 runner 与可审计手工证据补充。
- 256 KiB 压力样本证明流式链路而非业务 100 MiB 最大值；最大值校验、partial 和无自动重放已有分层测试，生产对象存储的最大文件验收不在本地 memory fixture 中宣称完成。
- Electron Builder 的 workspace dependency path 提示仍存在；bundle verifier 已证明共享 App、样式和 React 单例进入 ASAR，此提示不影响 U7 运行证据。

## 结论

- 结论：通过。
- U7 已满足单元 Definition of Done，可进入 U8 四平台 Gate、最终复核与主线回填。
- D2 总计划保持进行中；只有四平台 Gate 实际通过且最终 review accepted 后，才能标记 D2 completed。
