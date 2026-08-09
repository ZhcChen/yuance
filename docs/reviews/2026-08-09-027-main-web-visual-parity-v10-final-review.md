# main Web 视觉还原 V10 最终复核

## 结论

`main@6c0e56d` 视觉还原计划完成。30 项 visual contract 中 25 项为 `matched`，login、bootstrap、device authorization、shared app 和 public API docs 5 项按宿主职责登记为 `boundary-only`，无 `pending` 项。

Browser 与 Desktop 继续共用唯一 React `SharedApp` 和样式源。正式 System API docs、认证、初始化、设备授权、下载与 public API docs 保持独立 SSR/文档边界。macOS packaged app 使用 ad-hoc 签名，未引入 Keychain 或 `safeStorage`。

## V10 验证

- Rust bootstrap：11 条通过；设备授权：8 条通过；routing smoke：32 条通过。
- Browser History、导航、项目切换、错误恢复与四视口全局壳：10 条 E2E 通过。
- Desktop renderer 呈现状态、ready、events、composition、operation registry 与窗口安全：51 条通过。
- macOS arm64 目录包构建与 ad-hoc 签名通过。
- Packaged feature parity smoke 与 artifact verifier 通过，覆盖双账号设备授权、工作项/评论/附件 mutation、权限拒绝、校验错误、not-found 恢复、网络中断和窗口生命周期。

## 收口修复

- 更新 packaged smoke 的工作项列表、详情、编辑、handoff、消息入口、not-found 和刷新锚点，使其跟随当前可访问 DOM 与 SPA 导航合同。
- 补齐 `docs/runbooks/api-v1-contract.md` 中遗漏的 `GET /api/v1/dashboard`，router 与 runbook 双向完整性测试恢复通过。

## 命令

- `cargo test --manifest-path api/Cargo.toml --test bootstrap_flow`
- `cargo test --manifest-path api/Cargo.toml --test device_authorization_flow`
- `cargo test --manifest-path api/Cargo.toml --test routing_smoke`
- `npm --prefix web run test:e2e -- --grep "browser shell|global shell|navigation|project switch"`
- `node --test desktop/test/renderer-ready.test.mjs desktop/test/renderer-events.test.mjs desktop/test/renderer-presentation-state.test.mjs desktop/test/renderer-composition.test.mjs desktop/test/window-security-policy.test.mjs desktop/test/operation-registry.test.mjs`
- `npm --prefix desktop run pack:dir`
- `npm --prefix desktop run smoke:desktop-feature-parity -- dist`
- `npm --prefix desktop run verify:desktop-feature-parity-artifacts`
