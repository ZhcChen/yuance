# Review：文档预览栈整体替换为 Flyfish File Viewer

## 范围

- `api/static/document-preview.mjs` 从 PDF.js + SheetJS + @silurus/ooxml + legacy 四套链路
  替换为 `@file-viewer/web-full` IIFE + `mountViewer(buffer)` 统一接入。
- `/preview` 模板移除 PDF 专用工具条与侧栏，所有文档类型统一渲染为
  `data-document-preview-root`。
- 后端 `doc/ppt` 不再受 `YUANCE_EXPERIMENTAL_LEGACY_PREVIEW_ENABLED` 门槛控制，
  `is_experimental` 统一返回 `false`。
- 删除 `api/static/vendor/{pdfjs,ooxml,sheetjs,legacy-doc,legacy-ppt}` 与
  `document-preview-legacy.mjs`、旧路由和旧测试。

## 验证

- `node --check api/static/document-preview.mjs` 通过。
- `cargo check -p yuance-api` 通过。
- `cargo test -p yuance-api --test routing_smoke`：29 项全部通过，包含新
  file-viewer IIFE / renderer / runtime 资产路由与旧路由 404。
- `cargo test -p yuance-api --test project_management_flow preview`：5 项预览用例全部通过，
  覆盖 docx、legacy doc、legacy ppt、PDF content。
- `cargo test -p yuance-api --test device_business_parity_flow preview`：4 项全部通过，
  确认 legacy doc `content_enabled` 已变为 `true`。
- 本地 Python HTTP + Playwright 冒烟：PDF 与 XLSX 均触发 `load-complete`，
  shadow DOM 出现 file-viewer shell，状态提示消失，无资源 404。

## 说明

- `cargo test -p yuance-api --test project_management_flow` 全量执行时存在 5 个
  既有失败（demo seed 期望 3 个项目，当前 `seed_demo_data` 生成 12 个），与本次预览
  栈替换无关，属于 HEAD 已有不一致。

## 结论

通过。预览页已统一由 file-viewer 渲染，旧栈与实验开关语义移除。
