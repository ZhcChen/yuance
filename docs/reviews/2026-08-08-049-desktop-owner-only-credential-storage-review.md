# Desktop owner-only 凭证存储复核

## 结论

通过。Desktop 生产运行时、测试脚本和 GitHub Actions 已不再导入或调用 Electron `safeStorage`，macOS 不访问 Keychain。device refresh credential 与待授权状态改用操作系统账号级文件权限保护的版本化文件，并保留原子替换、删除 tombstone、profile 绑定和 access token 禁止持久化约束。

## 变更范围

- `desktop/src/auth/credential-store.mjs`：主凭证使用 v2 owner-only 文件；POSIX 强制目录 `0700`、文件 `0600`，读取宽松权限时 fail closed。
- `desktop/src/auth/credential-coordinator.mjs`：待授权状态使用相同权限边界和原子恢复语义。
- `desktop/native/file-guard/`：新增 Windows 私有目录 DACL 操作，仅允许当前用户与 LocalSystem，并在目录身份漂移时 fail closed。
- `desktop/src/main.mjs`：删除 Electron `safeStorage`、macOS 临时 AES adapter 和旧 smoke 分支，统一注入 Windows 私有目录 guard。
- `.github/workflows/desktop-security.yml`、`.github/workflows/release-desktop.yml`：删除 keyring 安装、D-Bus 会话和 safeStorage smoke；保留跨平台完整 Desktop 测试与单实例 smoke。
- `desktop/test/support/real-api-fixture.mjs`：将已退役的存储 Web 表单调用迁移到正式 JSON API。

## 安全边界

- 文件内容不宣称静态加密；保护边界是当前 OS 用户账号的文件访问控制。
- renderer、preload、IPC、日志和业务响应仍不接触 refresh credential；access token 仍禁止落盘。
- Windows 缺少 native guard、binding 缺方法或 DACL 设置失败时，凭证运行时不能启用。
- 旧 `.enc.json` 不再解密；升级后没有 v2 凭证时进入重新授权流程。

## 验证

- `cargo fmt --manifest-path desktop/native/file-guard/Cargo.toml --check`
- `cargo test --manifest-path desktop/native/file-guard/Cargo.toml`：3 passed。
- `npm --prefix desktop run check`：通过。
- `npm --prefix desktop test`：455 tests，452 passed，3 个 Windows-only 用例在 macOS 跳过，0 failed。
- Electron headless 授权、重启恢复、撤销流程：通过。
- 真实 API 项目附件与上传下载 canary：通过。
- 全仓生产路径扫描：`desktop/src`、`desktop/scripts`、`.github/workflows` 和 `desktop/package.json` 无 `safeStorage`、`safe-storage`、`electron-safe-storage`、`gnome-keyring` 或 `dbus-run-session` 引用。

## 平台后续证据

Windows x64 与 ARM64 的真实 DACL 执行由 `Desktop Security` 和 tag 发布矩阵验证；本地 macOS 不能替代该平台证据，因此不把 Windows-only 测试的本地跳过计为已执行。
