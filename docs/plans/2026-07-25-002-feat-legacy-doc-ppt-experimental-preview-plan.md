---
title: feat: legacy doc/ppt 实验性纯前端预览方案
type: feat
status: in_progress
date: 2026-07-25
origin: 用户口头需求：继续评估并规划 doc/ppt 的纯前端离线预览接入
---

# feat: legacy doc/ppt 实验性纯前端预览方案

## Overview

在当前“后端只负责鉴权与临时访问地址、前端负责文档解析渲染”的新预览架构基础上，新增一条**隔离的实验性 legacy 预览链路**，专门评估并接入旧版 `doc` / `ppt` 文件的站内纯前端预览能力。该方案不替换当前 `pdf/text/sheet/docx/pptx` 稳定链路，也不恢复任何服务端 Office 转换依赖。

## 关联主线计划

- 主线计划：`docs/plans/2026-07-28-feat-web-desktop-shared-frontend-plan.md`
- 关系定位：本计划是主线计划下的“文档预览 / 附件体验”功能切片，负责把旧格式 `doc/ppt` 的实验性预览语义、入口矩阵和上线边界收口。
- 执行边界：本计划不合并进 Web/Desktop 共享前端主线的 W1-W4 或 D1-D4 阶段，不创建 `web/`、`frontend/`、Desktop renderer、device-session、SQLite 或离线同步能力；完成后只在主线计划中记录该切片已收口。

## Problem Frame

当前项目已经完成第一阶段纯前端预览收口：

- `pdf`
- `txt/log/md/json/xml/yaml/yml`
- `csv/xls/xlsx/ods`
- `docx/pptx`

都可以在站内完成浏览器侧预览。

但用户仍然存在旧格式文件场景：

- Word 旧二进制格式：`doc`
- PowerPoint 旧二进制格式：`ppt`

这些格式目前统一降级为下载原文件。用户希望继续评估是否可以像 `pdf.js` 一样，在**完全脱离后端转换依赖**的前提下，继续补齐这部分旧格式文档的浏览器侧预览体验。

本轮的核心不是立即承诺 `doc/ppt` 与 `docx/pptx` 一样稳定，而是定义：

1. 是否存在可落地的纯前端技术路线；
2. 如果要接入，应如何与现有稳定链路隔离；
3. 如何通过开关、灰度和降级策略，把风险控制在可接受范围内。

## Requirements Trace

- R1. 不恢复 `LibreOffice`、`soffice`、ONLYOFFICE 或任何服务端 Office 转换链路。
- R2. 当前稳定的 `pdf/text/sheet/docx/pptx` 预览体验不能被旧格式实验性接入破坏。
- R3. `doc/ppt` 若接入，必须走浏览器前端解析渲染。
- R4. `doc/ppt` 若解析失败，必须在站内预览页内友好降级为“下载原文件”，不能跳 JSON 或直接白屏。
- R5. 旧格式预览必须具备**独立开关**，可以在不影响其他格式的情况下快速关闭。
- R6. 预览入口、文件卡、右键菜单和 `/preview` 页的支持矩阵必须保持一致。
- R7. 旧格式属于实验性能力时，页面要能表达“实验性预览 / 兼容性有限”的产品语义。
- R8. `xls` 不走新实验链路，继续沿用现有 `SheetJS` 稳定方案。
- R9. 后端职责仍只保留：权限校验、审计、预览元信息下发、临时访问地址生成。

## Scope Boundaries

- 本轮只规划 `doc` / `ppt`；`xls` 不在本次变更范围内。
- 不做在线编辑，不做批注，不做转换后下载。
- 不承诺旧格式达到 Microsoft Office 原生级保真度。
- 不承诺首轮支持受密码保护、宏、嵌入对象、复杂图表、ActiveX、公式编辑器等高复杂度特性。
- 不引入浏览器内完整 Office 运行时（例如大型 WASM Office 套件）作为首选主方案。
- 不把旧格式实验性渲染直接作为默认稳定能力发布；首轮必须可灰度、可关闭。

## Context & Research

### Relevant Code and Patterns

- `api/src/web/user/mod.rs`
  - 已集中维护附件预览策略、预览元信息、来源回跳与上一份/下一份导航。
- `api/templates/web/document_preview.html`
  - 已统一为一个预览页壳层，适合继续承载不同文件类型的前端渲染宿主。
- `api/static/document-preview.mjs`
  - 已完成 PDF / 文本 / 表格 / DOCX / PPTX 的前端分流调度，是本轮接入 legacy 预览的唯一合适入口。
- `api/static/app.js`
  - 已维护文件类型识别、文件卡文案、右键菜单和预览入口判断，后续需与 `doc/ppt` 实验开关保持一致。
- `api/src/web/router.rs`
  - 已支持静态 vendored 前端预览资产挂载模式，可继续为新 renderer 暴露静态资源。
