---
title: 文档预览操作区侧栏化布局复核
type: review
status: completed
date: 2026-08-12
---

# 文档预览操作区侧栏化布局复核

## 结论

通过。文档预览页已从“顶部操作区 + 下方渲染区”调整为“左侧操作栏 + 右侧渲染区”，
文件标题、文件操作、查看工具统一收进左侧操作栏；PDF 保留右侧快速定位栏。Word 等
非 PDF 渲染区在同等缩放下获得完整页面高度，页面底部不再被横向工具条挤压。

## 改动内容

- `api/templates/web/document_preview.html`：移除顶部 `preview-head` 与
  `preview-panel-head` 两层横向工具条，改为 `preview-shell` 网格内的
  `preview-panel-rail`（标题/元信息、文件操作、查看工具）+ `preview-panel-body`
  （渲染区）。
- 错误页同样复用侧栏：左侧保留标题、元信息和文件操作，右侧显示错误说明。
- `api/static/document-preview.css`：
  - `preview-shell` 改为 `268px minmax(0, 1fr)` 两列布局，页面高度撑满视口；
  - 操作按钮和查看工具改为纵向排列，PDF 页码/缩放控件宽度占满操作栏；
  - 1180px 以下收窄操作栏为 236px；960px 以下操作栏回退为顶部横向布局，
    PDF 快速定位栏仍回退到渲染区下方。
- 未改动后端预览路由、PDF/Office 渲染逻辑与全部交互标记，`legacy-source-inventory`
  校验保持通过。

## 验证结果

- `cargo check -p yuance-api` 通过，Askama 模板可正常编译。
- `npm --prefix frontend run check`、`npm --prefix web run check` 通过，
  模板交互标记清单未漂移。
- 本地 `test` 环境 + 内存对象存储实测：
  - PDF 预览：视口 1200×823 时，左侧操作栏 268×795，渲染区 904×795，
    右侧 PDF 快速定位栏 248×795；
  - Word 预览：左侧操作栏 268×795，`document-preview-host` 渲染区 904×795，
    页面高度全部交给文档内容；
  - 文件操作（返回、上一份、下一份、刷新、下载）与查看工具（页码、跳转、
    缩放、页数/大小指标）均在左侧操作栏正常渲染。

## 验收步骤

1. 打开任意 PDF 附件预览，确认左侧为文件操作和查看工具，中间为 PDF 渲染区，
   右侧为快速定位栏。
2. 打开 Word/Excel/PPT/文本等非 PDF 附件预览，确认操作栏在左侧，文档渲染区
   占满剩余高度，缩放工具仍可用。
3. 缩小窗口到 960px 以下，确认操作栏回退到顶部且 PDF 快速定位栏移动到渲染区
   下方，页面不出现横向溢出。
4. 打开不支持预览的附件，确认左侧仍有文件操作，右侧显示错误说明。
