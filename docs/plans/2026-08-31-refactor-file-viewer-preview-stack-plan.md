---
title: refactor: 文档预览渲染栈整体替换为 Flyfish File Viewer
type: refactor
status: completed
date: 2026-08-31
origin: 用户口头确认：直接用 file-viewer 全部替换现有 pdf/docx/pptx/xlsx 预览栈
---

# refactor: 文档预览渲染栈整体替换为 Flyfish File Viewer

## Overview

把 `/preview` 页面现有的 PDF.js + SheetJS + @silurus/ooxml + legacy doc/ppt 四套预览链路统一替换为 `@file-viewer/web-full` 纯前端预览器。后端仍只负责权限、预览元信息和受控内容字节流，前端统一由 Flyfish File Viewer 按文件类型按需加载 renderer。

## Requirements Trace

- R1. PDF、DOCX、PPTX、XLSX 等现有可预览格式全部改由 file-viewer 渲染。
- R2. 旧版 DOC / PPT 不再受实验开关限制，纳入统一预览链路。
- R3. 后端不新增 Office 转换、不改变附件权限与受控下载语义。
- R4. 预览失败时保留友好错误态和“下载原文件”兜底。
- R5. 静态资产继续采用 `api/static/vendor/*` vendored 方式，不使用服务端构建。
- R6. 移除已不再使用的旧预览静态栈，避免继续携带 pdfjs/sheetjs/ooxml/legacy 资产。

## Key Technical Decisions

1. 使用 `@file-viewer/web-full` 的 IIFE 发行物 + 官方完整 `dist` 资产子集。
   - 主入口 `flyfish-file-viewer-web-full.iife.js`
   - 按需 renderer：`word/pdf/presentation/spreadsheet/text/image/media`
   - 运行时资产：`vendor/pdf`、`vendor/ppt`、`vendor/pptx`、`vendor/docx`、`vendor/xlsx`
   - 不复制 CAD/3D/Typst/Archive/Drawio 等与本项目预览矩阵无关的重资产。
2. `/preview` 模板不再区分 PDF 专用视图，统一走 `data-document-preview-root`，由 `mountViewer` 挂载。
3. 保留页面左侧导航、上一份/下一份、刷新、下载原文件；隐藏旧 PDF 工具栏，改用 file-viewer 自带工具栏（关闭内置下载，避免绕过审计下载入口）。
4. 后端 `legacy-doc/legacy-ppt` 改为始终可预览，不再以 `YUANCE_EXPERIMENTAL_LEGACY_PREVIEW_ENABLED` 作为入口门槛。
5. 清理旧静态栈 `pdfjs`、`ooxml`、`sheetjs`、`legacy-doc`、`legacy-ppt` 及 `document-preview-legacy.mjs` 对应路由与测试。

## Implementation Units

- [x] Unit 1: vendor Flyfish file-viewer 资产并新增 Rust 静态路由
- [x] Unit 2: `/preview` 模板与 `document-preview.mjs` 替换为 file-viewer
- [x] Unit 3: 后端 legacy doc/ppt 入口与实验语义收口
- [x] Unit 4: 删除旧预览静态栈、路由和引用
- [x] Unit 5: 测试、运行手册与部署文档更新
- [x] Unit 6: 本地浏览器验证与提交推送

## Verification

- `node --check api/static/document-preview.mjs`
- `cargo test -p yuance-api --test routing_smoke`
- `cargo test -p yuance-api --test project_management_flow` 中预览相关用例
- 本地静态服务下用 PDF/XLSX 样本验证 file-viewer 可加载并触发 `load-complete`
- 确认旧 vendor 路由返回 404 / 新 file-viewer 路由返回 200

## Risks

- 资产体积：office 子集约 37 MB，旧栈约 34 MB，净增有限。
- 旧版 PPT 公共运行时仍为专有水印运行时；替换后该格式默认可用，但渲染自带 Flyfish Viewer 水印。
- `@file-viewer/web-full` 按扩展名懒加载 renderer，缺失 renderer 脚本时需保证页面友好降级。