- `docs/plans/2026-07-19-001-refactor-offline-document-preview-plan.md`
  - 当前纯前端预览主链路已在该计划中完成，需要把 `doc/ppt` 视作第二阶段 follow-up，而不是重开一套体系。

### External References

- SheetJS 官方文档显示 CE 已稳定覆盖 `XLS/XLSX/ODS/CSV`，因此 `xls` 没有必要迁移到新实验链路：
  - `https://docs.sheetjs.com/docs/miscellany/formats`
  - `https://docs.sheetjs.com/docs/getting-started/installation/nodejs`
- `@silurus/ooxml` 官方站点面向的是 OOXML 文档族，适合 `docx/xlsx/pptx`，不覆盖旧二进制 `doc/ppt`：
  - `https://ooxml.silurus.dev/`
- Mammoth 的主流纯前端方案仅面向 `docx`，不适合作为 `doc` 补充方案：
  - `https://github.com/mwilliamson/mammoth.js/`
  - `https://github.com/mwilliamson/mammoth.js/issues/2`
- Flyfish File Viewer 官方文档展示了 `doc/ppt/xls` 等 legacy 格式支持矩阵，并提供按需 renderer 的接入方式，是当前最接近需求的浏览器侧路线：
  - `https://doc.file-viewer.app/guide/formats`
  - `https://doc.file-viewer.app/zh/guide/on-demand-renderers`
- 其公开 issue 中已经存在 `doc` 图片渲染相关兼容性问题，说明该路线可行但仍有明显边界风险：
  - `https://github.com/flyfish-dev/file-viewer/issues/87`
- LibreOffice WASM 路线存在，但包体、启动成本和集成复杂度明显高于当前业务系统预览需求，不适合作为首选：
  - `https://github.com/LibreOffice/core/blob/master/static/README.wasm.md`

## Key Technical Decisions

1. **`xls` 保持现状，不进入 legacy 实验链路。**
   - 当前 `xls/xlsx/ods/csv` 已由 `SheetJS` 稳定支持。
   - 重新引入另一条表格渲染链路只会增加维护复杂度。

2. **`doc/ppt` 只作为“实验性 legacy 预览”单独接入。**
   - 它们的技术成熟度与当前 `pdf.js / SheetJS / silurus/ooxml` 不在同一层级。
   - 必须与现有稳定链路隔离，不能直接混成统一“稳定支持”的语义。

3. **首选方案采用轻量级前端 renderer，而不是 Office WASM。**
   - 目标是项目管理系统内的只读浏览体验。
   - 浏览器内完整 Office 运行时过重，不适合当前产品边界。
   - 当前实际落地拆成两条：
     - `doc`：使用 `@file-viewer/doc`（MIT）本地解析为 `HTML + CSS`
     - `ppt`：使用 `@file-viewer/ppt` 公共水印运行时（前端本地 Wasm/Worker 渲染）

4. **legacy renderer 必须通过独立开关控制。**
   - 建议使用环境变量，例如 `YUANCE_EXPERIMENTAL_LEGACY_PREVIEW_ENABLED=false`。
   - 一旦兼容性或授权问题暴露，可以在不改其他格式逻辑的前提下直接关闭。

5. **保持现有后端边界不变。**
   - 后端仍只负责：
     - 权限校验
     - 审计
     - 预览元信息
     - 临时访问地址
   - 不新增服务端转换、预处理或中间缓存。

6. **降级优先级高于保真。**
   - 一旦 `doc/ppt` 解析失败、超时、初始化失败、浏览器 API 不支持或被 feature flag 关闭，统一回退到：
     - 站内错误态
     - 下载原文件
   - 不允许阻塞整个 `/preview` 页面。

7. **UI 语义上要明确“实验性”。**
   - 文件卡、右键菜单或预览页说明中，应清晰提示：
     - “实验性预览”
     - “复杂版式或图片可能存在兼容性差异”
   - 这样可以降低用户把旧格式能力误认为完全稳定的预期。

8. **旧版 PPT 的公开前端运行时存在水印与专有授权边界。**
   - 当前接入的 `@file-viewer/ppt` 可以前端离线预览，但公开运行时会带可见水印。
   - 该运行时允许以“未修改集成依赖”的方式分发，但不属于 Apache/MIT 开源许可。
   - 因此该能力必须继续保持实验性，并在文档与页面提示中明确其边界。

## High-Level Technical Design

```mermaid
flowchart TB
  A[点击 doc/ppt 预览入口] --> B[/web ... /preview]
  B --> C[后端鉴权 + 下发 preview_type 与临时访问地址]
  C --> D{legacy 实验开关}
  D -->|关闭| E[友好错误态 + 下载原文件]
  D -->|开启| F[document-preview.mjs 分流]
  F --> G[document-preview-legacy.mjs]
  G --> H[legacy renderer 解析 doc/ppt]
  H -->|成功| I[站内渲染 legacy 文档]
  H -->|失败| J[错误态 + 下载原文件]
```

