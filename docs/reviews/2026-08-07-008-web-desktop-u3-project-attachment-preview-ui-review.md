---
title: Web 与 Desktop U3 项目附件预览界面复核
type: review
status: completed
date: 2026-08-07
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U3 项目附件预览界面复核

## 结论

项目附件预览已接入唯一共享 React 页面。Browser 使用 API 返回的同源内容路径；Desktop 通过显式文件能力取得绑定当前 renderer 的 `app://yuance/.preview/<capability>`，共享层不识别宿主、不持有对象存储地址，也没有通用 `fetch` 后门。

本切片将项目附件预览及内容动作更新为 `shared`。项目详情页仍为 `in_progress`，资源和个人分析等 U3 后续切片尚未完成。

## 行为证据

- 项目文件列表为已上传附件提供相同的预览入口。
- 图片直接展示；视频使用支持 byte Range 的受控内容源；暂未内嵌渲染的文档和不支持类型保留明确下载降级。
- 前后项导航使用服务端返回的位置关系，快速切换时旧请求不能覆盖当前预览。
- 关闭、路由切换和组件卸载都会使请求失效；Desktop 同时释放预览 capability。
- Browser adapter 显式导出 `getProjectAttachmentPreview`，不暴露任意 API 请求。
- Desktop renderer 只接受与 capability 完全绑定的 `app://` source，拒绝外部或替换后的内容地址。

## 验证

```text
npm --prefix frontend/packages/app-shell run check
npm --prefix web run check
npm --prefix web run build
YUANCE_WEB_E2E_PORT=33048 npm --prefix web run test:e2e -- --grep "shared project files preview"
npm --prefix desktop run check:renderer
node --test desktop/test/renderer-composition.test.mjs desktop/test/file-commands.test.mjs desktop/test/preload-contract.test.mjs desktop/test/project-attachment-preview-coordinator.test.mjs desktop/test/preview-content-loader.test.mjs desktop/test/preview-capability-vault.test.mjs desktop/test/preview-protocol.test.mjs desktop/test/preview-spool.test.mjs
```

结果：共享 app-shell 4 项、Web 34 项、Browser E2E 1 项、Desktop 预览链路 37 项全部通过；Web 与 Desktop renderer 生产 bundle 构建成功。

## 后续边界

- PDF、文本、表格和 Office 文档的内嵌渲染属于 U3 预览增强后续切片；当前使用一致且可操作的下载降级，不将其记作已完成。
- 资源附件和工作项附件仍分别属于 U3、U5 后续迁移，不能复用本记录宣称完成。
- U3 完成前不退役整个项目详情旧模板，也不把 `page.project.detail` 更新为 `shared`。
