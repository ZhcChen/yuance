# Desktop 稳定 SPA 根壳复核

## 标题信息

- 主题：Desktop 稳定 SPA 根壳、首帧显示与 packaged 回归
- 关联计划：`docs/plans/2026-08-09-001-fix-desktop-stable-spa-shell-plan.md`
- 审查范围：U1-U4、R1-R13、AE1-AE5
- 负责人：Desktop、Shared Frontend
- 日期：2026-08-09

## 目标对齐

Desktop 保持单一 React root 和稳定顶层根壳；窗口同时等待 Chromium 与 React 可展示 stage；首帧同步使用持久化主题；授权、workspace、恢复、登出和重授权均在同一 `app://` 文档内完成。

## 已执行验证

- `npm --prefix desktop test`：469 项，466 通过，3 项仅 Windows runner 跳过。
- `npm --prefix desktop run check:main`、`check:renderer`、`check:smoke`：通过。
- `npm --prefix desktop run pack:dir`：macOS arm64 ad-hoc `元策.app` 构建成功。
- `npm --prefix desktop run verify:bundle`：ASAR 内 3 个 renderer 资源及 CSP、manifest 校验通过。
- `npm --prefix desktop run smoke:app-protocol`：light/dark 两次冷启动通过；每次均稳定进入 `authorization`，初始与显式 reload 各产生一次 readiness；stderr 无 appearance sender 拒绝。
- `npm --prefix desktop run smoke:desktop-feature-parity`：两次设备授权、workspace、业务读写与附件、三轮离线恢复、登出/重授权、焦点与 live region 全部通过；完整业务流程只有 1 次跨文档导航。
- `npm --prefix desktop run scan:credential-leaks`：226 个文件通过。
- 正式环境：`https://yuance.quanxinfu.com/api/healthz` 与 `/.well-known/yuance-desktop` 均返回 200，协议版本 1 与三项固定 capability 匹配。
- 窗口级截图：`.artifacts/desktop-stable-spa/production-window.png`，正式 profile 工作台非空且不存在状态壳叠加；本地证据不提交。

## 主要发现

### 必须修正的问题

- 旧 feature parity smoke 预期 workspace 离线时切换整页状态壳，与稳定 SPA 状态机冲突；已改为验证 workspace 根壳与业务树保持挂载。
- `did-start-navigation` 曾直接传递 event 对象，导致 same-document SPA 导航被计为新 generation；已改为显式传递回调的 `url`、`isInPlace`、`isMainFrame` 参数。

### 可接受的残留项

- renderer 主 chunk 约 622 KB，属于计划明确排除的后续性能拆包，不影响本轮正确性。
- Windows/Linux 本轮不在本机生成安装包；固定合同与 release workflow 平台矩阵测试保持有效。

## 与计划的一致性

- R1-R13：实现、聚焦测试、packaged smoke 与安全扫描均有对应证据。
- AE1/AE4：空 profile 的 light/dark 冷启动直接进入授权 stage。
- AE2/AE3/AE5：隔离 profile feature parity 覆盖授权恢复、离线恢复、登出和重授权，主文档不 reload。
- 未引入固定展示延时、远程 renderer、Keychain、`safeStorage`、renderer credential 或 sender policy 放宽。

## 回归与风险

- 未发现明显回归。
- 后续修改 Electron 导航监听时，必须区分 same-document 与跨文档导航，并用 packaged 报告中的导航计数复核。

## 结论

- 结论：通过
- 下一步：进入沉淀
