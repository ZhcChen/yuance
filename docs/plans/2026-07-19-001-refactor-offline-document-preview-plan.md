---
title: refactor: 离线化文档预览与富文本文件卡统一升级
type: refactor
status: in_progress
date: 2026-07-19
origin: 用户口头确认：放弃 ONLYOFFICE，改为站内离线预览
---

# refactor: 离线化文档预览与富文本文件卡统一升级

## 概览

当前站内文档预览基于 ONLYOFFICE 外部服务，不符合“本项目内离线处理”的目标。本文将预览链路改为“应用服务本地处理 + 浏览器站内渲染”，并同步升级富文本编辑器和正文中的非媒体附件卡片样式，让 `pdf/docx/xlsx/pptx/txt/csv/json/md` 等文件在上传中、上传后和正文展示时保持统一的可视化表达。

## 问题范围

- 现有 `/preview` 页面依赖 `YUANCE_ONLYOFFICE_DOCUMENT_SERVER_URL`，缺少外部服务时只能报错。
- 富文本附件虽然已有统一文件卡，但不同格式没有独立视觉识别，用户很难快速区分 PDF、表格、演示、文本和压缩包。
- 当前工作项 / 评论 / 资料正文中的可预览文档，缺少完全站内的渲染方案。

## 需求追踪

- R1. 文档预览不得依赖外部在线预览服务。
- R2. PDF 直接站内预览。
- R3. TXT / LOG / MD / JSON / XML / YAML 等文本型文件站内直接渲染。
- R4. CSV 站内以表格方式渲染。
- R5. Office / OpenDocument 文件通过本地离线转换后预览，不泄露对象存储长期地址。
- R6. 富文本上传中和正文已发布态的文件卡片，需要按格式提供更清晰的视觉样式。
- R7. 保留现有“返回来源 / 上一份 / 下一份 / 下载原文件”交互。

## 范围边界

- 不实现在线编辑，只做只读预览。
- 不引入第三方 SaaS 文档预览服务。
- 不改动现有权限、附件上传、对象存储直传和下载鉴权模型。
- 不处理压缩包、二进制可执行文件等不可预览格式的正文内联渲染，仅保留文件卡能力。

## 上下文与调研

### 相关代码与模式

- `api/src/web/user/mod.rs` 已集中实现四类附件的 `download/preview` 路由，可继续复用鉴权和来源跳转。
- `api/templates/web/document_preview.html` 已经具备独立预览页 UI、来源返回、上一份/下一份和刷新入口，可在不改路由语义的前提下重做预览主体。
- `api/static/app.js` 已实现“预览文档”按钮跳到 `/preview` 页面，以及富文本附件上传、右键菜单、文件卡渲染与上传进度显示。
- `api/static/app.css` 已有富文本附件卡、正文附件卡和上传蒙层样式，是本次文件卡精细化升级的直接基础。
- `api/src/domains/storage.rs` 已提供测试内存存储读取、对象存储签名下载等能力，本次需要补足“服务端直接读取对象内容”的能力。
- `api/src/domains/files.rs` 已保证对象 key 使用 `uuid + 后缀` 命名，满足不暴露用户本地文件名作为对象 key 的要求。

### 外部参考

- PDF.js 官方预构建包支持在无 bundler 的浏览器环境中配置 `pdf.mjs` + `pdf.worker.mjs` 并通过 URL 加载 PDF。
- LibreOffice 官方支持 headless 模式将 Office 文档离线转换为 PDF，适合作为服务端预览转换管线。

## 关键技术决策

- **预览页继续复用 `/preview` 路由：** 保留现有来源跳转和文档切换能力，只替换内部渲染方式。
- **预览策略按文件类型分流：**
  - PDF：原文件直预览；
  - 文本：服务端读取后直接渲染；
  - CSV：服务端解析为表格；
  - Office / ODF：服务端本地转换为 PDF，再交给 PDF 预览页。
- **Office 统一转 PDF：** 不在前端直接解析 docx/xlsx/pptx，避免低保真和多套渲染逻辑。
- **转换结果落地缓存到 `data/preview-cache/`：** 以附件内容标识生成缓存 key，避免重复转换。
- **PDF 前端采用站内静态 PDF.js：** 不依赖 CDN，不依赖第三方服务。
- **富文本文件卡按格式分色：** 编辑态与展示态统一使用格式标识（如 `pdf/docx/xlsx/pptx/txt/csv/json/archive/file`）驱动样式。

## 总体技术设计

```mermaid
flowchart TB
  A[点击预览文档] --> B[/web ... /preview]
  B --> C{附件类型}
  C -->|pdf| D[原始 PDF 预览资源]
  C -->|txt md json xml yaml log| E[服务端读取文本并直接渲染]
  C -->|csv| F[服务端解析 CSV 表格]
  C -->|doc docx xls xlsx ppt pptx odt ods odp rtf| G[本地 LibreOffice headless 转 PDF]
  G --> H[preview-cache 命中/写入]
  H --> I[站内 PDF.js 预览]
  D --> I
```

## 实施单元

- [ ] **单元 1：离线预览后端基础能力**

  目标：补足对象内容读取、预览格式识别、文本/CSV 渲染和 Office 转 PDF 缓存能力。

  文件：
  - 修改：`api/src/domains/storage.rs`
  - 修改：`api/src/platform/config.rs`
  - 修改：`api/src/web/user/mod.rs`

- [ ] **单元 2：站内预览页重做**

  目标：保留现有预览页头部与导航，替换 ONLYOFFICE 主体为 PDF / 文本 / CSV 三种站内渲染模式。

  文件：
  - 修改：`api/templates/web/document_preview.html`
  - 新增：`api/static/vendor/pdfjs/*`
  - 修改：`api/src/web/router.rs`
  - 修改：`api/src/web/user/mod.rs`

- [ ] **单元 3：富文本与正文文件卡升级**

  目标：让编辑态和已发布态文件卡按格式拥有一致的图标、色带、说明和预览状态提示。

  文件：
  - 修改：`api/static/app.js`
  - 修改：`api/static/app.css`
  - 如有必要修改模板：`api/templates/web/partials/work_item_detail.html`、`api/templates/web/projects/resource_detail.html`

- [ ] **单元 4：文档与验证**

  目标：去除 ONLYOFFICE 运行手册口径，改为离线预览部署说明，并补充验证步骤。

  文件：
  - 修改：`docs/runbooks/production-deployment.md`
  - 如有需要新增：`docs/runbooks/document-preview-offline-validation.md`

## 风险与依赖

- **服务器未安装 LibreOffice：** Office 预览需要提示“离线转换组件未安装”，但 PDF/文本/CSV 预览不受影响。
- **大文本或大 CSV 文件：** 需要限定预览大小或行数，避免浏览器和模板渲染过载。
- **对象存储读取失败：** 应显示友好错误页，不得跳到 JSON。
- **当前工作区存在无关脏改动：** `api/src/domains/storage.rs` 存在非本轮格式化差异，实施时必须逐段审查并仅提交本轮逻辑。

## 验证策略

- Rust：
  - 预览类型识别单测；
  - Office 转换缓存 key / 文本解析 / CSV 解析单测；
  - 路由 smoke 或模板渲染测试。
- 手工：
  - PDF、TXT、CSV、DOCX、XLSX、PPTX 各验证一份；
  - 富文本内上传同类文件，观察上传中和发布后样式；
  - 验证“返回来源 / 上一份 / 下一份 / 下载原文件”不回归。
