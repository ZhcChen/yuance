# Desktop 打包态体验一致性 Gate 收口复核

## 结论

通过。macOS arm64 正式打包目录已完成共享 React 业务矩阵、真实 API、设备授权、SSE、原生附件能力、窗口生命周期、受限 bridge、协议资源、bundle 边界和凭证泄漏扫描。此次复核修复的均为打包态 Gate 暴露出的正式实现或契约漂移，没有放宽验证条件。

## 关键修复

- 正式文件 runtime 现在装配 `previewVault` 与 owner-only `previewSpool`，启动时清理孤儿文件，并把二者交给预览状态与内容加载器；避免正式 Desktop 启动时引用未定义依赖。
- Desktop operation registry 接受共享富文本评论使用的 `bodyFormat: html`，评论正文上限与共享 API 契约统一为 20,000 字符，同时保留 `plain` 兼容路径并拒绝未知格式。
- 通知控制器接受凭证 runtime 的首个合法 epoch `0`，继续拒绝负数 epoch，首次 SSE `topbar` 与 `release-version` 不再被静默丢弃。
- macOS owner-only 文件凭证按正式能力验证重启恢复，network smoke 不再沿用旧的强制重新授权断言；旧成功报告在每次运行前删除，失败不会留下伪证据。
- app protocol smoke 与 restricted bridge 断言同步到 schema version 12 及完整语义能力集合。
- packaged UI smoke 改用共享富文本 `contenteditable`、真实键盘输入和当前可访问 DOM 契约；管理员写操作在 handoff 前完成，handoff 后成员通过隐藏编辑表单证明权限收紧。
- packaged smoke 的 SSE 空闲阈值恢复为正式 45 秒，避免 5 秒测试阈值把正常空闲连接误判为断线并替换业务页面。
- 连续 mutation 在业务 transport 静默后推进，避免 companion refresh 重建详情子树时覆盖下一项用户输入。

## 安全边界

- 未使用 macOS Keychain、Electron `safeStorage`、通用 renderer fetch、远程 BrowserWindow 或新增 IPC 后门。
- smoke 诊断只记录固定 operation 名、公开状态、有限 UI 文本和稳定错误字段，不记录请求正文、URL、token、credential 或本地私有路径。
- macOS 产物继续使用 ad-hoc 签名；本轮不改变 Windows 未签名和 Linux minisign 发行边界。

## 验证

- `npm --prefix desktop run check`：通过。
- `npm --prefix desktop test`：456 tests，453 passed，3 Windows-only skipped，0 failed。
- `npm --prefix desktop run pack:dir`：通过，macOS arm64 app 使用 ad-hoc 签名。
- `npm --prefix desktop run smoke:desktop-feature-parity -- dist`：通过。
- `npm --prefix desktop run verify:desktop-feature-parity-artifacts`：通过。
- `npm --prefix desktop run verify:bundle -- dist`：通过，ASAR 中 3 个 renderer resources 均受 manifest 约束。
- `npm --prefix desktop run smoke:app-protocol -- dist`：通过。
- `npm --prefix desktop run scan:credential-leaks -- dist`：通过，扫描 118 个打包文件。
- `git diff --check`：通过。

## 剩余边界

本地证据覆盖 macOS arm64。Windows x64、Windows ARM64、Linux x64、Linux ARM64 和 macOS x64 的同类 Gate 由 tag 触发的发行矩阵执行；未创建发行 tag，因此本次不声称已有这些平台的新远端产物证据。