## Implementation Status

- 2026-07-25 当前执行结果：
  - Unit 1：已完成
  - Unit 2：已完成
  - Unit 3：部分完成
    - 已同步 `app.js` 的 `doc/ppt` 预览识别矩阵
    - 仍需把“按钮是否展示”与 feature flag 做到完全一致
  - Unit 4：未开始

## Implementation Units

- [x] **Unit 1: legacy 支持矩阵与后端预览契约扩展**

**Goal:** 让后端能在不破坏现有格式的前提下，为 `doc/ppt` 下发受控的实验性预览元信息。

**Requirements:** R1, R3, R5, R8, R9

**Dependencies:** None

**Files:**
- Modify: `api/src/platform/config.rs`
- Modify: `api/src/web/user/mod.rs`
- Test: `api/tests/project_management_flow.rs`

**Approach:**
- 在配置层新增 legacy 预览 feature flag，例如：
  - `YUANCE_EXPERIMENTAL_LEGACY_PREVIEW_ENABLED`
- 调整 `attachment_preview_strategy` 与文件类型识别：
  - `xls` 继续映射到现有 `Spreadsheet`
  - `doc` / `ppt` 映射到新的实验性预览类型（如 `LegacyDoc` / `LegacyPpt`）
- 模板元信息中增加：
  - 是否实验性
  - 是否启用
  - 对应的提示文案
- 当开关关闭时，仍允许打开 `/preview` 页面，但展示明确的降级态而不是直接 404。

**Patterns to follow:**
- `api/src/web/user/mod.rs` 当前 `AttachmentPreviewStrategy` 与 `DocumentPreviewTemplate` 模式。
- `api/src/platform/config.rs` 现有配置解析方式。

**Test scenarios:**
- Happy path：开启开关时，`doc/ppt` 可进入 `/preview` 页面并拿到实验性元信息。
- Edge case：关闭开关时，`doc/ppt` 进入 `/preview` 后展示降级态。
- Regression：`xls` 仍走现有 `Spreadsheet` 路线，不误入 legacy 链路。

**Verification:**
- 后端仍不涉及 Office 转换。
- `/preview` 元信息能清晰区分 `doc/ppt` 实验性能力与稳定能力。

- [x] **Unit 2: 独立 legacy 前端预览模块接入**

**Goal:** 把 `doc/ppt` 的浏览器侧渲染独立到单独模块中，与当前主预览栈隔离。

**Requirements:** R2, R3, R4, R5, R6, R7

**Dependencies:** Unit 1

**Files:**
- Modify: `api/templates/web/document_preview.html`
- Modify: `api/static/document-preview.mjs`
- Add: `api/static/document-preview-legacy.mjs`
- Add: `api/static/vendor/legacy-doc/*`
- Add: `api/static/vendor/legacy-ppt/*`
- Modify: `api/src/web/router.rs`
- Test: `api/tests/routing_smoke.rs`

**Approach:**
- 在 `document-preview.mjs` 中只负责按 `preview_type` 分流，不直接把 legacy 解析逻辑写进主文件。
- 新增 `document-preview-legacy.mjs`：
  - 独立加载 legacy renderer
  - 统一处理加载中 / 解析失败 / 降级态
- vendor 资源单独放在 `api/static/vendor/legacy-preview/` 下，避免污染当前 `pdfjs/ooxml/sheetjs` 资产结构。
- 若渲染库要求额外 worker / wasm / css，也统一放进 legacy vendor 目录。

**Patterns to follow:**
- `api/static/document-preview.mjs` 当前 `pdf/text/spreadsheet/docx/pptx` 分流模式。
- `api/src/web/router.rs` 当前 vendored 静态资产路由模式。

**Test scenarios:**
- Happy path：legacy 开关开启且 renderer 初始化成功时，`doc/ppt` 可在站内完成首屏渲染。
- Error path：renderer 加载失败、解析失败时，页面展示统一错误态和下载按钮。
- Regression：PDF / 文本 / 表格 / DOCX / PPTX 的初始化路径不受影响。

**Verification:**
- 旧格式解析逻辑已从主预览栈隔离。
- 关闭 legacy 开关时，不会加载对应静态资产。

- [ ] **Unit 3: 文件卡、右键菜单与实验语义统一**

**Goal:** 让正文附件、编辑态文件卡、右键菜单与 `/preview` 页对 `doc/ppt` 的表达一致。

**Requirements:** R4, R5, R6, R7

**Dependencies:** Unit 1, Unit 2

