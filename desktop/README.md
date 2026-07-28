# 元策桌面端

## 运行态隔离

- `npm --prefix desktop run dev` 使用开发态：应用显示为 `元策 Dev`，持久化数据位于 macOS 的 `~/Library/Application Support/元策 Dev`；`sessionData` 位于其下的 `Session Data`。
- 正式打包应用使用 `元策` 的默认 Electron 数据目录，不会读取开发态的 Cookie、Local Storage、缓存或会话数据。
- `YUANCE_DESKTOP_CHANNEL=dev` 可将已打包的内部预览版也切换到开发态；正式发布包不得设置该变量。

## macOS 图标

- 正式包继续使用 `build/icon.icns`。
- 开发态在 Dock 中使用 `build/yuance-dev-dock.png`，图标右下角带橙色圆点，便于与正式版区分。
- `build/yuance-dock.png` 与开发图标都被作为运行时资源打入包内，支持内部已打包预览版。
