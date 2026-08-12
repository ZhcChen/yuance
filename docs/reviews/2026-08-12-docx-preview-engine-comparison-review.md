# Review：docx 预览兼容问题与 docx-editor 对比

## 标题信息

- 主题：资料库 docx 预览兼容性评估与候选引擎对比
- 关联计划：`docs/plans/2026-07-19-001-refactor-offline-document-preview-plan.md`
- 审查范围：`api/static/document-preview.mjs`、`api/static/vendor/ooxml/`
- 负责人：Codex
- 日期：2026-08-12

## 目标对齐

复核用户反馈的两份 docx 预览报错：

- `numbering.bodyOffsetPt must be finite and non-negative`
- `Paragraph source boundaries must align with retained lines`

确认是否为当前 `@silurus/ooxml` 的兼容性问题，并对比用户提到的 `docx-editor`，给出可执行结论。

## 已执行验证

- 定位当前 vendored 版本：`@silurus/ooxml@0.73.2`（与 npm 0.73.2 的 `docx.mjs` 完全一致）。
- 定位报错来源：
  - `numbering.bodyOffsetPt`：编号标记几何校验，在布局阶段对编号 body offset 做有限/非负断言。
  - `Paragraph source boundaries...`：跨页段落保留行与 source boundary 不一致的布局不变量断言。
  - 结论：属于当前渲染引擎对复杂编号/跨页段落的兼容性 bug，不是文件损坏或权限问题。
- 对比最新版：`@silurus/ooxml@0.78.0`。
  - 0.78.0 已包含大量 docx 修复（编号、跨页、分页、兼容性等）。
  - 两个断言在 0.78.0 中仍存在，因此无法仅凭源码断定完全修复，需要原文件复测。
- 对比 `docx-editor`（eigenpal / `@docx-editor.dev/*`，当前 2.2.1）。
- 已执行聚焦验证：
  - `node --check api/static/document-preview.mjs`
  - `cargo test -p yuance-api --test routing_smoke static_ooxml_module_is_served_for_document_preview`
  - 两项均通过。

## 主要发现

### 当前引擎与 docx-editor 对比

| 维度 | `@silurus/ooxml` 0.78.0（当前） | `docx-editor`（`@docx-editor.dev/core` 2.2.1） |
| --- | --- | --- |
| 定位 | 只读 OOXML 查看器 | WYSIWYG DOCX 编辑器，支持 `mode='view'` 只读 |
| 架构 | Rust/WASM 解析 + Canvas 渲染 | DOM/ProseMirror 页面模型 + HarfBuzz 排版 |
| 格式 | docx / xlsx / pptx | 仅 docx |
| 包体 | docx 图约 4.0MB / gzip 1.2MB；全套约 12MB | core 约 4.9MB + i18n 约 1MB + fonts 约 7.7MB + react 约 1MB，依赖 ProseMirror/HarfBuzz 等 |
| 集成 | 静态 ESM + wasm，可直接 vendored，契合当前无 bundler 架构 | npm 多包 + 样式，若保持无 bundler 需要手工 vendor 大量依赖或引入构建步骤 |
| 能力 | 只读渲染、分页、图片、表格、页眉页脚、数学、图表、xlsx/pptx | 编辑、修订、批注、无损 round-trip、Agent API；docx 高保真排版是核心卖点 |
| License | MIT | core/react/vue/i18n/fonts 为 Apache-2.0；pro/editor-api 为商业评估许可 |
| 风险 | 复杂编号/跨页布局偶发内部断言失败 | 替换会失去 xlsx/pptx 渲染；接入成本高；对两份问题文件的效果尚未实测 |

### 已处理

- 增加 docx/pptx 预览友好降级：内部布局断言失败时显示“复杂版式请下载原文件”，不再直接暴露内部错误。
- 升级 `@silurus/ooxml` 0.73.2 -> 0.78.0，并兼容新版错误提示。

### 建议后续跟进

1. 用户提供两份问题 docx 原文件（或路径），用 0.78.0 复测。
2. 若仍失败，用 `docx-editor` core 的 `mode='view'` 做同文件 POC，确认是否真正解决。
3. 若 POC 有效，再评估 docx-only 双引擎方案：docx 走 `docx-editor`，xlsx/pptx 继续 `@silurus/ooxml`。
4. 切换前必须单独评审集成方式（静态 vendor vs 引入 bundler）和 License 边界（避免引入 pro/editor-api）。

## 与计划的一致性

- 符合既有“纯前端离线预览、不依赖后端转换”的方向。
- 不改变现有入口、权限和字节流链路。

## 回归与风险

- 已执行路由冒烟测试，docx.mjs 仍能由 `/static/vendor/ooxml/docx.mjs` 提供并导出 `DocxScrollViewer`。
- 尚未用真实文档做浏览器回归；升级后需重点抽查 docx/pptx 常规文件。
- `docx-editor` 切换属于架构决策，需用户确认后单独计划。

## 结论

- 结论：有条件通过。
- 下一步：等待两份问题文件复测；若仍失败，做 `docx-editor` 同文件 POC 后再决策。
