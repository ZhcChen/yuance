---
title: DOCX 与 PPTX 预览空白的 Office 容器高度修复
type: solution
status: active
date: 2026-07-28
---

# DOCX 与 PPTX 预览空白的 Office 容器高度修复

## 现象

打开 DOCX 或 PPTX 预览页后，状态显示文件已加载，但正文区域为空白。

## 根因

`api/static/document-preview.mjs` 使用 `DocxScrollViewer` 和 `PptxScrollViewer` 在 `.office-preview-stage` 中创建内部滚动容器。原样式依赖 `height: 100%`，但其父元素不是确定高度的百分比高度上下文，导致 stage 的可用高度仅为 padding，viewer wrapper 与 scroll host 的高度为 `0px`。

文件解析、签名访问地址、WASM 和页面 canvas 均可正常加载，因此问题表现为“已加载但不可见”。

## 修复原则

在 `api/templates/web/document_preview.html` 中仅调整 Office 预览容器：

- `.document-preview-host.is-office` 使用 flex 布局并允许子项收缩。
- `.office-preview-stage` 作为 flex 子项填充剩余高度，使用 `min-height: 0` 和 `height: auto`。

不要修改文本或表格预览的通用容器，以避免改变其内容溢出行为。

## 验证

使用 `textutil` 生成的最小 DOCX 样本，通过本地浏览器验证：

- 修复前：DOCX 解析为 2 页，但 stage 高度为 `36px`，viewer wrapper 和 scroll host 均为 `0px`。
- 修复后：stage、wrapper 和 scroll host 均有正高度，DOCX canvas 可见并可滚动。
- 在桌面和移动尺寸下均确认 canvas 含非白色像素。
- 运行 `cargo test -p yuance-api web_work_item_docx_preview_page_uses_frontend_preview_contract` 通过。

## 适用范围

该布局规则同时覆盖 DOCX 与 PPTX，因为二者共用 `renderOfficePreview` 和 `.office-preview-stage`。
