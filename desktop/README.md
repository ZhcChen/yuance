# 元策桌面端

## 运行态隔离

- `npm --prefix desktop run dev` 同时启动 Vite renderer 与 Electron 开发态：应用显示为 `元策 Dev`，持久化数据位于 macOS 的 `~/Library/Application Support/元策 Dev`；`sessionData` 位于其下的 `Session Data`。
- 正式打包应用使用 `元策` 的默认 Electron 数据目录，不会读取开发态的 Cookie、Local Storage、缓存或会话数据。
- 未打包运行可通过 `YUANCE_DESKTOP_RENDERER_URL` 指定带端口的 loopback renderer origin；一键开发命令会在该 HTTP origin 启动 Vite。正式打包应用无条件加载 `app://yuance/`，任何 channel 或环境变量都不能切换 renderer、安全策略与数据目录。

## macOS 图标

- 正式包继续使用 `build/icon.icns`。
- 开发态在 Dock 中使用 `build/yuance-dev-dock.png`，图标右下角带橙色圆点，便于与正式版区分。
- `build/yuance-dock.png` 与开发图标都被作为运行时资源打入包内。
