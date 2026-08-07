# Web 与 Desktop U1 共享视觉基础复核

## 结论

U1 已满足退出条件：Browser 与 Desktop 使用同一套 design token、全局导航和基础交互原语；宿主样式仅保留共享样式入口与必要 reset，没有形成宿主级视觉分叉。

## 复核范围

- 共享 design token：`frontend/packages/ui/src/styles.css`
- 共享全局导航：`frontend/packages/ui/src/global-navigation.jsx`
- 共享交互原语：`frontend/packages/ui/src/primitives.jsx`
- 共享应用壳：`frontend/packages/app-shell/src/app.jsx`
- Browser 样式入口：`web/src/app.css`
- Desktop 样式入口：`desktop/src/renderer/app.css`
- Desktop 主题偏好：`desktop/src/preferences/appearance-store.mjs`

## 观察结果

1. 颜色、间距、控件高度、圆角、阴影、深色模式和 motion token 由 UI package 唯一定义。
2. 全局导航的品牌、主导航、当前项目、搜索、消息 badge、账户菜单、主题切换和退出登录由同一 React 组件提供。
3. Button、Field、Feedback、Modal、DataTable、Pagination 和 Skeleton 由共享 UI package 提供，并覆盖 loading、disabled、validation、empty、边界分页和 reduced-motion 状态。
4. Browser 样式入口只导入共享 UI 与应用壳样式；Desktop 仅额外保留字体合成、盒模型和宿主根节点 reset。
5. Desktop 主题通过固定 IPC 和 `userData/Preferences/appearance.json` 原子持久化，不使用 renderer `localStorage`、macOS Keychain 或 Electron `safeStorage`。

## 验证证据

- UI package：22 项测试通过。
- App Shell package：4 项测试通过。
- Browser E2E：20 项通过，覆盖 390、768、1280、1440 有效宽度和 390 深色模式。
- Web production build：通过。
- Desktop renderer production build：通过。
- Desktop：395 项测试，392 项通过，3 项仅 Windows runner 跳过；`check:main` 通过。
- 宿主 CSS 颜色扫描：`web/src/app.css` 与 `desktop/src/renderer/app.css` 未发现独立十六进制或 `rgb()` 颜色定义。

## 允许差异

Desktop 保留宿主级 reset 和普通文件形式的非敏感主题偏好持久化；Browser 使用浏览器存储 adapter。两者不改变共享组件树、视觉 token 或交互语义，属于计划允许的宿主承载差异。

## 后续入口

U2 从共享 route model、身份状态、项目上下文和全局搜索开始，首先消除全局导航中的临时路径拼接，再补齐两宿主相同 route/context 的请求序列验证。