**Files:**
- Modify: `api/static/app.js`
- Modify: `api/static/app.css`
- Modify: `api/templates/web/work_items/detail.html`
- Modify: `api/templates/web/partials/work_item_detail.html`
- Modify: `api/templates/web/projects/resource_detail.html`
- Test: `api/tests/project_management_flow.rs`

**Approach:**
- 文件卡支持矩阵中新增 `doc/ppt` 的实验性状态：
  - 开关开启：展示“实验性预览”入口
  - 开关关闭：只展示下载
- 右键菜单预览项也按同一开关控制。
- 文件卡或预览页说明区增加轻量提示文案，避免误导为稳定格式。

**Patterns to follow:**
- `api/static/app.js` 当前文件类型判断与预览入口分发逻辑。
- `api/static/app.css` 当前文件卡 badge / actions / rich attachment 视觉系统。

**Test scenarios:**
- Happy path：开关开启时，`doc/ppt` 文件卡能看到实验性预览入口。
- Edge case：开关关闭时，`doc/ppt` 不展示误导性预览按钮。
- Regression：`xls/docx/pptx` 的预览入口判断保持现状。

**Verification:**
- 正文文件卡、资料附件、右键菜单、预览页的 `doc/ppt` 语义一致。

- [ ] **Unit 4: 风险控制、授权评估与上线策略文档**

**Goal:** 把 legacy 预览的上线前提、授权边界和灰度策略文档化，避免直接当成稳定能力发布。

**Requirements:** R5, R7

**Dependencies:** Unit 1, Unit 2, Unit 3

**Files:**
- Modify: `docs/runbooks/document-preview-frontend-validation.md`
- Modify: `docs/runbooks/production-deployment.md`
- Add: `docs/runbooks/legacy-document-preview-rollout.md`

**Approach:**
- 在验证文档中单独新增 legacy `doc/ppt` 验证项：
  - 纯文本 doc
  - 带图片 doc
  - 简单 ppt
  - 复杂 ppt
- 在部署文档中补充：
  - legacy 开关配置方式
  - 默认关闭 / 灰度开启建议
- 新增专用 rollout 文档，明确：
  - 兼容性风险
  - 是否存在水印 / 授权限制
  - 出问题时的关闭手段

**Patterns to follow:**
- `docs/runbooks/document-preview-frontend-validation.md` 当前稳定格式验证结构。
- `docs/runbooks/production-deployment.md` 当前前端预览部署口径。

**Test scenarios:**
- Test expectation: none — 本单元以文档与运行手册更新为主，但需要与实际 feature flag 行为保持一致。

**Verification:**
- 上线文档明确写清 legacy 能力不是默认稳定支持。
- 运维能通过一个开关快速关闭 `doc/ppt` 实验性预览。

## Risks & Dependencies

- **兼容性风险：** `doc/ppt` 是旧二进制格式，复杂排版、图片、嵌入对象与动画可能表现不稳定。
- **授权/水印风险：** 若最终选定的 renderer 对某些格式存在商业授权或水印边界，必须在默认开启前彻底核清。
- **包体风险：** 新 renderer 可能显著增加静态资源体积，需坚持按需加载。
- **认知风险：** 若 UI 不强调“实验性”，用户会把 `doc/ppt` 误解为和 `docx/pptx` 同级稳定支持。
- **回归风险：** 任何对文件类型矩阵的调整都可能误伤当前 `xls/docx/pptx` 已稳定链路。

## Recommended Release Strategy

### Phase A：仅完成技术接入与本地验证

- 默认关闭开关
- 只在开发环境 / 指定测试环境开启
- 收集以下样本：
  - 纯文本 doc
  - 带图片 doc
  - 简单两页 ppt
  - 含图形与复杂背景的 ppt

### Phase B：灰度开放

- 正式环境仅对内部验证账号开启，或先统一开启但标注“实验性预览”
- 保持一键关闭开关
- 一旦发现：
  - 白屏
  - 卡死
  - 明显错误渲染
  - 授权 / 水印不可接受
  立即关闭开关并回退到下载

### Phase C：评估是否转正

转正前至少要满足：

- 主流 `doc/ppt` 样本可稳定首屏渲染
- 降级链路可靠
- 静态资源体积和首屏性能可接受
- 授权、商用和开源发布边界明确

## Verification

- `cargo test --test routing_smoke -- --nocapture`
- `cargo test --test project_management_flow -- --nocapture`
- `node --check api/static/document-preview.mjs`
- `git diff --check`

## Notes

- 这不是对 `docs/plans/2026-07-19-001-refactor-offline-document-preview-plan.md` 的推翻，而是其第二阶段扩展。
- 若后续验证发现 legacy renderer 在 `doc/ppt` 上的兼容性或授权成本不可接受，最终结论也可能是：
  - 继续维持 `doc/ppt` 下载策略
  - 在 UI 中更明确提示用户优先转换为 `docx/pptx`
