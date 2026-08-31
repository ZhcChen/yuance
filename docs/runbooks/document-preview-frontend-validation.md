# 文档预览 file-viewer 验证清单

## 目标

确认 `/preview` 页面已整体切换为 Flyfish File Viewer：

- PDF / DOCX / PPTX / XLSX / XLS / CSV / ODS / DOC / PPT / 文本均由同一预览器按需加载 renderer。
- 后端只负责权限、预览元信息和受控内容字节流，不再依赖旧 PDF.js、SheetJS、@silurus/ooxml 或 legacy 前端链路。
- 旧版 `doc/ppt` 默认可直接预览，不再依赖 `YUANCE_EXPERIMENTAL_LEGACY_PREVIEW_ENABLED`。

## 验证前提

- 本地或测试环境已启动最新 `yuance-api`。
- 至少准备 PDF、TXT/MD、XLSX、DOCX、PPTX、DOC、PPT 样本各 1 份，以及 `rtf` 等不支持格式 1 份。

## 验证步骤

1. 分别从工作项、评论附件、资料库正文点击各类文档“预览文档”。
2. 确认打开站内 `/preview` 页面，左侧保留文件操作和上一份/下一份/刷新/下载入口。
3. 确认正文区域出现 file-viewer 工具栏与渲染内容，加载完成后状态提示自动消失。
4. 对 PDF 验证缩放、搜索、页码导航可用；对 XLSX 验证工作表与网格滚动；对 DOCX/PPTX/DOC/PPT 验证正文或幻灯片可渲染。
5. 确认 `doc/ppt` 不再显示“实验性预览”标识或水印提示，也不要求环境开关。
6. 打开浏览器 Network 面板，确认只加载 `/static/vendor/file-viewer/*` 资源，旧 `/static/vendor/pdfjs/*`、`/static/vendor/sheetjs/*`、`/static/vendor/ooxml/*`、`/static/vendor/legacy-*/*` 不应出现。
7. 打开不支持格式，确认显示“当前无法预览”友好错误态，且“下载原文件”仍可用。
8. 关闭或保持 `YUANCE_EXPERIMENTAL_LEGACY_PREVIEW_ENABLED=false`，重复 `doc/ppt` 预览，确认入口与渲染不受影响。

## 结果判定

- 所有支持格式均通过 file-viewer 渲染，页面无 404、无白屏。
- `doc/ppt` 无实验语义、无开关门槛。
- 错误态保留下载兜底。
- 旧静态栈路由不再被浏览器请求。
