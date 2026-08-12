---
title: Web 与 Desktop 附件图片/视频弹窗预览同步旧版复核
type: review
status: completed
date: 2026-08-12
---

# Web 与 Desktop 附件图片/视频弹窗预览同步旧版复核

## 结论

共享 `AttachmentPreview` 已按旧版 image-viewer 的样式与交互逻辑重构：
全屏深色舞台、底部圆形工具栏、滚轮缩放、双击切换、拖拽浏览、旋转、
长图适屏/适宽切换、加载失败降级均保持一致；视频保留原生播放器控制。
共享组件同时保留当前接入方需要的上一个/下一个、下载与关闭回调，未改变
`app-shell` 调用契约。

## 改动范围

- `frontend/packages/ui/src/attachment-preview.jsx`：重写为旧版 image-viewer 交互。
- `frontend/packages/ui/src/styles.css`：新增全屏预览与工具栏样式。
- `frontend/packages/ui/test/attachment-preview.test.mjs`：补充工具栏、视频与降级断言。

旧版参考实现位于退役前的 `8fa26fa`：
`api/templates/layouts/web.html`、`api/static/app.js`、`api/static/app.css`，
仅作为行为基准，不修改已退役的 `api/static` 文件。

## 行为证据

- 图片打开后按舞台视口计算适屏尺寸，长图额外计算适宽缩放。
- 滚轮缩放步进 0.18，工具栏按钮步进 0.25，缩放范围随长图动态调整。
- 双击在适屏/适宽（长图）或放大/还原（普通图）之间切换。
- 图片可旋转、可拖拽平移，边界按旋转后的渲染尺寸夹紧。
- 视频隐藏图片操作按钮，只保留导航、下载和关闭。
- 文档、不支持类型、API 错误和图片加载失败保留可操作降级。
- 图片/视频切换时清除旧缩放、旋转、位移与拖拽状态。

## 验证

```text
npm --prefix frontend/packages/ui run check
npm run check:frontend
```

结果：共享 UI 52 项测试全部通过；`check:frontend` 覆盖 Web、全部共享包、
Desktop renderer 检查与生产 bundle 构建，全部通过。

## 后续边界

- 预览前后项导航仍由 `app-shell` 服务端位置关系驱动，边界项禁用而非循环切换。
- 未做线上视觉验收；部署正式环境后需按实际附件入口复核图片/视频弹窗。
