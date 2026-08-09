---
title: Electron SPA 导航与 renderer readiness 边界
date: 2026-08-09
tags:
  - desktop
  - electron
  - spa
  - ipc
---

# Electron SPA 导航与 renderer readiness 边界

## 问题

Electron `webContents` 的 `did-start-navigation` 会同时报告跨文档导航和 same-document SPA 导航。若只把 event 对象传给 readiness 控制器，可能丢失回调参数中的 `isInPlace`，从而把 `pushState` 误判为新文档 generation，造成 IPC readiness 抖动或窗口显示计数漂移。

## 可靠做法

监听器显式接收并规范化导航参数：

```js
webContents.on("did-start-navigation", (_event, url, isInPlace, isMainFrame) => {
  readiness.didStart({ url, isInPlace, isMainFrame });
});
```

- `isInPlace === true`：保持当前文档 readiness，不重置 presentation generation。
- 受信主 frame 的跨文档导航：关闭 readiness，等待新文档 commit。
- 子 frame、外部 URL 与非规范路由：不得改变受信主文档 generation。
- packaged smoke 应分别记录 readiness 次数与跨文档导航次数，不能仅以最终 URL 推断是否 reload。

## 验证模式

- app protocol smoke：初始加载加一次显式 reload，应有 2 次跨文档导航和 2 次 readiness。
- feature parity smoke：多次 SPA 路由、登出与重授权后仍应只有 1 次跨文档导航。
- 单元测试同时覆盖 same-document 保持和真实跨文档 commit 后恢复。
